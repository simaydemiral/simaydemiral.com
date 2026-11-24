const { test, expect, card } = require("../support");

/* Reported by the owner: dragging across a word on the card to select it
   turned the card over instead. Picking text out is not a request to flip. */

async function dragAcross(page, locator) {
  const box = await locator.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y, { steps: 5 });
  await page.mouse.move(box.x + box.width - 2, y, { steps: 5 });
  await page.mouse.up();
}
const picked = (page) => page.evaluate(() => String(window.getSelection()).trim());

test.describe("Selecting text on a card @desktop", () => {
  test("dragging across the word selects it and leaves the card where it was", async ({ app, page }) => {
    await app.seed([card("upbringing")]);
    await app.start();
    await dragAcross(page, page.locator("#face .term"));
    expect(await picked(page)).toContain("upbringing");
    await page.waitForTimeout(300);
    await expect(app.back).toHaveCount(0);
    await expect(app.face).toBeVisible();

    /* and an ordinary click after that still turns it over */
    await app.flip();
  });

  test("selecting a meaning on the back does not turn it back", async ({ app, page }) => {
    await app.seed([card("upbringing")]);
    await app.studyToBack("upbringing");
    const meaning = app.back.getByText("Plain meaning of upbringing.");
    await dragAcross(page, meaning);
    expect(await picked(page)).toContain("Plain meaning");
    await page.waitForTimeout(300);
    await expect(app.back).toBeVisible();
  });

  test("a press held down without dragging does not flip", async ({ app, page }) => {
    await app.seed([card("upbringing")]);
    await app.start();
    const box = await app.face.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 90);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await expect(app.back).toHaveCount(0);
  });

  test("grading clears the selection and moves on", async ({ app, page }) => {
    await app.seed([card("alpha"), card("beta", { id: "seed2" })]);
    await app.start();
    const first = (await app.face.locator(".term").textContent()).trim();
    await app.flip();
    await dragAcross(page, app.back.locator(".term"));
    expect(await picked(page)).toContain(first);
    await app.grade("yes");
    await expect(app.face).toBeVisible();
    await expect(app.face.locator(".term")).not.toHaveText(first);
    expect(await picked(page)).toBe("");
  });
});
