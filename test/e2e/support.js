const { test: base, expect } = require("@playwright/test");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CACHE = path.join(__dirname, ".cache");
const SECRET = "e2e-only-not-a-real-secret";
const KNOWN = /(^|\.)(wiktionary\.org|wikipedia\.org|wikidata\.org|wikimedia\.org|datamuse\.com|dictionaryapi\.dev)$/;
const isAudio = (u) => u.hostname === "upload.wikimedia.org" || /Special:FilePath/.test(u.pathname)
  || /\/media\/pronunciations\//.test(u.pathname);

/* A real, playable WAV of a set length, so a playback test does not depend on
   how long some recording happens to be. */
function tone(seconds = 5) {
  const rate = 8000, samples = Math.floor(seconds * rate);
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    b.writeInt16LE(Math.round(9000 * Math.sin((2 * Math.PI * 440 * i) / rate)), 44 + i * 2);
  }
  return b;
}

/* ------------------------------------------------------------- network
   Every request leaving the page passes through here.
   stub:   sources answer "nothing", so a flow test depends on no outside site.
   replay: real dictionary answers, fetched once, politely, then kept on disk.
   The live site is never reachable. */
let queue = Promise.resolve();
let lastFetch = 0;
/* Every refusal, server error or timeout from a dictionary, so a test can
   tell "the app failed" from "the dictionary would not answer in time". */
let trouble = 0;

async function fetchPolitely(url) {
  /* Every request has a deadline. One source that never answers would
     otherwise hold the queue, and every test after it, until they time out. */
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = Math.max(0, lastFetch + 1500 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastFetch = Date.now();
    try {
      const r = await fetch(url, { headers: { "User-Agent": "flashcards-e2e/1.0" },
                                   signal: AbortSignal.timeout(10_000) });
      if (r.status === 429 || r.status >= 500) {
        trouble++;
        console.warn(`dictionary answered ${r.status}: ${url.slice(0, 120)}`);
        const after = Math.min(Number(r.headers.get("retry-after")) || 2, 10);
        await new Promise((g) => setTimeout(g, (after + 2 * (attempt + 1)) * 1000));
        continue;
      }
      return { status: r.status, type: r.headers.get("content-type") || "application/octet-stream",
               body: Buffer.from(await r.arrayBuffer()).toString("base64") };
    } catch (e) {
      trouble++;
      console.warn(`dictionary did not answer (${e.name}): ${url.slice(0, 120)}`);
      await new Promise((g) => setTimeout(g, 1000));
    }
  }
  return null;
}

function cached(url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, crypto.createHash("sha1").update(url).digest("hex") + ".json");
  if (fs.existsSync(file)) return Promise.resolve(JSON.parse(fs.readFileSync(file, "utf8")));
  const job = queue.then(async () => {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    const got = await fetchPolitely(url);
    if (got) fs.writeFileSync(file, JSON.stringify(got));
    return got;
  });
  queue = job.catch(() => {});
  return job;
}

function stubbed(u) {
  if (u.hostname.includes("datamuse")) return { status: 200, json: [] };
  if (u.pathname.endsWith("/api.php")) {
    if (u.searchParams.get("action") === "parse") {
      return { status: 200, json: { error: { code: "missingtitle", info: "stub" } } };
    }
    if (u.searchParams.get("action") === "wbgetentities") return { status: 200, json: { entities: {} } };
    return { status: 200, json: { query: { pages: { "-1": { missing: "" } } } } };
  }
  return { status: 404, json: { title: "Not found" } };
}

const CORS = { "access-control-allow-origin": "*" };

