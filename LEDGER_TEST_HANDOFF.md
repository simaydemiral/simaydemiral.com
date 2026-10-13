# Ledger test loop: handoff

Working note written on 2026-10-13 from another Claude session (the "mba_kickoff" chat). It is not part of the site:
do not commit it, and delete it when the loop is finished. `wrangler deploy` only publishes `public/`, so it cannot go live.

## What Simay asked for

A two-agent loop on `public/ledger/`: a tester agent exercises the page in a real browser and reports; the main
session fixes; the tester re-checks; repeat. Goal: find what is broken or confusing, fix it, test again.

Rules she agreed to in the other chat:

- **No deploy** until she says so. All fixes stay local and go live together in one `npx wrangler deploy`.
- **One commit per fix**, local only, so any single change can be undone. (She was told this; she has not objected.)
- **Bugs get fixed without asking. New features do not**: they go to her as a list to pick from.
- **Synthetic data only.** The tester must not open or import any real statement or CSV on this Mac.
- Planned length: two rounds (test, fix, re-test), then report to her.
- "Vs your median" stays a plain, non-clickable box with no hover state. Every other summary box is clickable.

## State of the code when round 1 ran

Round 1 ran while this repo was being edited. The tester's line numbers are for the version committed at 15:07
(`de9f657`, "Keep the month positive: money arriving is not a refund"). Edits made after that (the cash model:
withdrawals count as spending, deposits are ignored, box reads "Cash withdrawn") were NOT tested. Bug 3 below was
measured against the 15:07 version and needs re-measuring against the current one.

## How to run the tester

Spawn a general-purpose subagent with a brief like the one below. Keep the same agent for the re-test (continue it
with SendMessage) so it remembers its cases.

Local preview: the tester used a static server on the `public/` folder. Config that worked (put it in this
project's `.claude/launch.json` and start it with the browser tool `preview_start`, name `personal-site`):

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "personal-site",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8791", "--directory", "/Users/simaydemiral/personal_website/public"],
      "port": 8791
    }
  ]
}
```

Tester brief (adapt the "what changed" section to the current code):

> You are the tester in a two-agent loop. I own the code and will fix what you find, then message you to re-test.
> Exercise the Ledger page hard, in a real browser, and report what is broken or confusing. Do not fix anything.
>
> Files: `public/ledger/index.html` (CSS, markup, one inline script) and `public/ledger/rules.js` (categories and
> rules). Read both first so your cases target real code paths.
>
> Run it: `preview_start` name `personal-site`, open `http://localhost:8791/ledger/`. Import a CSV without the file
> picker by running in the page:
> `const inp=document.querySelector('input[type=file]'); const dt=new DataTransfer(); dt.items.add(new File([csvText],'name.csv',{type:'text/csv'})); inp.files=dt.files; inp.dispatchEvent(new Event('change',{bubbles:true}));`
> then wait about a second. Reset between scenarios with `localStorage.clear(); location.reload();` (clearing
> without reloading is not enough: the in-memory copy is saved back). Read results from `#meters`, `#summary`,
> `#cats`, `#tbl` and the tab counters; screenshot when layout matters; check the console after each scenario
> (ignore Cloudflare analytics CORS errors on localhost). Node is at `~/.local/node/bin/node`.
>
> Hard rules: synthetic data only, never open a real statement or CSV on this machine; do not modify anything under
> the repo; no state-changing git; no deploy. When finished, clear localStorage on localhost, reload, stop the
> preview.
>
> Report, most severe first: (1) bugs, each with a one-line statement, exact reproduction (CSV text and clicks),
> expected vs actual, "observed in browser" or "inferred from code", and suspected `file:line`; (2) improvement
> ideas with a size; (3) what you tested and found working. Say what you could not test and why.

## Round 1 report (tester's own words, lightly trimmed)

Everything marked "observed" was reproduced in the browser at `http://localhost:8791/ledger/` with synthetic data.
Four of these were spot-checked against the code afterwards and hold: 1, 2, 9 and the missing doctype/viewport in 11.

### Bugs, most severe first

