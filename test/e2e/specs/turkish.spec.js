const { test, expect, card, turkish } = require("../support");

const ENGLISH_API = /en\.wiktionary\.org\/w\/api\.php/;
const firstRow = (app) => app.panel.locator(".trwords").first();

test.describe("real Turkish lookups", () => {
  for (const [lang, term, pos, want] of [
    ["en", "bank", "Noun", /banka/],
    ["en", "house", "Noun", /\bev\b/],
    ["en", "prudent", "Adjective", /ihtiyatlı/],
    ["en", "run", "Verb", /koşmak/],
    ["de", "Haus", "Noun", /\bev\b/],
    ["es", "casa", "Noun", /\bev\b/],
    ["fr", "maison", "Noun", /\bev\b/],
  ]) {
    test(`${term} (${lang}) leads with the right Turkish`, async ({ app, lab, page }) => {
      lab.real();
      await app.seed([card(term, { lang, gen: lang === "en" ? "" : "f", tr: undefined,
                                   senses: [{ pos, text: `A sense of ${term}.`, example: "" }] })]);
      if (lang !== "en") await page.locator(`[data-space="${lang}"]`).click();
      await app.studyToBack(term);
      await app.openTurkish();
      await expect(firstRow(app)).toHaveText(want, { timeout: 45_000 });
    });
  }
});

test.describe("when a source fails", () => {
  const empty = () => card("prudent", { tr: undefined });

  test("a rate limit is never saved as 'no Turkish exists'", async ({ app, lab }) => {
    lab.real().fail(/wiktionary\.org\/w\/api\.php|wikipedia\.org|wikidata\.org/, 429);
    await app.seed([empty()]);
    await app.studyToBack("prudent");
    await app.openTurkish();
    await expect(app.panel).toContainText("Could not reach", { timeout: 40_000 });
    expect((await app.word("prudent")).tr).toBeUndefined();
  });

  test("pressing Türkçe again recovers after the failure", async ({ app, lab, page }) => {
    lab.real().fail(/wiktionary\.org\/w\/api\.php|wikipedia\.org|wikidata\.org/, 429);
    await app.seed([empty()]);
    await app.studyToBack("prudent");
    await app.openTurkish();
    await expect(app.panel).toContainText("Could not reach", { timeout: 40_000 });
    lab.heal();
    await page.locator("#trBtn").click();
    await app.openTurkish();
    await expect(firstRow(app)).toContainText("ihtiyatlı", { timeout: 30_000 });
  });

  test("a 200 reply carrying an error is treated as a failure", async ({ app, lab }) => {
    lab.real().fail(/wiktionary\.org\/w\/api\.php|wikipedia\.org|wikidata\.org/, { error: { code: "ratelimited" } });
    await app.seed([empty()]);
    await app.studyToBack("prudent");
    await app.openTurkish();
    await expect(app.panel).toContainText("Could not reach", { timeout: 40_000 });
  });

  test("a partial answer is shown, marked provisional and retried", async ({ app, lab, page }) => {
    lab.real().fail(ENGLISH_API, 429);
    await app.seed([card("meticulous", { tr: undefined })]);
    await app.studyToBack("meticulous");
    await app.openTurkish();
    await expect(firstRow(app)).toContainText("titiz", { timeout: 40_000 });
    expect((await app.word("meticulous")).tr.soft).toBe(1);
    lab.heal();
    await page.locator("#trBtn").click();
    await app.openTurkish();
    await expect.poll(async () => (await app.word("meticulous")).tr.soft, { timeout: 30_000 }).toBeUndefined();
  });

  test("a failed refresh keeps the answer already on the card", async ({ app, lab }) => {
    lab.fail(/wiktionary\.org|wikipedia\.org|wikidata\.org/, 429);
    await app.seed([card("bank", { tr: turkish([[["kıran"], "old parse"]], { v: 5 }) })]);
    await app.studyToBack("bank");
    await app.openTurkish();
    await expect(firstRow(app)).toHaveText("kıran");
    await app.page.waitForTimeout(800);
    await expect(firstRow(app)).toHaveText("kıran");
    expect((await app.word("bank")).tr.v).toBe(5);
  });

  test("a word nobody has says so, and offers to write your own", async ({ app, page }) => {
    await app.seed([card("zzqxnotaword", { tr: undefined })]);
    await app.studyToBack("zzqxnotaword");
    await app.openTurkish();
    await expect(app.panel).toContainText("Nothing invented");
    await expect(page.locator("#trWrite")).toBeVisible();
    await expect(page.locator("#trAgain")).toBeVisible();
  });
});

