/* The site is static except for these few paths. Everything else falls
   through to the files in ./public exactly as before — the Worker is here to
   hold accounts and the sync endpoint, not to render anything. */

const COOKIE = "vsid";
const DAY = 86400;

/* ---------------------------------------------------------------- helpers */

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "content-type": "application/json; charset=utf-8",
               "cache-control": "no-store" },
  });

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

/* A signed cookie rather than a sessions table: there is nothing to look up,
   nothing to clean out, and a stolen database row cannot forge one. */
async function sign(secret, userId) {
  const body = `${userId}.${Math.floor(Date.now() / 1000) + 30 * DAY}`;
  return `${body}.${await hmac(secret, body)}`;
}

async function verify(secret, token) {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const body = token.slice(0, i);
  /* Compared as whole strings, not byte by byte with an early exit. */
  if (await hmac(secret, body) !== token.slice(i + 1)) return null;
  const [userId, exp] = body.split(".");
  if (!userId || Number(exp) < Math.floor(Date.now() / 1000)) return null;
  return userId;
}

function cookieOf(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

const setCookie = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

/* ---------------------------------------------------------------- oauth */

/* Google matches the redirect_uri against the registered one character for
   character, so the scheme cannot be taken on trust: a request arriving as
   http would build a URI that is not the one registered, and sign-in would
   fail with a mismatch. Everything but a local dev host is https. */
function origin(req) {
  const u = new URL(req.url);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  return `${local ? "http" : "https"}://${u.host}`;
}

const noStore = (location, extra = []) => {
  const h = new Headers({ location, "cache-control": "no-store, no-cache, must-revalidate" });
  for (const c of extra) h.append("set-cookie", c);
  return new Response(null, { status: 302, headers: h });
};

function authStart(req, env) {
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", `${origin(req)}/auth/callback`);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "select_account");
  return new Response(null, {
    status: 302,
    headers: {
      location: u.toString(),
      /* Never stored. Each redirect carries a fresh state, and a browser that
         kept one would replay a dead sign-in — or, worse, keep serving the
         404 this path returned before the Worker existed. */
      "cache-control": "no-store, no-cache, must-revalidate",
      /* The state is held in its own short-lived cookie and checked on the
         way back, so a link someone else crafted cannot complete a sign-in. */
      "set-cookie": `vstate=${state}; Path=/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

async function authCallback(req, env) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  if (!code || !state || state !== cookieOf(req, "vstate")) {
    return noStore(`${origin(req)}/vocab/?signin=failed`);
  }

  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: `${origin(req)}/auth/callback`,
    grant_type: "authorization_code",
  });
  const tok = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  }).then((r) => r.json()).catch(() => null);
  if (!tok || !tok.id_token) {
    return noStore(`${origin(req)}/vocab/?signin=failed`);
  }

  /* The id_token comes straight from Google's token endpoint over TLS in
     response to our own secret, so its claims can be read without a second
     round trip to verify the signature. */
  let claims;
  try {
    const part = tok.id_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(atob(part.padEnd(part.length + (4 - part.length % 4) % 4, "=")));
  } catch { claims = null; }
  if (!claims || !claims.sub || claims.aud !== env.GOOGLE_CLIENT_ID) {
    return noStore(`${origin(req)}/vocab/?signin=failed`);
  }

  const existing = await env.vocab
    .prepare("SELECT id FROM users WHERE sub = ?").bind(claims.sub).first();
  let userId = existing && existing.id;
  if (!userId) {
    userId = crypto.randomUUID();
    await env.vocab.prepare(
      "INSERT INTO users (id, sub, email, created) VALUES (?, ?, ?, ?)")
      .bind(userId, claims.sub, claims.email || "", new Date().toISOString()).run();
  } else if (claims.email) {
    await env.vocab.prepare("UPDATE users SET email = ? WHERE id = ?")
      .bind(claims.email, userId).run();
  }

  return noStore(`${origin(req)}/vocab/?signin=ok`, [
    setCookie(await sign(env.SESSION_SECRET, userId), 30 * DAY),
    "vstate=; Path=/auth; Max-Age=0",
  ]);
}

/* ---------------------------------------------------------------- sync */

async function whoami(req, env) {
  const id = await verify(env.SESSION_SECRET, cookieOf(req, COOKIE));
  if (!id) return json({ signedIn: false });
  const row = await env.vocab.prepare("SELECT email FROM users WHERE id = ?")
    .bind(id).first();
  return json({ signedIn: true, email: (row && row.email) || "" });
}

/* The whole list goes up, the merged whole list comes back. A few hundred
   words is a few tens of kilobytes; being clever about deltas would buy
   nothing and would be one more thing to get wrong. */
async function sync(req, env) {
  const userId = await verify(env.SESSION_SECRET, cookieOf(req, COOKIE));
  if (!userId) return json({ error: "signed out" }, 401);

  let incoming;
  try { incoming = await req.json(); } catch { return json({ error: "bad body" }, 400); }
  const mine = Array.isArray(incoming && incoming.words) ? incoming.words : [];
  if (mine.length > 20000) return json({ error: "too many words" }, 413);

  const theirs = await env.vocab
    .prepare("SELECT word_id, body, updated, deleted FROM words WHERE user_id = ?")
    .bind(userId).all();

  const server = new Map();
  for (const r of theirs.results || []) server.set(r.word_id, r);

  const writes = [];
  for (const w of mine) {
    if (!w || typeof w.id !== "string" || !w.id) continue;
    const updated = Number(w.updated) || 0;
    const was = server.get(w.id);
    if (was && Number(was.updated) >= updated) continue;   /* server is newer */
    const deleted = w.deleted ? 1 : 0;
    writes.push(env.vocab.prepare(
      `INSERT INTO words (user_id, word_id, body, updated, deleted)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, word_id) DO UPDATE SET
         body = excluded.body, updated = excluded.updated, deleted = excluded.deleted`)
      .bind(userId, w.id, JSON.stringify(w), updated, deleted));
    server.set(w.id, { word_id: w.id, body: JSON.stringify(w), updated, deleted });
  }
  if (writes.length) await env.vocab.batch(writes);

  const out = [];
  for (const r of server.values()) {
    if (r.deleted) { out.push({ id: r.word_id, deleted: true, updated: Number(r.updated) }); continue; }
    try { out.push(JSON.parse(r.body)); } catch { /* skip a row we cannot read */ }
  }
  return json({ words: out, at: Date.now() });
}

/* ---------------------------------------------------------------- router */

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;

    if (path === "/auth/start") return authStart(req, env);
    if (path === "/auth/callback") return authCallback(req, env);
    if (path === "/auth/me") return whoami(req, env);
    if (path === "/auth/signout") {
      return noStore("/vocab/", [setCookie("", 0)]);
    }
    if (path === "/api/sync" && req.method === "POST") return sync(req, env);

    return env.ASSETS.fetch(req);
  },
};
