const fs = require("fs");
const path = require("path");
const { test, expect, card, tone } = require("../support");

/* What a person experiences after pressing Listen:
     wait        tap -> the player starts          (network and browser)
     silence     silence at the start of the file  (the recording itself)
     first sound wait + silence
   Real recordings over the real network. Headless Chrome is muted, so "heard"
   means the player advanced through decoded audio. */
const BUDGET = { firstSoundMs: 1500, leadingSilenceMs: 600 };
const REPORT = path.join(__dirname, "..", ".output", "listen.json");
const results = [];

const WORDS = [
  ["en", "bank"], ["en", "house"], ["en", "prudent"], ["en", "mischief"],
  ["en", "salient"], ["de", "Haus"], ["es", "casa"], ["fr", "maison"],
];

function instrument() {
  const log = { taps: [], audio: [], speech: [] };
  window.__listen = log;
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest(".speak")) log.taps.push(performance.now());
  }, true);

  const Native = window.Audio;
  window.__players = [];
  window.Audio = function (src) {
    const el = new Native(src);
    const rec = { src, at: {} };
    log.audio.push(rec);
    window.__players.push(el);
    for (const type of ["play", "playing", "ended", "error"]) {
      el.addEventListener(type, () => {
        rec.at[type] = rec.at[type] ?? performance.now();
        if (type === "ended") { rec.played = el.currentTime; rec.duration = el.duration; }
        if (type === "error") rec.error = el.error && `${el.error.code} ${el.error.message}`;
      });
    }
    return el;
  };
  window.Audio.prototype = Native.prototype;

  /* On the prototype, not the object: WebKit hands the page a different
     speechSynthesis object from the one an init script sees, so a patch on
     the instance watched nothing in Safari. */
  if (window.SpeechSynthesis && window.speechSynthesis) {
    const original = SpeechSynthesis.prototype.speak;
    SpeechSynthesis.prototype.speak = function (u) {
      const speak = (x) => original.call(this, x);
      if (u.text.trim()) {
        const rec = { text: u.text, lang: u.lang, voice: u.voice && u.voice.lang, called: performance.now() };
        log.speech.push(rec);
        u.addEventListener("start", () => { rec.start = performance.now(); });
        u.addEventListener("end", () => { rec.end = performance.now(); });
        u.addEventListener("error", (e) => { rec.error = e.error; });
      }
      u.volume = 0;      /* never talks out loud on the machine running the test */
      speak(u);
    };
  }
}

/* Silence measured from the decoded samples, in 10ms windows. "Sound" begins
   at 30dB below the recording's own peak, and never below -50dBFS. */
async function analyse(page, url) {
  /* The same file the browser just played, fetched with the browser's identity. */
  let bytes = null;
  for (let attempt = 0; attempt < 4 && !bytes; attempt++) {
    if (attempt) await page.waitForTimeout(2500 * attempt);
    const res = await page.request.get(url, { timeout: 20_000 }).catch(() => null);
    if (res && res.ok()) bytes = await res.body();
  }
  if (!bytes) return null;
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const buf = await ctx.decodeAudioData(bytes.buffer);
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels;
    }
    const size = Math.max(1, Math.floor(buf.sampleRate / 100));
    const rms = [];
    for (let i = 0; i + size <= mono.length; i += size) {
      let s = 0;
      for (let j = i; j < i + size; j++) s += mono[j] * mono[j];
      rms.push(Math.sqrt(s / size));
    }
    const peak = Math.max(...rms);
    const floor = Math.max(peak * 10 ** (-30 / 20), 10 ** (-50 / 20));
    const first = rms.findIndex((v) => v >= floor);
    let last = rms.length - 1;
    while (last > 0 && rms[last] < floor) last--;
    return { durationMs: Math.round(buf.duration * 1000),
             leadingSilenceMs: Math.max(first, 0) * 10,
             trailingSilenceMs: (rms.length - 1 - last) * 10,
             peakDb: Math.round(20 * Math.log10(peak || 1e-9)) };
  }, bytes.toString("base64"));
}

async function openCard(app, page, lang, term) {
  await page.addInitScript(instrument);
  await app.seed([card(term, { lang, say: undefined, gen: lang === "en" ? "" : "f" })]);
  if (lang !== "en") await page.locator(`[data-space="${lang}"]`).click();
  await app.start();
  try {
    await expect.poll(async () => (await app.word(term)).say?.audio || "", { timeout: 45_000 }).toMatch(/^https:/);
  } catch (e) {
    /* A dictionary that would not answer says nothing about the app. */
    test.skip(app.lab.upstreamLimited.length > 0, "dictionary unavailable: inconclusive");
    throw e;
  }
}

async function tapAndWait(page) {
  const n = await page.evaluate(() => window.__listen.audio.length);
  await page.locator("#face .speak").click();
  await expect.poll(() => page.evaluate((i) => {
    const r = window.__listen.audio[i];
    return r ? !!(r.at.ended || r.at.error) : false;
  }, n), { timeout: 25_000 }).toBe(true);
  return page.evaluate((i) => {
    const r = window.__listen.audio[i];
    const tap = window.__listen.taps[window.__listen.taps.length - 1];
    return { waitMs: r.at.playing ? Math.round(r.at.playing - tap) : null, error: r.error,
             playedMs: r.played ? Math.round(r.played * 1000) : 0,
             fullMs: r.duration ? Math.round(r.duration * 1000) : 0, src: r.src };
  }, n);
}

