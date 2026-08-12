---
status: active
updated: 2026-08-12
repos: [matrx-frontend, aidream]
---

# Per-page analysis workers — stabilization to the finish line

The `web.analysis_result` audit workers (commissioned by Arman's 2026-08-08
ruling; parent doc: [marketing-brand-coverage-program.md](marketing-brand-coverage-program.md))
are BUILT, MERGED, and DEPLOYED — and they genuinely work on small/medium
sites. They are NOT done: on large-evidence sites the run silently dies, which
is exactly what Arman hit in the UI ("Analyze spins forever, then nothing").
This doc is the complete state + the punch list to finish.

## What exists and where (verified live 2026-08-12)

**Server (aidream `packages/matrx-scraper`, deployed at
scraper.app.matrxserver.com, live version confirmed via `GET /health`):**

- `matrx_scraper/web_crawl/analysis.py` — `analyze_site_pages`, the
  deterministic `system_rules` provider. Shipped 2026-08-08 with 15 checks;
  since extended by other agents to **~63 catalogue checks** including 7
  site-subject checks (TLS/HSTS/security-headers/robots via the STORED
  `site_probe`), GSC-evidence checks over `seo.search_performance_daily`
  (`gsc_cannibalization.py`), site-graph checks (`site_analysis.py`,
  `link_score` BFS/orphans), and transport-only page facts from
  `web.crawl_url`. Writes immutable `web.analysis_result` rows (reasoning in
  `metadata.reasoning`) and reconciles `web.finding` (open/refresh on
  warn+fail, resolve on pass, suppression untouched).
- Entry points: `POST /api/scraper/crawler/sites/{site_id}/analyze`
  (NDJSON `analysis_progress`, own `web.crawl_session` with
  `scope.mode="analysis"`) + the automatic post-crawl step after every
  full/list crawl (failure degrades to a durable `crawl_warning`).
- Contract doc: `packages/matrx-scraper/matrx_scraper/web_crawl/FEATURE.md`
  § "Page analysis contract". Tests: `tests/test_page_analysis.py` + the
  suites the extension work added.

**Frontend (matrx-frontend `features/marketing`, all merged to main):**

- Audit tab **Catalogue-analysis panel**
  (`components/analysis/CatalogueAnalysisPanel.tsx` over
  `data/analysis-service.ts#getSiteAnalysisOverview`): site score, open
  findings by check (→ item-filtered findings register), lowest-scoring pages
  (→ page workspace), computed-at freshness, never-analyzed empty state, and
  the **Analyze now** button (`crawler/direct-client.ts#analyzeSite`).
- Sites portfolio **Health column** (weighted `web.v_site_score`;
  server-served sort via the `health_score` branch in `data/service.ts`
  `listSites` — unscored sites appended, never dropped).
- Findings table Page cell + finding detail both drill to the page workspace.

**Production data (queried 2026-08-12):** 16,236 `analysis_result` rows,
1,285 `finding` rows. Score views populate. The catalogue is 81 builtin
`web.analysis_item` rows; the deterministic provider covers ~63; the AI/
Lighthouse/GSC-provider items remain future work.

## Where to test it in the UI

All under a site's workspace: `/marketing/brands/[brandId]/sites/[siteId]/…`

1. **`…/audit`** — the "Catalogue analysis" section (score tiles, findings by
   check, worst pages, **Analyze now**).
2. **`…/analysis`** — the priority queue (`web.v_priority_queue`).
3. **`…/findings`** — the register; the Page cell and detail-page
   "Page workspace" button drill to `…/pages/[pageId]`.
4. **`/marketing/sites`** — the Health column (sortable).

**Sites with REAL data right now:** `titaniummarketing.com` and
`prpinjectionmd.com` — open their audit/findings tabs and everything renders
from live rows. **`datadestruction.com` has ZERO rows** because every Analyze
attempt on it dies (the bug below) — its panel honestly shows never-analyzed.

## THE BUGS — why Arman saw "spins forever, then nothing"

Verified evidence, from `web.crawl_session` (`scope->>'mode'='analysis'`):

