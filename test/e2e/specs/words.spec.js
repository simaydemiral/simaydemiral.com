const { test, expect, card, dayIn } = require("../support");

test.describe("adding words", () => {
  test("a new word is saved and survives a reload", async ({ app, page }) => {
    await app.open();
    expect(await app.add("salient")).toContain("1 added");
    await expect(page.locator("#nAll")).toHaveText("1");
    await page.reload();
    await app.tab("all");
    await expect(page.locator("#tbl")).toContainText("salient");
  });

  test("a pasted list reports exactly what happened to each line", async ({ app }) => {
    await app.open();
    const long = "x".repeat(81);
    const said = await app.add("salient", "", "ubiquitous", "salient", "???", long);
    expect(said).toBe("2 added, 1 already there, 1 too long to be a word, 1 with no letters in.");
    expect((await app.words()).map((w) => w.term).sort()).toEqual(["salient", "ubiquitous"]);
  });

  test("the same word in different capitals is one card", async ({ app }) => {
    await app.open();
    await app.add("Bank", "bank", "BANK");
    expect(await app.words()).toHaveLength(1);
  });

  test("phrases and accented words are kept intact", async ({ app }) => {
    await app.open();
    await app.add("due diligence", "Straße", "décision", "  extra   spaces  ");
    const terms = (await app.words()).map((w) => w.term);
    expect(terms).toEqual(expect.arrayContaining(["due diligence", "Straße", "décision", "extra spaces"]));
  });

  test("an empty submission adds nothing", async ({ app }) => {
    await app.open();
    expect(await app.add("   ", "")).toContain("Nothing to add");
    expect(await app.words()).toHaveLength(0);
  });

  test("a multi-word phrase can be studied without errors", async ({ app, page }) => {
    await app.open();
    await app.add("due diligence");
    await app.start();
    await expect(app.face).toContainText("due diligence");
    await app.flip();
    await app.grade("yes");
    await expect(page.getByText("All done")).toBeVisible();
  });

  test("markup in a word is shown as text and never runs", async ({ app, page }) => {
    const evil = `<img/src=x/onerror=window.__xss=1>`;
    await app.open();
    await app.add(evil);
    await app.tab("all");
    await expect(page.locator("#tbl")).toContainText(evil);
    await expect(page.locator("#tbl img")).toHaveCount(0);
    await app.start();
    await expect(app.face).toContainText(evil);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});

test.describe("removing words", () => {
  test("Remove in All words deletes it for good", async ({ app, page }) => {
    await app.seed([card("alpha"), card("beta")]);
    await app.tab("all");
    page.once("dialog", (d) => d.accept());
    await page.locator("tr", { hasText: "alpha" }).getByRole("button", { name: "Remove this word" }).click();
    await expect(page.locator("#tbl")).not.toContainText("alpha");
    await page.reload();
    await app.tab("all");
    await expect(page.locator("#tbl")).not.toContainText("alpha");
    await expect(page.locator("#tbl")).toContainText("beta");
  });

  test("a word with content asks before Remove in All words", async ({ app, page }) => {
    await app.seed([card("alpha", { note: "My own note", src: { sentence: "Where I found alpha." } })]);
    await app.tab("all");
    let asked = false;
    page.once("dialog", (d) => { asked = true; return d.dismiss(); });
    await page.getByRole("button", { name: "Remove this word" }).click();
    await page.waitForTimeout(150);
    expect(asked, "All words should confirm like the study card does").toBe(true);
    expect(await app.words()).toHaveLength(1);
  });

  test("a word with nothing on it is removed without a question", async ({ app, page }) => {
    await app.open();
    await app.add("typo");
    await app.tab("all");
    let asked = false;
    page.on("dialog", (d) => { asked = true; return d.dismiss(); });
    await page.getByRole("button", { name: "Remove this word" }).click();
    await expect(page.locator("#nAll")).toHaveText("0");
    expect(asked).toBe(false);
  });

  test("the bin on a card asks first, and Cancel keeps the word", async ({ app, page }) => {
    await app.seed([card("alpha")]);
    await app.start();
    page.once("dialog", (d) => d.dismiss());
    await page.locator(".cardkill").click();
    await expect(app.face).toContainText("alpha");
    expect(await app.words()).toHaveLength(1);
  });

  test("confirming the bin removes it and shows the next card's front", async ({ app, page }) => {
    await app.seed([card("alpha"), card("beta")]);
    await app.start();
    const first = (await app.face.textContent()).includes("alpha") ? "alpha" : "beta";
    await app.flip();
    page.once("dialog", (d) => d.accept());
    await page.locator(".cardkill").click();
    await expect(app.face).toBeVisible();
    await expect(app.face).not.toContainText(first);
    expect((await app.words()).map((w) => w.term)).not.toContain(first);
  });

  test("Clear all needs confirming", async ({ app, page }) => {
    await app.seed([card("alpha"), card("beta")]);
    page.once("dialog", (d) => d.dismiss());
    await page.locator("#wipe").click();
    expect(await app.words()).toHaveLength(2);
    page.once("dialog", (d) => d.accept());
    await page.locator("#wipe").click();
    await expect(page.locator("#nAll")).toHaveText("0");
    await page.reload();
    await expect(page.locator("#nAll")).toHaveText("0");
  });
});

test.describe("studying", () => {
  test("a card turns over and back by tapping", async ({ app, page }) => {
    await app.seed([card("alpha")]);
    await app.start();
    await app.flip();
    await expect(app.back).toContainText("Plain meaning of alpha");
    await app.back.click({ position: { x: 12, y: 12 } });
    await expect(app.face).toBeVisible();
    await expect(page.locator("#gYes")).toHaveCount(0);
  });

  test("the keyboard alone can study a card @desktop", async ({ app, page }) => {
    await app.seed([card("alpha", { box: 2 })]);
    await app.start();
    await page.keyboard.press("Space");
    await expect(app.back).toBeVisible();
    await page.keyboard.press("3");
    await expect(page.getByText("All done")).toBeVisible();
    expect((await app.word("alpha")).box).toBe(3);
  });

  test("Knew it moves a word up and schedules it later", async ({ app, page }) => {
    await app.seed([card("alpha", { box: 2 })]);
    await app.studyToBack("alpha");
    await app.grade("yes");
    await expect(page.getByText("All done")).toBeVisible();
    const w = await app.word("alpha");
    expect(w.box).toBe(3);
    expect(w.due > dayIn()).toBe(true);
    expect(w.seen).toBe(1);
  });

  test("Not yet sends it back to the start and keeps it due", async ({ app }) => {
    await app.seed([card("alpha", { box: 4 })]);
    await app.studyToBack("alpha");
    await app.grade("no");
    const w = await app.word("alpha");
    expect(w.box).toBe(1);
    expect(w.due <= dayIn()).toBe(true);
  });

  test("Almost comes back tomorrow", async ({ app }) => {
    await app.seed([card("alpha", { box: 3 })]);
    await app.studyToBack("alpha");
    await app.grade("mid");
    const w = await app.word("alpha");
    expect(w.due).toBe(dayIn(1));
  });

  test("a sitting in progress survives a reload", async ({ app, page }) => {
    await app.seed([card("alpha"), card("beta"), card("gamma")]);
    await app.start();
    await app.flip();
    await app.grade("yes");
    const left = await page.locator("#nDue").textContent();
    await page.reload();
    await expect(app.face).toBeVisible();
    await expect(page.locator("#nDue")).toHaveText(left);
  });

  test("Study anyway offers a round when nothing is due", async ({ app, page }) => {
    await app.seed([card("alpha", { box: 3, due: dayIn(5) })]);
    await expect(page.getByText("Nothing due today")).toBeVisible();
    await page.locator("#goAnyway").click();
    await expect(app.face).toContainText("alpha");
  });

  test("a word scheduled for tomorrow is due tomorrow", async ({ app, page }) => {
    await app.seed([card("alpha", { box: 3, due: dayIn(1) })]);
    await expect(page.locator("#nDue")).toHaveText("0");
    await page.clock.setFixedTime(new Date(Date.now() + 2 * 86_400_000));
    await page.reload();
    await expect(page.locator("#nDue")).toHaveText("1");
  });
});

test.describe("notes", () => {
  test("a note can be written, edited and cleared on a card", async ({ app, page }) => {
    await app.seed([card("alpha")]);
    await app.studyToBack("alpha");
    await page.locator("#noteBtn").click();
    await page.locator("#noteBox").fill("first thought");
    await page.locator("#noteSave").click();
    await expect(app.back).toContainText("first thought");
    expect((await app.word("alpha")).note).toBe("first thought");
    await page.locator("#noteBtn").click();
    await page.locator("#noteBox").fill("");
    await page.locator("#noteSave").click();
    expect((await app.word("alpha")).note).toBe("");
  });

  test("a note can be written from All words", async ({ app, page }) => {
    await app.seed([card("alpha")]);
    await app.tab("all");
    await page.locator("tr", { hasText: "alpha" }).getByRole("button", { name: "Note" }).click();
    await page.locator("#rowNote").fill("from the list");
    await page.locator("[data-note-save]").click();
    await expect(page.locator("#tbl")).toContainText("from the list");
  });
});

test.describe("decks and languages", () => {
  test("a deck can be created, used, renamed and deleted without losing words", async ({ app, page }) => {
    await app.seed([card("alpha")]);
    await app.tab("decks");
    await page.locator("#newDeck").fill("Finance");
    await page.locator("#newDeckGo").click();
    await expect(page.locator("#p-decks")).toContainText("Finance");

    await app.tab("all");
    await page.locator("select[data-deck]").selectOption("Finance");
    await expect.poll(async () => (await app.word("alpha")).deck).toBe("Finance");

    await app.tab("decks");
    await page.locator('[data-rename="Finance"]').click();
    await page.locator("#deckName").fill("Markets");
    await page.locator('[data-rensave="Finance"]').click();
    await expect.poll(async () => (await app.word("alpha")).deck).toBe("Markets");

    page.once("dialog", (d) => d.accept());
    await page.locator('[data-deckdel="Markets"]').click();
    await expect.poll(async () => (await app.word("alpha")).deck).toBe("Inbox");
  });

  test("each language keeps its own words", async ({ app, page }) => {
    await app.open();
    await app.add("house");
    await page.locator('[data-space="de"]').click();
    await expect(page.locator("#nAll")).toHaveText("0");
    await app.add("Haus");
    expect((await app.word("Haus")).lang).toBe("de");
    await page.locator('[data-space="en"]').click();
    await expect(page.locator("#nAll")).toHaveText("1");
    await page.reload();
    await expect(page.locator("#nAll")).toHaveText("1");
  });
});

test.describe("backup", () => {
  test("export then import restores every word and answer", async ({ app, page }) => {
    await app.seed([card("alpha", { note: "keep me", box: 4 }), card("beta")]);
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#export").click()]);
    const file = await download.path();
    page.once("dialog", (d) => d.accept());
    await page.locator("#wipe").click();
    await expect(page.locator("#nAll")).toHaveText("0");
    await page.locator("#file").setInputFiles({
      name: "backup.json", mimeType: "application/json", buffer: require("fs").readFileSync(file),
    });
    await expect(page.locator("#nAll")).toHaveText("2");
    const a = await app.word("alpha");
    expect([a.note, a.box]).toEqual(["keep me", 4]);
  });

  test("a damaged import is refused and changes nothing", async ({ app, page }) => {
    await app.seed([card("alpha")]);
    await page.locator("#file").setInputFiles({
      name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{not json"),
    });
    await expect(app.toast).toContainText("not JSON");
    expect(await app.words()).toHaveLength(1);
  });
});

test.describe("resilience, access and speed", () => {
  test("damaged saved data does not stop the app opening", async ({ app, page }) => {
    await page.goto("/flashcards/manifest.webmanifest");
    await page.evaluate(() => localStorage.setItem("vocab.v1", "{broken"));
    await app.open();
    await app.add("recovered");
    await expect(page.locator("#nAll")).toHaveText("1");
  });

  test("no screen overflows sideways", async ({ app, page }) => {
    await app.seed([card("a-very-long-unbroken-word-for-the-layout-to-handle-properly")]);
    for (const tab of ["due", "all", "decks", "stats", "add"]) {
      await app.tab(tab);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(over, `${tab} overflows by ${over}px`).toBeLessThanOrEqual(0);
    }
  });

  test("every visible control has a name", async ({ app, page }) => {
    await app.seed([card("alpha")]);
    await app.studyToBack("alpha");
    const unnamed = await page.evaluate(() => [...document.querySelectorAll("button,input,select,textarea")]
      .filter((e) => e.offsetParent && !(e.getAttribute("aria-label") || e.title || e.innerText?.trim()
                                         || e.placeholder || e.labels?.length))
      .map((e) => e.outerHTML.slice(0, 70)));
    expect(unnamed).toEqual([]);
  });

  test("main study buttons are large enough to tap", async ({ app, page }) => {
    await app.seed([card("alpha")]);
    await app.studyToBack("alpha");
    for (const id of ["gNo", "gMid", "gYes", "trBtn", "noteBtn"]) {
      const box = await page.locator(`#${id}`).boundingBox();
      expect(Math.min(box.width, box.height), `${id} is too small`).toBeGreaterThanOrEqual(24);
    }
  });

  test("a large deck stays usable", async ({ app, page }) => {
    const many = Array.from({ length: 1000 }, (_, i) => card(`word${i}`, { box: 3, due: dayIn(4) }));
    await app.seed(many);
    await expect(page.locator("#nAll")).toHaveText("1000");
    const ms = await page.evaluate(async () => {
      const t = performance.now();
      document.querySelector('[data-tab="all"]').click();
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r)));
      return performance.now() - t;
    });
    test.info().annotations.push({ type: "metric", description: `All words, 1000 cards: ${Math.round(ms)}ms` });
    expect(ms).toBeLessThan(1500);
  });

  test("the public demo never writes to a person's saved deck", async ({ app, page }) => {
    await app.seed([card("mine")]);
    const before = await page.evaluate(() => localStorage.getItem("vocab.v1"));
    await page.goto("/flashcards/?demo=1");
    await expect(page.locator("#tabs")).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => localStorage.getItem("vocab.v1"))).toBe(before);
  });
});
