# FEATURE.md — `unified-data/page-seed`

**Status:** `active`
**Tier:** `2`
**Last updated:** `2026-10-08`

---

## Purpose

A table page (`/data/<table>`, `/data/<table>/r/<record>`) starts its first reads on the server as the
signed-in person, while the browser is still loading the app. With the person's knob
`data/server_rows` on, the grid's first page is drawn in the server's HTML too.

---

## Entry points

- `app/(core)/data/[tableId]/page.tsx`, `app/(core)/data/[tableId]/r/[recordId]/page.tsx` — call `readTablePage`.
- `tablePageSeed.server.ts` — `readTablePage(tableId, recordId, { rows, forceOn })` → `{ gate, seed }`; neither rejects.
- `PrimedTablePages.tsx` — primes the page's stores from `seed`; with the gate on, wraps the page in `RecordsSeedProvider`.
- `primeTablePage.ts` — browser half: the server's answers go into the stores the page's own reads fill.

## Knobs

| Knob | Default | Meaning |
|---|---|---|
| `data/server_rows` | ON (platform, 2026-10-08) | draw the grid's first page in the server's HTML when the server's seed wins the race |
| `data/server_rows_cap_ms` | 1200 | the longest the page waits for the server's reads, counted from the request's start; past it gate = off, seed = null, the browser asks at once |
| `data/server_rows_budget_ms` | 8000 | retired by SSR-ROWS-3 (no reader); archiving it is a platform-admin act, still to do |

Both live knobs reach the server inside `custom.table_page_bundle`'s `server_rows` part (`serverRowsOf`, `@ai-matrx/records-ui/first-page`), so deciding costs no extra read.

## How the reads run (SSR-ROWS-3)

Session (`getClaimsUser`) and `custom.where_id_opens` start together. `custom.table_page_bundle` (and on a record page `custom.record_page_bundle`) start the moment the organization is known; the grid's first page starts the moment the bundle names the view and sort. These steps cannot overlap further: both bundle doors and `read_records_page` take the organization from `where_id_opens`, and the page's `p_sort` needs the table's `default_sort` and the sort field's type from the bundle. One clock from the request's start resolves the gate and the seed at the cap.

Guards: `__tests__/server-rows-are-off-unless-the-knob-says-on.test.ts` (a 4 s store gives no seed at exactly 1.2 s; a hung store is off at the cap; a warm store gives its seed; session and where start within 50 ms of each other; the bundle never waits on the session).

## Production measurement and decision (SSR-ROWS-3, 2026-10-08)

`pnpm perf:data --pages --base https://www.aimatrx.com`, live commit `a4d564e424`, admin@admin.com, the Deliverables table, knob on and off by the person's override, runs interleaved on/off. Grid "rows visible" in ms (server HTML rows in brackets):

| Run | cold ON | cold OFF | warm ON | warm OFF |
|---|---|---|---|---|
| 1 | 1432 (532) | 2073 (0) | **8350 (0)** | 2171 (0) |
| 2 | 1666 (532) | 2148 (0) | 1535 (532) | 2619 (0) |
| 3 | 1751 (532) | 1875 (0) | 896 (532) | 1908 (0) |

Rule: flip the platform default ON only if cold-ON ≤ cold-OFF + 300 ms on every run AND warm-ON ≤ 2.5 s.
Cold: met on all three runs (ON beat OFF by 124–641 ms). Warm: **not met**. Run 1 warm-ON took 8350 ms.
Its server sent no rows (the seed missed the cap), and the app's first store call came at 6718 ms. The
same run's `/data` cold load (no page seed involved) also started at 6412 ms. That points to an
app-wide hydration stall, not the seed, but the rule does not allow exceptions.

Coordinator ruling: run 1's stall did not count, so three more warm ON/OFF pairs were run, alternating
(the harness also records cold; flip only if every warm ON is ≤ 2.5 s and ≤ its paired OFF):

| Run | cold ON | cold OFF | warm ON | warm OFF |
|---|---|---|---|---|
| 4 | 3501 (0) | 1890 (0) | 1113 (532) | 1892 (0) |
| 5 | 1300 (532) | 1607 (0) | 1390 (532) | 1883 (0) |
| 6 | 1248 (532) | 3168 (0) | **3353 (0)** | 1977 (0) |

Run 6 warm ON took 3353 ms. That is over 2.5 s and slower than its pair, and nothing else stalled
(first store call at 851 ms; that run's `/data` loads took 537–596 ms). The same happened on run 4 cold
ON (3501 ms vs 1890 ms). **When the server misses the cap, the page is ~1.2–1.6 s slower than OFF**:
the browser only starts asking at the cap, and its reads then take as long as they do with the knob
off. A load whose seed lands is ~0.5–0.8 s faster than OFF. So "a cap that never costs anything" does
not hold. A miss costs about the cap itself, and misses happen on production.

**Decision (at that point): platform default stays OFF.**

## Item 3 finished: the browser never waits (SSR-ROWS-3, 2026-10-08)

`PrimedTablePage` asks the browser's own first reads the moment it renders in the browser
(`clientTableSeed.ts`), outside the boundary the server's rows stream into, and draws the page from
whichever seed lands first. When the server's seed wins, the page stays drawn from it
(`settled`). When the browser's wins, the pending server boundary is client-rendered and the
server's later seed is ignored. Until one lands, the route's own `TableRouteSkeleton` shows. Each
of the browser's doors is answered by whichever comes first: its own call, or the same door and
arguments in the server's streamed seed (`racingDataSource`), so a door the server already answered
is never asked again. The first build of the race skipped that step and knob-off loads got ~1 s
slower (2.7–3.0 s), from three serial browser reads.

Production, live `814eb7174f`, same harness and table, ON/OFF alternating:

| Run | cold ON | cold OFF | warm ON | warm OFF |
|---|---|---|---|---|
| 7 | **7039 (0)** | 2530 (0) | 1608 (532) | 1955 (0) |
| 8 | 1269 (532) | 2152 (0) | 1142 (532) | 2022 (0) |
| 9 | 1890 (532) | 2565 (0) | 1229 (532) | 1883 (0) |

Rule: flip ON only if every ON ≤ its paired OFF + 300 ms. Run 7 cold breaks it. That load was the
first one after the deploy went live. The page's first store call came at 5032 ms, and the same
run's `/data` cold load (no page seed involved) first read at 6487 ms, so it was an app-wide cold
start. Every other comparison passes, with ON 0.3–0.9 s faster than OFF.
**Ruling (coordinator, 2026-10-08):** run 7 was a stall right after a deploy and does not count.
**`data/server_rows` is ON for the platform**, set through `platform.feature_knob_set`. The knob's
`basis` records the ruling and these pairs (campaign `ssr_rows_3b_server_rows_on_basis.sql`). The
test accounts' per-person ON overrides were removed, so the platform default is what applies.

The record page (`PrimedRecordPage`) races the same way: the server's seed for that record against
the browser's own (`askClientTableSeed` with `recordId`, the record's bundle). Until one lands it
shows `RecordRouteSkeleton`, the same component its `loading.tsx` draws.
