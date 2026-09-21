# `scripts/campaign-repairs/` — one-shot repairs of the store's own rows

A file here is NOT a suite and is deliberately not in `scripts/campaign-tests/`.

A suite proves the PRODUCT, so it takes the seat — `set local role authenticated`, the role
PostgREST gives a signed-in person — and goes through the doors alone
(`pnpm check:suites-take-the-seat` enforces exactly that, and it is right to).

A repair rewrites rows across MANY organizations to fix data a defect already created. No
person holds that reach and none ever should: taking the seat would make a repair impossible
rather than honest. So a repair runs as the role that owns `custom.record`, says so in its
own header, rehearses inside a transaction it rolls back by default, and commits only under
`-v commit_it=true`.

Each one is run once, its before/after counts are recorded in its lane's PROGRESS document,
and it stays here so the next person can read what was done and re-run it to find zero.

| File | Lane | What it repaired |
|---|---|---|
| `fieldtruth_repair_undeclared_keys.sql` | FIELD-TRUTH | 223 values on 209 records over 60 Tables carrying keys no Field declared. Default knob `declare` made each a real column; `quarantine` is the alternative. |
| `fieldtruth_repair_claimed_columns.sql` | FIELD-TRUTH | 53 column names across 48 Tables that a Table's `fields` array claimed with no Field record behind them. |

**One piece of doc-rot, on purpose.** Three FIELD-TRUTH migrations name these two files under
their old home, `scripts/campaign-tests/`. Their bytes are ledgered with their SHA-256, so
editing them would red `pnpm check:migrations` by destroying the evidence of what actually
ran. The files moved here so `pnpm check:suites-take-the-seat` stops counting a repair as a
suite; the migrations' sentences are otherwise accurate.