class Lab {
  constructor() {
    this.mode = "stub";
    this.liveAudio = false;
    this.faults = [];
    this.canned = [];
    this.calls = [];
    this.forbidden = [];
    this.upstreamLimited = [];
    this.troubleAtStart = trouble;
  }
  /* The dictionaries refused, failed or stalled during this test. A verdict
     reached then is about them, not the app: inconclusive. */
  rocky() { return this.upstreamLimited.length > 0 || trouble > this.troubleAtStart; }
  real() { this.mode = "replay"; return this; }
  fail(pattern, how = 429) { this.faults.push({ pattern, how }); return this; }
  heal() { this.faults = []; return this; }
  serve(pattern, contentType, body) { this.canned.push({ pattern, contentType, body }); return this; }
  /* Live recordings bypass interception entirely, so timing is the browser's own. */
  intercepts(url) { return !(this.liveAudio && isAudio(url)); }
  count(pattern) { return this.calls.filter((c) => pattern.test(c)).length; }

  async handle(route) {
    const url = route.request().url();
    const u = new URL(url);
    if (u.hostname === "127.0.0.1") return route.continue();
    if (/(^|\.)simaydemiral\.com$/.test(u.hostname)) {
      this.forbidden.push(url);
      return route.abort();
    }
    if (u.hostname === "api.fontshare.com") {
      return route.fulfill({ status: 200, contentType: "text/css", headers: CORS, body: "" });
    }
    if (!KNOWN.test(u.hostname)) {
      this.forbidden.push(url);
      return route.abort();
    }
    this.calls.push(url);

    const canned = this.canned.find((c) => c.pattern.test(url));
    if (canned) {
      return route.fulfill({ status: 200, contentType: canned.contentType, headers: CORS, body: canned.body });
    }
    const fault = this.faults.find((f) => f.pattern.test(url));
    if (fault) {
      if (fault.how === "abort") return route.abort("connectionfailed");
      if (typeof fault.how === "object") {
        return route.fulfill({ status: 200, contentType: "application/json", headers: CORS,
                               body: JSON.stringify(fault.how) });
      }
      return route.fulfill({ status: fault.how, contentType: "application/json", headers: CORS, body: "{}" });
    }
    if (this.mode === "stub") {
      const s = stubbed(u);
      return route.fulfill({ status: s.status, contentType: "application/json", headers: CORS,
                             body: JSON.stringify(s.json) });
    }
    const got = await cached(url);
    if (!got) {
      this.upstreamLimited.push(url);
      return route.abort("connectionfailed");
    }
    return route.fulfill({ status: got.status, contentType: got.type, headers: CORS,
                           body: Buffer.from(got.body || "", "base64") });
  }
}

/* ---------------------------------------------------------------- data */
const dayIn = (offset = 0) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(Date.now() + offset * 86_400_000));

/* A card that has already been looked up, so a flow test asks nothing of the
   dictionaries unless it means to. */
function card(term, over = {}) {
  return {
    id: "seed", term, lang: "en", deck: "Inbox", box: 1, due: dayIn(), seen: 0,
    added: new Date().toISOString(), updated: 1000, sv: 1, tv: 2,
    looked: true, lv: 9, pv: 9, miss: 0, note: "", forms: [term], src: {},
    plain: [{ pos: "Noun", text: `Plain meaning of ${term}.` }],
    senses: [{ pos: "Noun", text: `A dictionary sense of ${term}.`, example: `Use ${term} here.` }],
    eg: { text: "", from: "none", v: 9 },
    say: { audio: "", ipa: "/test/", us: true, v: 9, miss: 3 },
    rel: { syn: "", ant: "", pat: "", v: 9 },
    ...over,
  };
}

const turkish = (rows, over = {}) => ({
  blocks: rows.map(([words, sense]) => ({ words, sense })),
  more: [], one: "", from: "Wiktionary", v: 6, miss: 0, via: "", ...over,
});

