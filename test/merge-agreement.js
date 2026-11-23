#!/usr/bin/env node
/* Do the two copies of the merge rule still agree?
 *
 * Two devices meet in two places: in the page, when a sync comes back, and
 * in the Worker, when one device's list arrives and the other's is already
 * stored. Both have to settle a word the same way. They cannot share a file
 * -- the page is one self-contained HTML document and the Worker is a
 * module, and the site has no build step to bridge them -- so the rule is
 * written twice, in public/flashcards/index.html and in src/index.js.
 *
 * If they ever drift, nothing breaks loudly. One side keeps an answer the
 * other drops, a sync undoes a sitting, and it is noticed days later by
 * someone wondering why a number went down. That has already happened once,
 * for a different reason, and it cost fourteen words.
 *
 * So: run both implementations over the same situations and compare, before
 * anything is deployed.
 *
 *   node test/merge-agreement.js
 *   node test/merge-agreement.js --selftest   (proves the comparison bites)
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PAGE = path.join(ROOT, "public", "flashcards", "index.html");
const WORKER = path.join(ROOT, "src", "index.js");

/* ---------------------------------------------------------------- lifting
   Each implementation is read out of the file it lives in and evaluated on
   its own, so this test reads exactly what ships. A marker that moves is a
   failure too: better a loud "cannot find the rule" than a test that
   silently stops testing. */

function cut(text, from, to, what) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  if (a < 0 || b < 0) {
    throw new Error("Cannot find " + what + " (looked for " + JSON.stringify(from) + ")."
      + "\nThe rule has moved or been renamed; update this test before trusting it.");
  }
  return text.slice(a, b);
}

function liftPage() {
  const html = fs.readFileSync(PAGE, "utf8");
  const logmax = /var LOGMAX = (\d+);/.exec(html);
  if (!logmax) throw new Error("Cannot find LOGMAX in the page.");
  const body = cut(html, "  function keyOf(w) {",
                        "  /* What came back replaces what is here only where it is newer. */",
                        "the page's merge rule");
  const src = "var LOGMAX = " + logmax[1] + ";\n" + body + "\n;return mergeWord;";
  return new Function(src)();
}

function liftWorker() {
  const js = fs.readFileSync(WORKER, "utf8");
  const body = cut(js, "const LOGMAX", "/* The whole list goes up", "the Worker's merge rule");
  const src = body + "\n;return mergeWords;";
  return new Function(src)();
}

/* ------------------------------------------------------------- the cases
   Everything the rule is supposed to decide, and every case that has
   actually gone wrong here. */

function word(over) {
  return Object.assign({
    id: "46qt63", term: "alpha", lang: "en", deck: "Inbox",
    box: 1, seen: 0, sb: 0, due: "2026-12-01",
    added: "2026-10-01T00:00:00Z", updated: 1000
  }, over);
}

function log(n, from, box) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ t: from + i * 1000, h: "yes", b: box || 3, d: "2026-12-01" });
  }
  return out;
}

