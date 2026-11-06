# simaydemiral.com

My personal site, and the three things I built that live on it. Plain HTML,
CSS and vanilla JavaScript — no framework, no build step, no dependencies.
Each tool is a single self-contained file you can open straight from disk.

## The tools

**[Ledger](public/ledger/index.html)** — `/ledger`
Drop in a bank CSV and see where the money went. It reads the statement
formats the banks actually export, works out which column is the amount and
which way the signs run, recognises merchants from the raw description, and
sorts them into categories you can correct. Splits a charge across
categories, spots subscriptions by their rhythm, nets refunds against what
you spent, and tells apart money arriving from money coming back. Nothing
is uploaded: the file is parsed in the browser and stays there.

**[FlashCards](public/vocab/index.html)** — `/vocab`
Select a word on any page, click a bookmarklet, and it is saved with the
sentence you met it in. Definitions come from Wiktionary, following
"plural of" and "abbreviation of" pointers until it reaches a real meaning;
pronunciation and IPA from a dictionary API; Turkish from Wiktionary's
per-sense translation tables. Spaced repetition on a Leitner schedule.
Where no source knows a word, it says so rather than inventing one.

**[The Dispatch](public/dispatch.html)** — `/dispatch`
A morning news page, rebuilt daily by a scheduled job: four desks of
stories from primary sources, market levels, and upcoming fixtures.
The generator is not in this repo.

## Running it

```sh
npx wrangler dev        # http://localhost:8787
npx wrangler deploy     # live in a few seconds
```

Or just open any of the HTML files above in a browser — the tools need no
server at all.

## Layout

```
public/index.html              homepage
public/style.css               all site styling; tokens in :root at the top
public/tinkering/*.html        write-ups of how each tool was built
public/ledger/                 the Ledger — index.html plus rules.js
public/vocab/                  FlashCards and its capture page
public/dispatch.html           today's Dispatch; public/dispatch/ is the archive
wrangler.jsonc                 Cloudflare config
```
