const { test, expect, card, turkish } = require("../support");

/* Asked for by the owner: the English meaning can be replaced with her own,
   and several Turkish options can be kept at once, joined with commas. */

test.describe("Your own English meaning", () => {
  test("replaces the dictionary's on the card, and stays after a reload", async ({ app, page }) => {
    await app.seed([card("upbringing")]);
    await app.studyToBack("upbringing");
    await page.locator("#meanBtn").click();
    const box = page.locator("#meanBox");
    await expect(box, "starts from what the card was showing").toHaveValue("Plain meaning of upbringing.");
    await box.fill("the way a child is raised and taught");
    await page.locator("#meanSave").click();

    await expect(app.back.locator(".sense.mine")).toContainText("the way a child is raised and taught");
    await expect(app.back).not.toContainText("Plain meaning of upbringing.");
    expect((await app.word("upbringing")).enMine.text).toBe("the way a child is raised and taught");

    /* On a phone four buttons ran off the card, under the bin. */
    const card_ = await app.back.boundingBox();
    for (const b of await app.back.locator(".noteacts button").all()) {
      const r = await b.boundingBox();
      expect(r.x + r.width, `${await b.textContent()} sticks out of the card`)
        .toBeLessThanOrEqual(card_.x + card_.width);
    }

    /* the dictionary is one press away, under hers */
    await page.locator("#dictBtn").click();
    await expect(app.back).toContainText("Plain meaning of upbringing.");
    await expect(app.back.locator(".sense.mine")).toBeVisible();

    await page.reload();
    await app.flip();
    await expect(app.back.locator(".sense.mine")).toContainText("the way a child is raised");
    await app.tab("all");
    await expect(page.locator("#tbl")).toContainText("the way a child is raised");
  });

  test("can be taken off again, back to the dictionary", async ({ app, page }) => {
    await app.seed([card("upbringing", { enMine: { text: "my words", t: 1000 } })]);
    await app.studyToBack("upbringing");
    await expect(app.back.locator(".sense.mine")).toContainText("my words");
    await page.locator("#meanBtn").click();
    await page.locator("#meanDrop").click();
    await expect(app.back.locator(".sense.mine")).toHaveCount(0);
    await expect(app.back).toContainText("Plain meaning of upbringing.");
    const w = await app.word("upbringing");
    expect(w.enMine.text, "kept as an empty choice, so an older copy cannot bring it back").toBe("");
  });

  test("saving the dictionary's line unchanged does not make it hers", async ({ app, page }) => {
    await app.seed([card("upbringing")]);
    await app.studyToBack("upbringing");
    await page.locator("#meanBtn").click();
    await page.locator("#meanSave").click();
    await expect(app.back.locator(".sense.mine")).toHaveCount(0);
    expect((await app.word("upbringing")).enMine).toBeUndefined();
  });

  test("typing in the box does not answer or flip the card", async ({ app, page }) => {
    await app.seed([card("upbringing")]);
    await app.studyToBack("upbringing");
    await page.locator("#meanBtn").click();
    await page.locator("#meanBox").fill("");
    await page.locator("#meanBox").pressSequentially("a 1 2 3 thing");
    await page.keyboard.press("Enter");
    await expect(app.back.locator(".sense.mine")).toContainText("a 1 2 3 thing");
    expect((await app.word("upbringing")).seen).toBe(0);
  });

  test("a card with no definition can still be given one", async ({ app, page }) => {
    await app.seed([card("zibble", { senses: [], plain: [], miss: 3 })]);
    await app.studyToBack("zibble");
    await page.locator("#meanBtn").click();
    await expect(page.locator("#meanBox")).toHaveValue("");
    await page.locator("#meanBox").fill("a made-up word");
    await page.locator("#meanSave").click();
    await expect(app.back.locator(".sense.mine")).toContainText("a made-up word");
  });
});

test.describe("Several Turkish choices", () => {
  const tr = turkish([
    [["yetiştirme", "terbiye"], "the raising of a child"],
    [["eğitim"], "education"],
    [["terbiye"], "manners"],
  ]);
  const rows = (page) => page.locator("[data-trpin]");

  test("ticking two keeps both, joined with commas and no word twice", async ({ app, page }) => {
    await app.seed([card("upbringing", { tr })]);
    await app.studyToBack("upbringing");
    await app.openTurkish();
    await rows(page).nth(0).click();
    await rows(page).nth(2).click();
    await expect(rows(page).nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(rows(page).nth(1)).toHaveAttribute("aria-pressed", "false");
    await expect(rows(page).nth(2)).toHaveAttribute("aria-pressed", "true");
    const w = await app.word("upbringing");
    expect(w.trMine.text).toBe("yetiştirme, terbiye");
    expect(w.trMine.picks).toEqual(["yetiştirme, terbiye", "terbiye"]);

    await rows(page).nth(1).click();
    expect((await app.word("upbringing")).trMine.text).toBe("yetiştirme, terbiye, eğitim");

    /* closed, the card shows the whole choice */
    await page.locator("#trBtn").click();
    await expect(app.panel.locator(".trmine")).toContainText("yetiştirme, terbiye, eğitim");
    await page.reload();
    await app.flip();
    await expect(app.panel.locator(".trmine")).toContainText("yetiştirme, terbiye, eğitim");
  });

  test("unticking takes one off, and unticking all clears the choice", async ({ app, page }) => {
    await app.seed([card("upbringing", { tr })]);
    await app.studyToBack("upbringing");
    await app.openTurkish();
    await rows(page).nth(1).click();
    await rows(page).nth(0).click();
    expect((await app.word("upbringing")).trMine.text, "kept in the dictionary's order")
      .toBe("yetiştirme, terbiye, eğitim");
    await rows(page).nth(1).click();
    expect((await app.word("upbringing")).trMine.text).toBe("yetiştirme, terbiye");
    await rows(page).nth(0).click();
    expect((await app.word("upbringing")).trMine.text).toBe("");
    await expect(rows(page).nth(0)).toHaveAttribute("aria-pressed", "false");
  });

  test("a single pick saved by the older build shows as ticked", async ({ app, page }) => {
    await app.seed([card("upbringing", { tr, trMine: { text: "eğitim", sense: "education", own: 0, t: 1000 } })]);
    await app.studyToBack("upbringing");
    await app.openTurkish();
    await expect(rows(page).nth(1)).toHaveAttribute("aria-pressed", "true");
    await rows(page).nth(0).click();
    expect((await app.word("upbringing")).trMine.text).toBe("yetiştirme, terbiye, eğitim");
  });
});