| When (UTC) | Site | Duration | Outcome |
|---|---|---|---|
| 08-09 21:15 | titaniummarketing (120 pages) | **6 seconds** | complete, 2,880 results |
| 08-11 06:20 | prpinjectionmd | 4m39s | failed (real crash; retried) |
| 08-11 06:34 | prpinjectionmd (~150 pages) | **11m34s** | complete, 8,443 results |
| 08-11 10:57 / 18:10 / 23:17 | datadestruction (387 snapshots, 178k crawl_urls, 253k link edges) | 30–40 min each | **failed, 0 results, no error stored** |
| 08-12 02:30 | cosmeticinjectables (680 snapshots, 136k crawl_urls, 160k edges) | **35m08s** | **failed, 0 results, empty stats — same reaper-kill signature, third site confirmed** |

1. **~100× performance regression between 08-09 and 08-11.** 120 pages took
   6 seconds under the original 15-check worker; ~150 pages took 11.5 MINUTES
   under the extended ~63-check worker. Individual DB queries are fast
   (measured: crawl_url keyset 10ms, link-edge chunk 17ms; no slow query in
   `pg_stat_statements`), so the time is going into query COUNT and/or
   Python-side work — profile the evidence loaders
   (`_load_page_facts` full-snapshot hydration, `_load_transport_only_facts`
   over 100k+ crawl_urls, `_load_link_stats` over 100k+ edges,
   `gsc_cannibalization.load_gsc_keyword_cannibalization`'s batched 28-way-OR
   group-bys, `site_analysis.load_site_evidence`). First step: add timing per
   loader to the progress events so the hot spot names itself.
2. **Runs > ~30 min are killed by the stale-session reaper.** Analysis
   sessions hold no run lease and write NOTHING durable mid-run (no
   crawl_event rows, no session heartbeat), so `fail_stale_sessions` sees a
   30-min-quiet `running` row and marks it failed — while the worker may
   still be working. Fix: heartbeat the session (`updated_at` touch or a
   lease like crawls) on every progress report, or exempt analysis sessions
   with their own liveness signal.
3. **A killed/failed run stores NO error and writes NO rows.** All
   `analysis_result` inserts happen at the END, after every loader and check
   — so 39 minutes of work on datadestruction produced zero rows three
   times. This violates the durable-work-queue baseline
   (`common-docs/policies/durable-work-queue-standard.md`): make evidence
   loading + writes incremental/checkpointed so partial progress persists,
   and make the reaper path (and any crash) leave a visible error the FE can
   render.
4. **FE UX: the Analyze button awaits the whole stream with no progress.**
   `CatalogueAnalysisPanel.runAnalysis` awaits `analyzeSite()` to completion
   — a legitimate 10-minute run shows only a spinning button, and a
   server-side death shows nothing (the panel refetches, still zero rows,
   silent). Render the NDJSON `analysis_progress` messages (counts stream in
   the summary), and on session failure surface the durable session state —
   same pattern as the crawl feed (`useSiteCrawlActivity`). The failed
   session rows are readable from Supabase; today no surface shows them.

Also observed while diagnosing (not analysis, flag to whoever owns it): one
`prpinjectionmd` run crashed in 4m39s with the error lost — same silent-death
class as #3.

## Punch list to the finish line

1. Profile + fix the perf regression (bug 1) — target: a 500-page site
   completes in low single-digit minutes.
2. Heartbeat/lease analysis sessions (bug 2) and persist a terminal error on
   every failure path (bug 3). Chaos-style proof: kill a run mid-way, the
   session must end `failed` WITH an error message, never silent.
3. Make the FE Analyze command progress-visible and failure-visible (bug 4).
4. Re-run Analyze on `datadestruction.com` end-to-end from the UI — the
   acceptance test is Arman clicking the button and watching it finish with
   visible progress and populated findings.
5. Groom this doc (or delete it when all four land) + the parent program doc.

## How to verify quickly (no UI needed)

- Live scraper version: `GET https://scraper.app.matrxserver.com/health`.
- Trigger: `POST https://scraper.app.matrxserver.com/api/scraper/crawler/sites/{site_id}/analyze`
  with a Supabase user JWT (`Authorization: Bearer …`) — streams NDJSON.
- State: `select * from web.crawl_session where scope->>'mode'='analysis' order by created_at desc;`
  and counts on `web.analysis_result` / `web.finding` / `web.v_site_score`.