test.describe("choosing the Turkish", () => {
  const rows = () => turkish([[["banka"], "institution"], [["kıyı", "yaka"], "edge of a river"]]);

  /* Several can be ticked now, so the choices stay open until Türkçe is
     closed; closed, only the kept one shows. */
  test("tapping a meaning keeps it, and closing hides the others", async ({ app, page }) => {
    await app.seed([card("bank", { tr: rows() })]);
    await app.studyToBack("bank");
    await app.openTurkish();
    await page.locator("[data-trpin]").nth(1).click();
    await expect(app.panel.locator(".trmine")).toContainText("kıyı, yaka");
    const mine = (await app.word("bank")).trMine;
    expect([mine.text, mine.sense, mine.own]).toEqual(["kıyı, yaka", "edge of a river", 0]);
    await page.locator("#trBtn").click();
    await expect(app.panel).toContainText("kıyı, yaka");
    await expect(app.panel).not.toContainText("institution");
  });

  test("a kept meaning shows on the back without pressing anything", async ({ app, page }) => {
    await app.seed([card("bank", { tr: rows(), trMine: { text: "banka", sense: "institution", own: 0, t: 5 } })]);
    await app.studyToBack("bank");
    await expect(app.panel).toContainText("banka");
    await expect(page.locator("#trChange")).toHaveCount(0);
  });

  test("Change brings the choices back and remembers the removal", async ({ app, page }) => {
    await app.seed([card("bank", { tr: rows(), trMine: { text: "banka", sense: "institution", own: 0, t: 5 } })]);
    await app.studyToBack("bank");
    await app.openTurkish();
    await page.locator("#trChange").click();
    await expect(page.locator("[data-trpin]")).toHaveCount(2);
    const mine = (await app.word("bank")).trMine;
    expect(mine.text).toBe("");
    expect(mine.t).toBeGreaterThan(5);
  });

  test("your own Turkish saves with Enter and survives a reload", async ({ app, page }) => {
    await app.seed([card("candid", { tr: turkish([[["tatsız"], "wrong"]]) })]);
    await app.studyToBack("candid");
    await app.openTurkish();
    await page.locator("#trWrite").click();
    await page.keyboard.type("samimi 123");
    expect((await app.word("candid")).seen).toBe(0);
    await page.keyboard.press("Enter");
    await expect(app.panel).toContainText("samimi 123");
    await page.reload();
    await app.flip();
    await expect(app.panel).toContainText("samimi 123");
  });

  test("Escape and Cancel leave the text unchanged", async ({ app, page }) => {
    await app.seed([card("bank", { tr: rows(), trMine: { text: "banka", sense: "", own: 1, t: 5 } })]);
    await app.studyToBack("bank");
    await app.openTurkish();
    await page.locator("#trEdit").click();
    await page.locator("#trBox").fill("changed");
    await page.locator("#trCancel").click();
    await expect(app.panel).toContainText("banka");
    await page.locator("#trEdit").click();
    await page.locator("#trBox").fill("changed again");
    await page.locator("#trBox").press("Escape");
    await expect(app.panel).toContainText("banka");
    expect((await app.word("bank")).trMine.text).toBe("banka");
  });

  test("text being typed survives a lookup landing", async ({ app, lab, page }) => {
    lab.real();
    await app.seed([card("prudent", { tr: undefined })]);
    await app.studyToBack("prudent");
    await page.locator("#trBtn").click();
    await page.locator("#trWrite").click();
    await page.locator("#trBox").fill("yazıyorum");
    await expect.poll(async () => (await app.word("prudent")).tr?.v, { timeout: 40_000 }).toBe(6);
    await expect(page.locator("#trBox")).toHaveValue("yazıyorum");
    await expect(page.locator("#trBox")).toBeFocused();
  });

  test("markup typed as Turkish is shown as text", async ({ app, page }) => {
    const evil = `<img src=x onerror="window.__xss=1">`;
    await app.seed([card("bank", { tr: rows() })]);
    await app.studyToBack("bank");
    await app.openTurkish();
    await page.locator("#trWrite").click();
    await page.locator("#trBox").fill(evil);
    await page.locator("#trSave").click();
    await expect(app.panel).toContainText(evil);
    await expect(app.panel.locator("img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("a dictionary refresh never replaces your choice", async ({ app, lab, page }) => {
    lab.real();
    await app.seed([card("bank", { tr: turkish([[["kıran"], "old"]], { v: 5 }),
                                   trMine: { text: "my bank", sense: "", own: 1, t: 5 } })]);
    await app.studyToBack("bank");
    await page.locator("#trBtn").click();
    await expect.poll(async () => (await app.word("bank")).tr.v, { timeout: 40_000 }).toBe(6);
    await expect(app.panel).toContainText("my bank");
    expect((await app.word("bank")).trMine.text).toBe("my bank");
  });
});