test.describe("Listen", () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [lang, term] of WORDS) {
    test(`${term} (${lang}) plays quickly with little silence @desktop`, async ({ app, lab, page }) => {
      lab.real();
      lab.liveAudio = true;
      await openCard(app, page, lang, term);
      const cold = await tapAndWait(page);
      expect(cold.error, `the recording failed to play: ${cold.src}`).toBeUndefined();
      expect(cold.playedMs).toBeGreaterThan(0);
      expect(Math.abs(cold.fullMs - cold.playedMs), "playback stopped early").toBeLessThan(250);
      const repeat = await tapAndWait(page);
      const sound = await analyse(page, cold.src);
      expect(sound, "the recording could not be decoded").toBeTruthy();

      const row = { word: term, lang, coldWaitMs: cold.waitMs, repeatWaitMs: repeat.waitMs, ...sound,
                    coldFirstSoundMs: cold.waitMs + sound.leadingSilenceMs,
                    repeatFirstSoundMs: repeat.waitMs + sound.leadingSilenceMs,
                    file: decodeURIComponent(cold.src.split("/").pop()) };
      results.push(row);
      test.info().annotations.push({ type: "metric",
        description: `wait ${row.coldWaitMs}ms, silence ${row.leadingSilenceMs}ms, first sound ${row.coldFirstSoundMs}ms` });
      expect.soft(row.leadingSilenceMs, "silence at the start of the recording").toBeLessThanOrEqual(BUDGET.leadingSilenceMs);
      expect.soft(row.coldFirstSoundMs, "tap to first sound").toBeLessThanOrEqual(BUDGET.firstSoundMs);
    });
  }

  test.afterAll(() => {
    if (!results.length) return;
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify({ budget: BUDGET, results }, null, 1));
  });

  /* A five-second clip, so "still playing" cannot be confused with a short
     word that has already finished or a file that failed to load. */
  const LONG = "https://upload.wikimedia.org/e2e/long-clip.wav";
  const sounding = (page) => page.evaluate(() => window.__players
    .filter((p) => !p.paused && !p.ended && !p.error && p.currentTime > 0).length);
  const withClip = (term) => card(term, { say: { audio: LONG, ipa: "/x/", us: true, v: 9, miss: 0 } });

  test("tapping repeatedly never plays two copies at once", async ({ app, lab, page }) => {
    lab.serve(/long-clip\.wav/, "audio/wav", tone(5));
    await page.addInitScript(instrument);
    await app.seed([withClip("alpha")]);
    await app.start();
    const speak = page.locator("#face .speak");
    await speak.click();
    await speak.click();
    await speak.click();
    await expect.poll(() => sounding(page)).toBe(1);
    await page.waitForTimeout(250);
    expect(await sounding(page)).toBe(1);
  });

  test("moving to the next card stops the previous word", async ({ app, lab, page }) => {
    lab.serve(/long-clip\.wav/, "audio/wav", tone(5));
    await page.addInitScript(instrument);
    await app.seed([withClip("alpha"), withClip("beta")]);
    await app.start();
    await page.locator("#face .speak").click();
    await expect.poll(() => sounding(page)).toBe(1);
    await app.flip();
    await app.grade("yes");
    await expect(app.face).toBeVisible();
    await page.waitForTimeout(150);
    expect(await sounding(page), "the previous word kept playing over the next card").toBe(0);
    expect(await page.evaluate(() => window.__listen.speech.length),
           "the browser voice read out a word already left").toBe(0);
  });

  test("a broken recording falls back to the browser voice", async ({ app, lab, page }) => {
    lab.fail(/upload\.wikimedia\.org/, 404);
    await page.addInitScript(instrument);
    await app.seed([card("alpha", { say: { audio: "https://upload.wikimedia.org/x/En-us-alpha.mp3", ipa: "/a/", us: true, v: 9, miss: 0 } })]);
    await app.start();
    await page.locator("#face .speak").click();
    await expect.poll(() => page.evaluate(() => window.__listen.speech.length)).toBeGreaterThan(0);
    const said = await page.evaluate(() => window.__listen.speech[0]);
    expect([said.text, said.lang]).toEqual(["alpha", "en-US"]);
  });

  test("a word with no recording uses the right language voice", async ({ app, page }) => {
    await page.addInitScript(instrument);
    await app.seed([card("Tisch", { lang: "de", gen: "m", say: { audio: "", ipa: "", us: false, v: 9, miss: 3 } })]);
    await page.locator('[data-space="de"]').click();
    await app.start();
    await page.locator("#face .speak").click();
    await expect.poll(() => page.evaluate(() => window.__listen.speech.length)).toBeGreaterThan(0);
    expect((await page.evaluate(() => window.__listen.speech[0])).lang).toBe("de-DE");
  });
});