**1. Reloading the page silently deletes a legitimate transaction after two overlapping exports.** Observed.
- Repro: import `checking-jan.csv`:
  `Date,Description,Amount\n01/18/2026,TRADER JOE'S #123 BERKELEY CA,-40.00\n01/20/2026,CLIPPER TRANSIT FARE SAN FRANCISCO CA,-2.75\n`
  then `checking-jan-feb.csv`: the same two rows, plus a second identical
  `01/20/2026,CLIPPER TRANSIT FARE SAN FRANCISCO CA,-2.75` and `02/02/2026,SAFEWAY #0789 BERKELEY CA,-25.00`.
  Toast: "2 new, 2 already had"; 4 transactions stored. Reload.
- Expected: 4 transactions. Actual: toast "Removed 1 transactions that had been imported twice.", 3 left in memory
  and in localStorage. Re-importing adds it back and the next reload removes it again.
- Cause: `dedupeStored` keeps "as many as the busiest single account had"; the two taps carry different account
  names because the account comes from the filename. `index.html:478-515` (the cut is line 498).

**2. Sign is inverted for any file that is mostly credits, even with explicit Debit/Credit columns; a Type column is ignored.** Observed (via `SPEND.importFile`).
- A (`dc.csv`): `Date,Description,Debit,Credit` with 7 rows `10/0x/2026,Zelle payment from CLIENT A..G,,<amount>`
  and one `10/09/2026,TRADER JOE'S,80.00,`. All seven receipts stored negative; Trader Joe's stored +80.
- B (credits-only card month, `card-oct_9999.csv`):
  `Date,Description,Debit,Credit\n10/02/2026,TARGET T-1234 REFUND,,35.00\n10/05/2026,AMAZON RETURN CREDIT,,20.00\n10/09/2026,MYSTERY SHOP ADJUSTMENT,,12.00`
  -> all three stored as charges (-35, -20, -12).
- C (Capital One 360 layout):
  `Account Number,Transaction Description,Transaction Date,Transaction Type,Transaction Amount,Balance` with
  unsigned amounts and Type = Debit/Credit -> "Zelle money received from PAT KIM 300.00 Credit" stored as -300.
- D (signed Amount column, 8 Zelle receipts + 2 purchases): everything flipped, purchases become +80/+40.
- Expected: Debit/Credit columns and signed amounts are never flipped; Type decides when amounts are unsigned.
- `index.html:719-726` (flip heuristic runs for every layout); debit-only/credit-only fallback at 695-701; `type`
  in `HEADER_SETS` is never read.

**3. Chart, Merchants tab and box click-throughs still use the old netting, so numbers no longer agree.** Observed on the 15:07 version; re-measure.
- Repro:
  `Date,Description,Amount\n06/10/2026,NORDSTROM #0423,-200.00\n06/12/2026,TRADER JOE'S #123,-50.00\n07/02/2026,NORDSTROM #0423,200.00\n07/05/2026,IKEA EMERYVILLE,300.00\n07/10/2026,MOBILE CHECK DEPOSIT 7781,450.00\n07/12/2026,Zelle payment from PAT KIM,75.00\n08/03/2026,TRADER JOE'S #123,-60.00\n08/09/2026,LOCAL BIKE COOP,-20.00\n08/10/2026,LOCAL BIKE COOP REBATE CHECK,90.00`.
  Select July.
- Actual: Day-to-day box -$500, chart tooltip for July -$1,025. Clicking Day-to-day opens 4 rows summing +$1,025
  (includes the Zelle and cheque credits the box excludes). July Uncategorised box "$0" opens a +$450 row; August
  Uncategorised "$20.00" opens -$20 and +$90.
- Expected: chart point = box; rows behind a box sum to the box.
- `index.html:1160` (trendSeries still `t.spend - t.refund`), `1703` (Merchants), `2007-2010` (openMeter rows
  include MONEY_IN credits).

**4. "12 months" / "6 months" / "12 weeks" show one extra, partial first bucket that does not match the month view.** Observed.
- Repro: 14 months ending 2026-09-28 (per month: Trader Joe's on the 5th, Netflix 12th, Chevron 20th, Safeway
  -20.00 on the 28th). Monthly + 12 months.
- Actual: 13 points; September 2025 shows $31.99 while the month view says $188. "6 months" shows 7 points.
  "12 weeks" shows 13 weeks with a part first week. Footer average is dragged down ("$185 a month" over 13).