const CASES = [
  ["identical copies",
    word({ box: 3, seen: 2, sb: 2 }), word({ box: 3, seen: 2, sb: 2 })],

  ["one side answered, the other has not heard",
    word({ box: 4, seen: 3, sb: 0, at: 5000, updated: 5000, log: log(3, 2000, 4) }),
    word({ box: 1, seen: 0, sb: 0, updated: 1000 })],

  ["both answered the same word while apart",
    word({ box: 4, seen: 3, sb: 2, at: 5000, updated: 5000, log: [{ t: 5000, h: "yes", b: 4, d: "2026-12-05" }] }),
    word({ box: 1, seen: 3, sb: 2, at: 6000, updated: 6000, log: [{ t: 6000, h: "no", b: 1, d: "2026-11-19" }] })],

  ["neither has a log: answered before any of this existed",
    word({ box: 3, seen: 7, updated: 1000 }), word({ box: 1, seen: 2, updated: 1000 })],

  ["more answers between them than a word keeps",
    word({ seen: 40, sb: 0, box: 3, at: 40000, updated: 40000, log: log(40, 1000) }),
    word({ seen: 40, sb: 0, box: 3, at: 99000, updated: 99000, log: log(40, 50000) })],

  ["a failed lookup against a real one",
    word({ updated: 1000, tr: { from: "Türkçe Viksözlük", more: ["en önemli"], blocks: [], v: 5 },
           say: { audio: "https://x/a.ogg", ipa: "/x/" }, senses: ["a thing"] }),
    word({ updated: 9000, tr: { from: "none", miss: 2, v: 5, blocks: [], more: [] } })],

  ["both looked it up, the later one wins",
    word({ updated: 1000, tr: { from: "Vikisözlük", more: ["eski"], blocks: [], v: 5 } }),
    word({ updated: 9000, tr: { from: "Vikisözlük", more: ["yeni"], blocks: [], v: 5 } })],

  ["an older parse edited later, against a newer parse",
    word({ updated: 1000, tr: { from: "Wiktionary", blocks: [{ sense: "", words: ["banka"] }], more: [], v: 6 } }),
    word({ updated: 9000, tr: { from: "Wiktionary", blocks: [{ sense: "", words: ["kıran"] }], more: [], v: 5 } })],

  ["a complete answer against a newer partial one",
    word({ updated: 1000, tr: { from: "Wiktionary", blocks: [{ sense: "", words: ["ihtiyatlı"] }], more: [], v: 5 } }),
    word({ updated: 9000, tr: { from: "Vikisözlük", more: ["tedbirli"], blocks: [], v: 6, soft: 1 } })],

  ["a picked Turkish, against a copy answered later that never saw it",
    word({ updated: 1000, trMine: { text: "banka", sense: "institution", own: 0, t: 1000 } }),
    word({ updated: 9000, box: 3, seen: 1, at: 9000, log: log(1, 9000) })],

  ["two different picks, the later choice wins whatever the word's stamp",
    word({ updated: 9000, trMine: { text: "eski", sense: "", own: 1, t: 2000 } }),
    word({ updated: 1000, trMine: { text: "yeni", sense: "", own: 1, t: 5000 } })],

  ["a pick removed later, against an older copy still holding it",
    word({ updated: 9000, trMine: { text: "banka", sense: "", own: 0, t: 2000 } }),
    word({ updated: 1000, trMine: { text: "", sense: "", own: 0, t: 5000 } })],

  ["a note on one side only",
    word({ updated: 9000, note: "" }), word({ updated: 1000, note: "my own words" })],

  ["content newer on one side, the answer newer on the other",
    word({ box: 5, seen: 4, sb: 0, at: 8000, updated: 8000, log: log(4, 5000, 5) }),
    word({ box: 2, seen: 1, sb: 0, at: 2000, updated: 9000, log: log(1, 2000, 2),
           say: { audio: "https://x/b.ogg", ipa: "/y/" } })]
];

/* Compared as text with the keys in order, so a difference anywhere in the
   word is a difference, not only in the fields this test thought to check. */
function stable(o) {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return "[" + o.map(stable).join(",") + "]";
  return "{" + Object.keys(o).sort().map(function (k) {
    return JSON.stringify(k) + ":" + stable(o[k]);
  }).join(",") + "}";
}

function run(mergePage, mergeWorker) {
  const bad = [];
  for (const [name, mine, theirs] of CASES) {
    /* Both directions: a rule that only agrees when the arguments happen to
       be the right way round is not an agreement. */
    for (const [a, b, way] of [[mine, theirs, "page first"], [theirs, mine, "server first"]]) {
      const p = stable(mergePage(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))));
      const w = stable(mergeWorker(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))));
      if (p !== w) bad.push({ name, way, page: p, worker: w });
    }
  }
  return bad;
}

function report(bad) {
  if (!bad.length) {
    console.log("The page and the Worker settle all " + CASES.length
      + " cases the same way, both directions.");
    return 0;
  }
  console.error("The two copies of the merge rule DISAGREE.\n");
  for (const d of bad) {
    console.error("  " + d.name + " (" + d.way + ")");
    console.error("    page:   " + d.page);
    console.error("    worker: " + d.worker + "\n");
  }
  console.error("Fix both copies before deploying: a disagreement here loses answers"
    + "\nsilently, on whichever device syncs second.");
  return 1;
}

const mergePage = liftPage();
const mergeWorker = liftWorker();

if (process.argv.indexOf("--selftest") >= 0) {
  /* Prove the comparison bites: break one copy on purpose, in memory, and
     check this test notices. A test that cannot fail is a comment. */
  const broken = function (mine, theirs) {
    const out = mergeWorker(mine, theirs);
    out.seen = (out.seen || 0) + 1;   /* one answer miscounted, nothing else */
    return out;
  };
  const caught = run(mergePage, broken).length;
  if (!caught) {
    console.error("SELFTEST FAILED: a miscounted answer went unnoticed.");
    process.exit(1);
  }
  console.log("Selftest: one miscounted answer was caught in "
    + caught + " of " + (CASES.length * 2) + " comparisons.");
  process.exit(0);
}

process.exit(report(run(mergePage, mergeWorker)));
