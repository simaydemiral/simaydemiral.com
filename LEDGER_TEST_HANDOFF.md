# Ledger test loop: handoff

Working note, not part of the site: do not commit it, delete it when the loop is finished.
`wrangler deploy` only publishes `public/`, so it cannot go live.

## The loop

A tester agent exercises `public/ledger/` in a real browser and reports; this session fixes; the tester
re-checks. The tester plays Simay — she is the one who uses this thing — so it pushes back, asks the
questions a person asks, and argues about what a number means, not only about whether it crashes.

Rules:

- **No deploy** until she says so. Everything stays local and goes live together in one `npx wrangler deploy`.
- **One commit per fix**, local only, so any single change can be undone.
- **Bugs get fixed without asking. New features do not**: they go to her as a list to pick from.
- **Synthetic data only.** The tester must not open or import any real statement or CSV on this Mac.
- "Vs your median" stays a plain, non-clickable box. Every other summary box is clickable.

Local preview: `.claude/launch.json` holds a `personal-site` config (python3 http.server on 8791 over
`public/`). Start it with the browser tool `preview_start`, then open `http://localhost:8791/ledger/`.

## Round 1 — closed

Twelve bug groups were reported on 2026-10-13 against `de9f657`. All of them are fixed in
`cda859f`, `d56f465`, `c598029`, `c3ebbcf`, each verified in the browser at localhost:8791:

| # | Was | Now |
|---|---|---|
| 1 | Reload deleted a legitimate transaction after two overlapping exports | The id migration renumbers and never deletes; it runs once, gated on `db.idv` |
| 2 | Sign inverted for any file mostly credits; Debit/Credit and Type columns ignored | Flip only for a lone signed column, and only when the positive rows categorise as spending; Type column read; Credit-only files accepted |
| 3 | Chart, Merchants and box click-throughs still netted money arriving | All three use the box rule; `#fDir` gained "Counts as spending", which box clicks set |
| 4 | "12 months" showed 13 points with a part first bucket | Windows snap to whole months and weeks; spans count buckets, not days |
| 5 | Balance column imported as the amount | Balance dropped by name, by tracking a running total in either direction, then by being the larger column |
| 6 | DD/MM file silently dropped every row with day > 12 | One such row settles the column as day-first; the receipt says so |
| 7 | Custom categories missing from click-throughs; split could save `__new` | `catsWhere` uses `allCategories()`; the split select prompts for a name |
| 8 | A pending charge cleared by an older, already-imported charge | Match requires the charge to post on or after the pending date (2 days slack) |
| 9 | ATM fees filed as Cash; cash listed as a subscription | New tier-0 fee rule ahead of the cash rule; `CASH` excluded from `recurring()` |
| 10 | Last x label under the wrong point; negative y labels lost the minus | Labels anchored to first and last; `money0s()` keeps the sign |
| 11 | Quirks mode at 980px on a phone; tables overflowed | Doctype, `lang`, viewport meta, `<head>`/`<body>`; every table scrolls inside its card |
| 12 | Twelve smaller defects | All fixed except the merchant-bar substring search, left as a known nit |

Known and deliberately left: clicking a merchant bar filters by a substring, so "Shell" also opens
"Shell Oil Oakland". Making it exact needs a visible filter the search box cannot express.

Also changed in passing: `titleCase` no longer writes "Trader Joe'S" or "Atm Fee"; Export writes the
bank's own description so a round trip adds nothing, and exports what the filters show; Restore
validates rows before replacing anything; a month that ends negative says why instead of showing an
empty breakdown.

## Round 2 — closed

The tester ran as Simay against `c3ebbcf` and re-checked all twelve round-1 groups: every one holds.
Thirteen new defects, all fixed and verified in `e665120`:

Figures that disagreed with each other — export/re-import double-counted split charges; the month's
"Biggest merchants" ignored refunds; an unrecognised credit appeared in no tile while the receipt
named it; "Cash deposited" netted deposits against withdrawals; percentage insights used a
denominator shown nowhere.

Things the page would not explain — a first file that failed parsed its reason into a hidden box; an
empty month read "-100% below your usual"; a month with no spending was in the chart but not the
picker or the median; the Pending tile was not month-scoped; the split Save button was enabled on a
split it would refuse.

Merchant names — a bare `MMDD` left behind by the `CHECKCARD` strip turned one shop into six; `STORE
0199` ate the word `STORE`; `AMAZON PMTS`, mid-string branch numbers, `Boa`, `Usa`.

Plus: money sent to a person is out of Subscriptions, same reasoning as cash.

### Left for Simay to decide (do not build unasked)

1. Collapse the drop zone after the first import so the dashboard is the first thing on screen.
2. Prompt on repeat `external` counterparties — "you have sent Dilara $220 a month, six months
   running; what is this?" — so the biggest bar on the page can be broken apart.
3. A sum row under every filtered table: "15 transactions · $1,182.44".
4. Hide tiles that read $0; move Pending and Uncategorised to a lighter second row.
5. Renames the tester proposed that reverse Simay's own wording, so they are hers to settle:
   "Worth knowing before you interpret" → "How cash is counted"; "Fixed commitments (e.g., rent,
   tuition fee)" → "Rent & tuition"; "Counts as spending" → "What the month totals count".