/* ------------------------------------------------------------ page object */
class App {
  constructor(page, lab) {
    this.page = page;
    this.lab = lab;
    this.toast = page.locator("#toast");
    this.face = page.locator("#face");
    this.back = page.locator("#back");
    this.panel = page.locator(".yournote.tr");
  }
  async open(url = "/flashcards/") {
    await this.page.goto(url);
    await expect(this.page.locator("#tabs")).toBeVisible();
  }
  async seed(words, extra = {}) {
    await this.page.goto("/flashcards/manifest.webmanifest");
    await this.page.evaluate(([list, more]) => {
      localStorage.clear();
      localStorage.setItem("vocab.v1", JSON.stringify({ v: 1, decks: [], words: list, ...more }));
    }, [words, extra]);
    await this.open();
  }
  store() {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem("vocab.v1") || "{}"));
  }
  async words() { return (await this.store()).words || []; }
  async word(term) { return (await this.words()).find((w) => w.term === term); }
  async tab(name) {
    await this.page.locator(`[data-tab="${name}"]`).click();
    await expect(this.page.locator(`#p-${name}`)).toBeVisible();
  }
  async add(...terms) {
    await this.tab("add");
    await this.page.locator("#paste").fill(terms.join("\n"));
    await this.page.locator("#pasteGo").click();
    await expect(this.toast).toHaveClass(/on/);
    return this.toast.textContent();
  }
  async start() {
    await this.tab("due");
    await this.page.locator("#go").click();
    await expect(this.face).toBeVisible();
  }
  async flip() {
    await this.face.click({ position: { x: 20, y: 90 } });
    await expect(this.back).toBeVisible();
  }
  async grade(how) {
    await this.page.locator({ no: "#gNo", mid: "#gMid", yes: "#gYes" }[how]).click();
  }
  /* Opens the choices. A kept Turkish already shows by itself, with Change
     to open it; anywhere else it is the Türkçe button. */
  async openTurkish() {
    const change = this.page.locator("#trMore");
    if (await change.count()) await change.click();
    else await this.page.locator("#trBtn").click();
    await expect(this.panel).toBeVisible();
  }
  async studyToBack(term) {
    await this.start();
    await expect(this.face).toContainText(term);
    await this.flip();
  }
}

/* ---------------------------------------------------------------- fixtures
   Every test gets its own browser profile. Each one also fails on an uncaught
   error, a console error, or any request to the live site. */
const test = base.extend({
  lab: async ({}, use) => { await use(new Lab()); },
  context: async ({ context, lab }, use) => {
    await context.route((url) => lab.intercepts(url), (route) => lab.handle(route).catch(() => {}));
    await use(context);
  },
  page: async ({ page, lab }, use, info) => {
    /* Silent in every engine. Chrome is muted by its launch flags; WebKit
       has no such flag and would play through the speakers of whoever runs
       this. Muted media still plays and advances, so timing is unchanged. */
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { this.muted = true; return play.call(this); };
      if (window.SpeechSynthesis) {
        const speak = SpeechSynthesis.prototype.speak;
        SpeechSynthesis.prototype.speak = function (u) { u.volume = 0; return speak.call(this, u); };
      }
    });
    const problems = [];
    page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) {
        problems.push(`console: ${m.text()}`);
      }
    });
    await use(page);
    if (lab.upstreamLimited.length) {
      info.annotations.push({ type: "inconclusive", description: "dictionary rate limit" });
    }
    expect(lab.forbidden, "requests outside the test boundary").toEqual([]);
    expect(problems, "errors on the page").toEqual([]);
  },
  app: async ({ page, lab }, use) => { await use(new App(page, lab)); },
});

/* A second signed-in device: its own storage, the same account. */
function sessionCookie(userId) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const body = `${userId}.${exp}`;
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return { name: "vsid", value: `${body}.${sig}`, domain: "127.0.0.1", path: "/",
           httpOnly: true, secure: false, sameSite: "Lax" };
}

async function device(browser, baseURL, lab, userId) {
  const context = await browser.newContext({ baseURL, serviceWorkers: "block",
                                             timezoneId: "America/Los_Angeles" });
  await context.route((url) => lab.intercepts(url), (route) => lab.handle(route).catch(() => {}));
  await context.addCookies([sessionCookie(userId)]);
  const page = await context.newPage();
  return { context, page, app: new App(page, lab) };
}

const newUser = () => `qa-${crypto.randomUUID()}`;

module.exports = { test, expect, card, turkish, dayIn, device, newUser, sessionCookie, cached, tone };
