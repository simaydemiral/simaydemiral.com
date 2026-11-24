const { test, expect, card, device, newUser } = require("../support");

/* Reported by the owner: pressing Türkçe often stays on "Bakılıyor…" and
   nothing ever appears. A lookup must always end in an answer, a "nobody has
   it", or a "could not reach", and it must do so in a reasonable time. */
const LOOKING = "Bakılıyor";
const SOURCES = /wiktionary\.org|wikipedia\.org|wikidata\.org/;
const BUDGET_MS = 20_000;

const synced = (d) => d.page.waitForResponse((r) => r.url().endsWith("/api/sync") && r.ok(), { timeout: 25_000 });

async function secondsLooking(app, limitMs) {
  const start = Date.now();
  await expect(app.panel).toBeVisible();
  while (Date.now() - start < limitMs) {
    const text = (await app.panel.textContent()) || "";
    if (!text.includes(LOOKING)) return { ms: Date.now() - start, text: text.trim().slice(0, 70) };
    await app.page.waitForTimeout(150);
  }
  return { ms: null, text: LOOKING };
}

test.describe("Türkçe never stays on Bakılıyor @desktop", () => {
  test("a sync landing during the lookup does not strand it", async ({ browser, baseURL, lab }) => {
    test.setTimeout(90_000);
    const d = await device(browser, baseURL, lab, newUser());
    const fresh = (t) => card(t, { tr: undefined });
    const first = synced(d);
    await d.app.seed([fresh("upbringing"), fresh("rearing")]);
    await first;
    await d.app.start();
    await d.page.waitForTimeout(8_500);        /* past the app's gap between syncs */
    await d.page.bringToFront();
    await d.app.flip();
    const landed = synced(d);
    await d.app.grade("yes");                  /* answering a card is what starts a sync */
    await expect(d.app.face).toBeVisible();

    let release;
    const gate = new Promise((r) => { release = r; });
    await d.page.route(SOURCES, async (route) => { await gate; await route.fallback(); });
    await d.app.flip();
    await d.app.openTurkish();
    await expect(d.app.panel).toContainText(LOOKING);
    await landed;
    await d.page.waitForTimeout(250);
    release();

    const r = await secondsLooking(d.app, 15_000);
    test.info().annotations.push({ type: "metric", description: `after sync: ${r.ms}ms, "${r.text}"` });
    expect(r.ms, "still on Bakılıyor after the sources answered").not.toBeNull();
    await d.context.close();
  });

  test("a reply that stalls halfway does not hang forever", async ({ app, page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      const real = window.fetch;
      window.fetch = (u, o) => (/wiktionary|wikipedia|wikidata/.test(String(u))
        ? Promise.resolve(new Response(new ReadableStream({ start() {} }),
                                       { status: 200, headers: { "content-type": "application/json" } }))
        : real(u, o));
    });
    await app.seed([card("upbringing", { tr: undefined })]);
    await app.studyToBack("upbringing");
    await app.openTurkish();
    const r = await secondsLooking(app, 45_000);
    test.info().annotations.push({ type: "metric", description: `stalled reply: ${r.ms}ms, "${r.text}"` });
    expect(r.ms, "stayed on Bakılıyor for 45 seconds").not.toBeNull();
  });

  test("sources that never answer give up within the budget", async ({ app, page }) => {
    test.setTimeout(240_000);
    await page.addInitScript(() => {
      const real = window.fetch;
      window.fetch = (u, o) => {
        if (!/wiktionary|wikipedia|wikidata/.test(String(u))) return real(u, o);
        return new Promise((_, reject) => {
          if (o && o.signal) o.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        });
      };
    });
    await app.seed([card("upbringing", { tr: undefined, senses: [
      { pos: "Noun", text: "The raising or training of a child.", example: "" },
      { pos: "Noun", text: "Nurture, rearing.", example: "" },
    ] })]);
    await app.studyToBack("upbringing");
    await app.openTurkish();
    const r = await secondsLooking(app, 200_000);
    test.info().annotations.push({ type: "metric", description: `no answer: ${r.ms}ms, "${r.text}"` });
    expect(r.ms, "never left Bakılıyor").not.toBeNull();
    expect(r.ms, `waited ${Math.round((r.ms || 0) / 1000)}s on Bakılıyor`).toBeLessThanOrEqual(BUDGET_MS);
  });

  test("pressing Türkçe again after a stuck lookup recovers", async ({ app, lab, page }) => {
    test.setTimeout(90_000);
    let stall = true;
    await page.exposeFunction("__stall", () => stall);
    await page.addInitScript(() => {
      const real = window.fetch;
      window.fetch = async (u, o) => {
        if (/wiktionary|wikipedia|wikidata/.test(String(u)) && await window.__stall()) {
          return new Response(new ReadableStream({ start() {} }),
                              { status: 200, headers: { "content-type": "application/json" } });
        }
        return real(u, o);
      };
    });
    lab.real();
    await app.seed([card("prudent", { tr: undefined })]);
    await app.studyToBack("prudent");
    await app.openTurkish();
    await expect(app.panel).toContainText(LOOKING);
    await page.waitForTimeout(3_500);          /* long enough to look stuck */
    stall = false;
    await page.locator("#trBtn").click();
    await app.openTurkish();
    await expect(app.panel.locator(".trwords").first(), "a second press should ask again").toContainText("ihtiyatlı", { timeout: 25_000 });
  });
});