- Expected: window snapped to whole months/weeks. `index.html:1149`, SPANS at 1109-1113.

**5. The Balance column is imported as the amount when the amount header is not in the known list.** Observed.
- Repro (`odd2.csv`, newest first):
  `Date,Description,Balance,Net Amount\n09/28/2026,COFFEE SHOP ONE,900.00,-5.00\n09/27/2026,GROCERY STORE TWO,905.00,-45.00\n09/26/2026,GAS STATION THREE,950.00,-30.00\n09/25/2026,BOOK STORE FOUR,980.00,-20.00\n09/24/2026,PAYCHECK FIVE,1000.00,500.00\n09/23/2026,PHARMACY SIX,500.00,-12.00`
- Actual: -900, -905, -950, -980, -1000, -500. Expected: -5, -45, -30, -20, +500, -12.
- `index.html:702-711`: the `cands.length >= 2` branch ignores `namedBal`, and `isRunningBalance` (732-745) only
  recognises oldest-first files and needs 5 comparable rows.

**6. A DD/MM file imports with wrong months and silently drops every row whose day is above 12.** Observed.
- Repro (`uk.csv`): `Date,Description,Amount` with 01/09/2026 ... 12/09/2026 (9 rows),
  `13/09/2026,RENT PAYMENT,-900.00`, `25/09/2026,SALARY,2500.00`.
- Actual: toast "9 new"; rows land in nine different months; rent and salary are skipped with no mention outside
  the Files tab. A file where every day is >12 is rejected with "No date column found."
- Expected: detect day-first when any first field exceeds 12, or at least warn. `index.html:573-584`.

**7. Custom categories break the clickable boxes, and the split editor can save a category called "__new".** Observed.
- (a) Create a custom category for a $60 merchant. Day-to-day includes the $60; clicking it opens rows without
  that merchant. Same for Refunded back. `index.html:2002-2005` (`catsWhere` iterates `CATEGORIES`, not
  `allCategories()`).
- (b) Split a charge, choose "+ New category…" in the second part, enter -40 / -20, Save. No prompt; the part is
  stored with `cat:"__new"`; a bar labelled "__new $20" appears. `index.html:2188` and `2165`.

**8. A pending charge is cleared by an older, already-imported charge when any unrelated file is imported.** Observed.
- Repro: have `10/01/2026,PEETS COFFEE,-4.75` imported. Add pending 2026-10-11 / Peets Coffee / 4.75. Import
  `Date,Description,Amount\n10/12/2026,BERKELEY BOWL WEST,-33.00`.
- Actual: "1 new, 1 pending cleared"; the pending Peets is matched to the 10/01 charge that predates it.
- `index.html:976-999` (absolute 14-day window at 988-989; scans all of `db.txns`).

**9. ATM fees are categorised as Cash; cash still counts in Subscriptions and Merchants.** Observed.
- Repro: monthly `ATM FEE - NON-NETWORK ATM,-3.50` and
  `BKOFAMERICA ATM 09/15 #000001213 WITHDRWL SHATTUCK BERKELEY CA,-100.00`.
- Actual: fee folded into the cash box and absent from Fees. Subscriptions lists "BofA cash withdrawal Monthly
  $100" and the fee, and counts them in the yearly figure; Merchants lists "BofA cash withdrawal $1,400".
- `rules.js:74` (tier 1 `\bATM\b`) beats `rules.js:262` (tier 2 `ATM ?FEE`); `index.html:1571` and `1701` lack
  the `CASH` check. How cash should count here depends on the cash model chosen after 15:07.

**10. Chart axis labels are wrong.** Observed.
- (a) The last x label sits under a different point whenever (points - 1) is not a multiple of the label step
  (14 months, Monthly + All: "Aug '26" under the September point). `index.html:1210-1215`.
- (b) Negative values lose their minus sign on the y-axis and in the footer. `index.html:1198`, `1252`
  (`money0` takes `Math.abs`).