6. Is Subscriptions "recurring charges" or "bills you could cancel"? The yearly headline only works
   for the second.
7. Should the all-time Merchants tab exclude rent and tuition, as the month card already does?
8. Hold the "above/below your usual" verdict until four or five months of history.
9. A trailing city still rides on some merchant names ("Trader Joe's Berkeley", two Zara branches).
   Stripping it is a judgement call about merchant identity and could disturb existing rules.

### Checked and settled

The privacy claim holds: `/ledger/` carries no analytics beacon, locally or live. The CORS noise the
tester saw on localhost comes from the other pages on the site, which do carry it.

There is a second, stale Ledger served from `/Users/simaydemiral/mba_kickoff` on port 8787. Test on
8791 only.

## Round 3 — the disagreement round

The tester was sent back to argue the recommendations that were overruled rather than being judged
silently. It conceded three (the two titles, which are Simay's own words; the ATM fee staying in the
bills list, since walking to a BofA machine *is* a cancel button; and its own first instinct on the
city strip). Its remaining arguments are below, with what was done.

### Built after that round

- **Subscriptions → "Bills you could cancel"**: every charge within $1 or 2% of the median **and**
  within four days of the same day of the month. Simay's rule, applied to all categories rather
  than only groceries.
- **The drop zone folds away once there is data.** Drag-and-drop moved from `#drop` to `document`
  first — the tester caught that collapsing the element would have silently killed the drop target.
  "Add a statement" re-opens the zone instead of firing the file dialog. The coverage line moved
  above the dashboard.
- **The counterparty prompt**, both directions, in `renderAsk()` / `askable()`. Three or more,
  monthly, amounts within 25%, one card at a time, dismissal permanent in `db.asked`.

### The city strip: tested on real data, rejected

Run against the four real statements in `~/Downloads` with a candidate rule (strip one or two
trailing tokens when a state was removed, with a keep-list). Four merchants merged correctly
(Berkeley Bowl, Target). Twenty-eight were mangled:

    BAKER AND COMMONS BERKELEY  ->  BAKER AND
    TUPPER & REED BERKELEY      ->  TUPPER &
    LADLE & LEAF - HAAS BERKELEY -> LADLE & LEAF -
    TRADER JOE S                ->  TRADER JOE

Not shippable. The tester independently reached the same conclusion and proposed the only version
worth trying: a static list of ~150 city names plus a `SAN|SANTA|SOUTH|NORTH|EAST|WEST|NEW|FORT|
LAKE|PORT|MOUNT` prefix rule, gated on the category not changing. It explicitly rejected deriving
the list from her own data, because the merchant key is what `db.rules` and `db.splits` are keyed
on, so a key that shifts as she imports orphans every saved rule and split.

### Open, and genuinely undecided

1. ~~**PG&E.**~~ Settled. Neither the two-list version nor a merchant list: the providers are
   regional (PG&E is Northern California, water is usually a city) but the *category* is the same
   everywhere, and `rules.js` already knows about sixty of them. `VARIABLE_BILL` in `rules.js`
   names the categories whose amount is meant to move — utilities, fees, health — and those are
   held to the date only, within a 2.5x ratio either way. Everything else still has to repeat to
   within 2%. PG&E, EBMUD and a phone bill with overage are listed; BART and Safeway are not,
   because they fail the date test and are not in those categories.
2. **A price rise kills a subscription.** Netflix $22.99 → $24.99 breaks the series against the
   median and the row vanishes. Fix is to compare each amount to the previous one, not the median,
   so a step change survives. Small, and probably just right.
3. **The incoming half of the counterparty prompt.** The tester argues it should not have shipped:
   asked "Elif sends you $110 a month, what is this?", the most likely true answer is "my share of
   something coming back, net it against what I spent" — and that option does not exist, because
   `external` sits in `MONEY_IN` precisely so credits never net. It was built anyway because Simay
   asked for it, and "Leave it as a transfer" is a safe default. Worth her view.
4. **"Counts as spending"** → the tester ships "What the month totals count", plus one line under
   the filter row when it is active: *Everything going out, plus refunds from shops. Not money from
   a person, not cash paid in.* The rule has never been on screen anywhere.
5. **The cash panel says nothing about deposits**, which is the half that is actually hers. The
   tester's draft, in the panel's existing bolded-lead shape: *"**A deposit is not a withdrawal
   coming back.** Money paid in is new money arriving, and the statement cannot say from where. So
   the two never cancel: $300 taken out and $1,200 paid in is $300 spent and $1,200 arrived — not
   $900 back."* It also asks for one noun on her title — "Worth knowing before you interpret —
   cash" — her words unchanged.
6. **One counterparty or two?** Two keys, always, so $60 back from Dilara never nets against $220
   sent to her. One row in the Merchants tab only: "Dilara Y — $1,320 out, $240 in, six months",
   two numbers never subtracted.
7. Still unbuilt from round 2: a sum row under every filtered table; hiding tiles that read $0;
   whether the all-time Merchants tab should exclude rent and tuition; holding the
   "above/below your usual" verdict until four or five months.

## Where things stand

Seven commits local and unpushed, `cda859f` through `9e9ff28`.
The live site has the cash model and the assumptions panel but none of the twenty-five bug fixes or
the three features.
