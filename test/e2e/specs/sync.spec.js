const { test, expect, card, device, newUser } = require("../support");

/* Two real browser profiles on one test account, against the real Worker and
   a throwaway database. */
async function pair(browser, baseURL, lab) {
  const user = newUser();
  const a = await device(browser, baseURL, lab, user);
  const b = await device(browser, baseURL, lab, user);
  return { a, b, close: async () => { await a.context.close(); await b.context.close(); } };
}

const synced = (d) => d.page.waitForResponse((r) => r.url().endsWith("/api/sync") && r.ok(), { timeout: 20_000 });

async function pull(d) {
  const reply = synced(d);
  await d.page.reload();
  await reply;
}

async function open(d, words) {
  if (words) await d.app.seed(words);
  else await d.app.open();
  await expect(d.page.locator("#account")).toContainText(/sign out|synced|sync/i);
}

test.describe("two devices @desktop", () => {
  test("signed out cannot read or write the account", async ({ request }) => {
    const r = await request.post("/api/sync", { data: { words: [] } });
    expect(r.status()).toBe(401);
    expect((await (await request.get("/auth/me")).json()).signedIn).toBe(false);
  });

  test("a forged session is refused", async ({ request }) => {
    const r = await request.post("/api/sync", {
      data: { words: [] }, headers: { cookie: "vsid=qa-user.9999999999.forged" },
    });
    expect(r.status()).toBe(401);
  });

  test("a word added on one device appears on the other", async ({ browser, baseURL, lab }) => {
    const { a, b, close } = await pair(browser, baseURL, lab);
    await open(a);
    const sent = synced(a);
    await a.app.add("salient");
    await sent;
    await open(b);
    await expect(b.page.locator("#nAll")).toHaveText("1");
    await close();
  });

  test("a removed word stays removed on the other device", async ({ browser, baseURL, lab }) => {
    const { a, b, close } = await pair(browser, baseURL, lab);
    await open(a);
    let sent = synced(a);
    await a.app.add("alpha", "beta");
    await sent;
    await open(b);
    await expect(b.page.locator("#nAll")).toHaveText("2");
    await a.app.tab("all");
    sent = synced(a);
    await a.page.locator("tr", { hasText: "alpha" }).getByRole("button", { name: "Remove this word" }).click();
    await sent;
    await pull(b);
    await expect(b.page.locator("#nAll")).toHaveText("1");
    await close();
  });

  test("answers given on both devices while offline are all kept", async ({ browser, baseURL, lab }) => {
    const { a, b, close } = await pair(browser, baseURL, lab);
    await open(a, [card("alpha", { box: 2 })]);
    await expect.poll(async () => (await a.app.word("alpha")).updated).toBeGreaterThan(0);
    await a.page.waitForTimeout(1500);
    await open(b);
    await expect(b.page.locator("#nAll")).toHaveText("1");

    await a.context.setOffline(true);
    await b.context.setOffline(true);
    await a.app.studyToBack("alpha");
    await a.app.grade("yes");
    await b.page.waitForTimeout(30);
    await b.app.studyToBack("alpha");
    await b.app.grade("no");
    await a.context.setOffline(false);
    await b.context.setOffline(false);

    await pull(a);
    await b.page.waitForTimeout(1200);
    await pull(b);
    await a.page.waitForTimeout(1200);
    await pull(a);
    const [wa, wb] = [await a.app.word("alpha"), await b.app.word("alpha")];
    expect(wa.seen).toBe(2);
    expect(wb.seen).toBe(2);
    expect([wa.box, wa.due]).toEqual([wb.box, wb.due]);
    await close();
  });

  test("a Turkish choice travels, and survives an older copy", async ({ browser, baseURL, lab }) => {
    const { a, b, close } = await pair(browser, baseURL, lab);
    const tr = { blocks: [{ sense: "institution", words: ["banka"] }], more: [], one: "",
                 from: "Wiktionary", v: 6, miss: 0, via: "" };
    await open(a, [card("bank", { tr })]);
    await a.page.waitForTimeout(1500);
    await open(b);
    await expect(b.page.locator("#nAll")).toHaveText("1");
    await a.app.studyToBack("bank");
    await a.app.openTurkish();
    const sent = synced(a);
    await a.page.locator("[data-trpin]").first().click();
    await sent;
    await pull(b);
    expect((await b.app.word("bank")).trMine.text).toBe("banka");
    await close();
  });

  test("your own English meaning travels to the other device", async ({ browser, baseURL, lab }) => {
    const { a, b, close } = await pair(browser, baseURL, lab);
    await open(a, [card("upbringing")]);
    await a.page.waitForTimeout(1500);
    await open(b);
    await expect(b.page.locator("#nAll")).toHaveText("1");
    await a.app.studyToBack("upbringing");
    await a.page.locator("#meanBtn").click();
    await a.page.locator("#meanBox").fill("how a child is raised");
    const sent = synced(a);
    await a.page.locator("#meanSave").click();
    await sent;
    await pull(b);
    expect((await b.app.word("upbringing")).enMine?.text).toBe("how a child is raised");
    await close();
  });

  /* Reported by the owner on "upbringing": wrote a translation, pressed Save,
     and it was gone. A sync landing mid-typing swaps the card's object. */
  test("your own Turkish saves when a sync lands while typing", async ({ browser, baseURL, lab }) => {
    const { a, close } = await pair(browser, baseURL, lab);
    await open(a);
    const first = synced(a);
    await a.app.add("upbringing");
    await first;
    await a.app.studyToBack("upbringing");
    const landed = synced(a);
    await a.app.openTurkish();
    await expect(a.app.panel).toContainText("Nothing invented");
    await a.page.locator("#trWrite").click();
    await a.page.locator("#trBox").fill("yetiştirilme");
    await landed;
    await a.page.waitForTimeout(250);
    await a.page.locator("#trSave").click();
    await expect(a.app.panel).toContainText("yetiştirilme");
    expect((await a.app.word("upbringing")).trMine?.text).toBe("yetiştirilme");
    await a.page.reload();
    await a.app.flip();
    await expect(a.app.panel).toContainText("yetiştirilme");
    await close();
  });

  test("a note saves when a sync lands while typing", async ({ browser, baseURL, lab }) => {
    const { a, close } = await pair(browser, baseURL, lab);
    await open(a);
    const first = synced(a);
    await a.app.add("upbringing");
    await first;
    await a.app.studyToBack("upbringing");
    const landed = synced(a);
    await a.app.openTurkish();
    await expect(a.app.panel).toContainText("Nothing invented");
    await a.page.locator("#noteBtn").click();
    await a.page.locator("#noteBox").fill("how a child is raised");
    await landed;
    await a.page.waitForTimeout(250);
    await a.page.locator("#noteSave").click();
    await expect(a.app.back).toContainText("how a child is raised");
    expect((await a.app.word("upbringing")).note).toBe("how a child is raised");
    await close();
  });

  test("the app keeps working while offline, then catches up", async ({ browser, baseURL, lab }) => {
    const { a, b, close } = await pair(browser, baseURL, lab);
    await open(a);
    await a.context.setOffline(true);
    await a.app.add("offlineword");
    expect(await a.app.word("offlineword")).toBeTruthy();
    await a.context.setOffline(false);
    await pull(a);
    await open(b);
    await expect(b.page.locator("#nAll")).toHaveText("1");
    await close();
  });
});