**11. On a phone the page renders as a zoomed-out 980px desktop page; with that fixed, the Transactions table overflows.** Observed at 375x812.
- The file starts at `<meta charset>`: no `<!doctype html>`, no `<meta name="viewport">`, no `lang`
  (`index.html:1-4`). With a viewport meta injected for inspection, the Transactions table is 539px wide inside a
  335px card (`index.html:130` / `383`, no overflow wrapper).

**12. Smaller confirmed defects (all observed).**
- Account label built from date digits in the filename: `Chase1234_Activity20260101_20260930_20261005.CSV` ->
  "*0261". `index.html:918`. (Also what makes bug 1 easy to hit.)
- A 50/50 split is flagged as "Possible double charges". `index.html:1619-1638`.
- A failed import with data already loaded shows "0 transactions added from 1 file."; the reason is only in a
  2.6s toast. `index.html:1946`, `1904`.
- Tab counters read "Merchants 0" and "Files 0" until each tab is opened. `index.html:1708`, `1724`.
- "Clear all data" leaves the "You have … to …" line in the drop zone. `index.html:2311-2319`.
- Refunded insight counts every credit ("3 credits" with one refund, one Zelle, one cash deposit).
  `index.html:1373`.
- In a month with a negative total, Uncategorised shows "$0" in red and an empty "Still uncategorised" insight.
  `index.html:1310`, `1376`.
- Transactions table drops cents at $100 and above. `index.html:457-461` used at `1492`.
- Merchants tab shows 200 rows while its counter says 423, with no note. `index.html:1713`.
- Biggest-merchants bar click is a substring search ("Shell" also opens "Shell Oil Oakland"; "Amazon" also opens
  "Amazon Fresh"). `index.html:2039`, `1476`.
- Export ignores the active filters, and re-importing `spending-export.csv` doubles everything because the
  "merchant" column is taken as the description. `index.html:2251-2265`.
- Restore accepts any JSON with a `txns` array; rows lacking `amt` make the next load throw at `dedupeStored`
  (`index.html:487`) and the page shows the empty drop zone while the data is still in storage. Check at `2294`.
- Merchant names: "Trader Joe'S" (`titleCase`, `index.html:878`).

### Improvement ideas (for Simay to choose from; do not build unasked)

1. Import preview before committing: detected columns, date order, sign convention and three sample rows, with a
   "flip signs / day-first" override. Would catch bugs 2, 5 and 6 as they happen. Medium to large.
2. Make "Where it went" add up to the headline with one "credits" row. Small.
3. Put import problems in the receipt, not only a 2.6s toast. Small.
4. Files tab: remove a file and its transactions; collapse repeat imports. Medium.
5. Split editor: accept positive amounts and pre-fill the remainder. Small.
6. Label "Vs your median" as month-to-date when the selected month is the latest one; persist the theme choice.
   Small.

### Tested and working (no need to re-check)

- BofA-style checking export with summary lines above the header; card export with Debit/Credit columns (majority
  debits); Chase layout with trailing commas; Schwab-style Withdrawal/Deposit; parentheses negatives, currency
  symbols, thousands separators, quoted commas, escaped quotes, newline in a quoted field, BOM, CRLF, 2-digit
  years, ISO dates.
- Empty, header-only, prose and binary-ish files are rejected with a message and no console error.
- Same file twice: 0 new. Two identical same-day charges in one file kept as two.
- First month with no history; median of the last six months; fixed commitments split; refunds larger than
  spending in a category.
- "Vs your median": no `go` class, no tabindex or role, skipped by Tab.
- Keyboard: Tab reaches each clickable box with a visible focus ring; Space and Enter activate boxes and bars.
- Transactions filters alone and combined, including the In/Out dropdown (`#fDir`) and the amount range.
- Split: balance check, save, per-part recategorise, Undo, cancel.
- Recategorise merchant-wide and custom categories persist after reload. Pending add/validate/remove.
- Duplicate-charge card and Acknowledge; "Tag them"; Subscriptions cadence.
- Backup -> Restore round trip; Clear all data confirm/decline.
- Light and dark themes. 6,000 transactions over 24 months: import 0.2s, render 0.2-0.4s.

Not tested: real pointer hover, actual save-to-disk of Backup/Export, drag-and-drop and the native file picker,
Safari/Firefox, storage-quota failure, the deployed site.
