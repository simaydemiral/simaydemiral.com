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
    return noStore(`${origin(req)}/flashcards/?signin=failed`);
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
    return noStore(`${origin(req)}/flashcards/?signin=failed`);
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
    return noStore(`${origin(req)}/flashcards/?signin=failed`);
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

  return noStore(`${origin(req)}/flashcards/?signin=ok`, [
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

/* ------------------------------------------------------------------
   Merging two copies of a word.

   This is the same rule the page uses, and it has to live here as well,
   because here is the only place both copies are ever in the same room.
   A device pushes its whole list and reads the answer; if the server
   simply took the newer row, the first device's answers would be gone
   before the second device ever saw them -- which is exactly what
   happened in testing: two phones answering the same word offline, and
   whichever synced second erased the other.

   A word holds two different kinds of thing. What it says -- the senses,
   the recording, the note, the deck -- is settled by whichever copy was
   edited later. What she has done with it is a list of answers, and two
   lists are put together rather than chosen between: every answer either
   device gave is in the result, the word stands where the last of them
   left it, and the count is the length of the list.

   Kept deliberately small and dependency-free. If the rule changes on
   the page, it changes here too; the test for it is two browsers on
   different origins answering the same word while offline.
   ------------------------------------------------------------------ */
const LOGMAX = 40;

function answersOf(w) { return Array.isArray(w.log) ? w.log : []; }

/* Answers given before the log existed, kept as a number. */
function beforeOf(w) {
  return Math.max(Number(w.sb) || 0, (Number(w.seen) || 0) - answersOf(w).length);
}

function mergeLogs(a, b) {
  const seen = new Set(), out = [];
  for (const e of a.concat(b)) {
    if (!e || typeof e.t !== "number") continue;
    const k = e.t + ":" + (e.h || "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  out.sort((x, y) => x.t - y.t);
  return out.slice(-LOGMAX);
}

function mergeWords(mine, theirs) {
  const base = (Number(theirs.updated) || 0) > (Number(mine.updated) || 0) ? theirs : mine;
  const out = { ...base };

  const log = mergeLogs(answersOf(mine), answersOf(theirs));
  const sb = Math.max(beforeOf(mine), beforeOf(theirs));

  let best = log.length
    ? { at: log[log.length - 1].t, box: log[log.length - 1].b, due: log[log.length - 1].d }
    : null;
  for (const w of [mine, theirs]) {
    if ((Number(w.at) || 0) > (best ? best.at : 0)) best = { at: w.at, box: w.box, due: w.due };
  }

  if (best) {
    out.box = best.box || 1;
    out.due = best.due;
    out.at = best.at;
  } else if ((Number(theirs.seen) || 0) !== (Number(mine.seen) || 0)) {
    /* Neither carries a time: both were answered before any of this
       existed, and the one with more answers is the later one. */
    const prog = (Number(theirs.seen) || 0) > (Number(mine.seen) || 0) ? theirs : mine;
    out.box = prog.box || 1;
    out.due = prog.due;
    delete out.at;
  }

  if (log.length) out.log = log; else delete out.log;
  out.sb = sb;
  out.seen = sb + log.length;
  out.updated = Math.max(Number(mine.updated) || 0, Number(theirs.updated) || 0);
  if (!out.at) delete out.at;
  return out;
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
    const incoming = Number(w.updated) || 0;
    const was = server.get(w.id);

    /* A deletion, or a row that is currently a tombstone, is still settled
       by the stamp alone: there is nothing in a tombstone to merge. */
    if (w.deleted || (was && was.deleted)) {
      if (was && Number(was.updated) >= incoming) continue;
      const body = JSON.stringify(w);
      writes.push(env.vocab.prepare(
        `INSERT INTO words (user_id, word_id, body, updated, deleted)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, word_id) DO UPDATE SET
           body = excluded.body, updated = excluded.updated, deleted = excluded.deleted`)
        .bind(userId, w.id, body, incoming, w.deleted ? 1 : 0));
      server.set(w.id, { word_id: w.id, body, updated: incoming, deleted: w.deleted ? 1 : 0 });
      continue;
    }

    let merged = w, updated = incoming;
    if (was) {
      let old = null;
      try { old = JSON.parse(was.body); } catch { old = null; }
      if (old) {
        merged = mergeWords(old, w);
        updated = Number(merged.updated) || Math.max(incoming, Number(was.updated) || 0);
      } else if (Number(was.updated) >= incoming) {
        continue;                       /* a row we cannot read, and older */
      }
    }

    const body = JSON.stringify(merged);
    if (was && body === was.body && updated === Number(was.updated)) continue;

    writes.push(env.vocab.prepare(
      `INSERT INTO words (user_id, word_id, body, updated, deleted)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT (user_id, word_id) DO UPDATE SET
         body = excluded.body, updated = excluded.updated, deleted = excluded.deleted`)
      .bind(userId, w.id, body, updated));
    server.set(w.id, { word_id: w.id, body, updated, deleted: 0 });
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
      return noStore("/flashcards/", [setCookie("", 0)]);
    }
    if (path === "/api/sync" && req.method === "POST") return sync(req, env);

    return env.ASSETS.fetch(req);
  },
};
