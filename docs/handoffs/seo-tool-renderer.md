---
status: active
updated: 2026-08-08
repos: [matrx-frontend]
vision: [/Users/armanisadeghi/code/common-docs/policies/canvas-doctrine.md]
---

# SEO in chat — rendering the `seo` tool, and making its output actionable

## 1. Vision — Arman's words

The original brief, verbatim (one message, three clauses):

1. **"create a beautiful component for the 'seo' tool"** — it was falling through to a generic JSON table.
2. **"we already have some things … we used to have the component for SEO metadata … See if you can find that."** — find the orphaned prior art before writing anything. Correct: three SERP renderers existed, wired to tool names the backend had retired.
3. **"we have core components for visualizing SEO metadata … use those same core components so that we get to continue hardening and improving the core."** — **the load-bearing clause.** The tool renderer owns no visuals of its own. Everything comes from `features/marketing/seo/`, so improving the core improves chat for free and drift is structurally impossible.

Then (2026-08-08) Arman pointed this work at **the Canvas Doctrine** — read
`/Users/armanisadeghi/code/common-docs/policies/canvas-doctrine.md` before continuing. It reframes
the goal: rendering the data well is only rung 1. The rungs that matter next are **4 (human
enrichment: one click, massive effect)** and **6 (integrate both directions — partial integration
is a bug, not a phase)**.

That reframe produced the current direction: **a number the user cannot act on is a defect.** An
agent generating five candidate titles in chat that the user then retypes into the Page Workspace
by hand is exactly the dead end the doctrine bans.

### Load-bearing decisions

- **Dispatch on RESULT SHAPE, not the `action` argument.** The backend folded five SEO tools into
  one `seo` tool switching on `action`. Action-dispatch would break the 37 calls already persisted
  under the retired `seo_check_meta_*` / `seo_get_keyword_data` names, which carry no `action`.
  Shape dispatch serves both. **Do not "simplify" this into an action switch.**
- **`chrome: "card"` on the canonical `ToolResultCard`** — the shell renders the card directly; the
  header owns the count and pass/fail so no body repeats it.
- **Actions live in the CORE, not the renderer.** `ApplyMetaToPage` sits in `seo/serp/`, not in
  `renderers/seo/`, so every surface rendering a SERP entry gets it.
- **Empty string ≠ missing.** `check_batch` reports a page with no `<title>` as `title: ""` — the
  finding the check exists to produce. Treating it as a value blanks the user's desired title.
- **Server-computed pixels/chars are trusted, never re-measured** (`serp/metrics.ts` mirrors
  aidream's `meta_metrics.py`, parity-tested).

## 2. Current state

### Done

- Unified renderer + registry (5 tool keys → one pair) — `renderers/seo/`, `registry/registry.tsx`.
- All five variants verified against **real captured payloads** in `tool.test_sample`; both
  `collect_rank` paths (Brave SERP, ChatGPT answer engine) proven with live backend runs.
- Keyword sparkline/badge/formats extracted to shared `KeywordMetrics.tsx`; `rank/types.ts` created.
- Fixed `app/api/tool-testing/conversation/route.ts` (wrote retired tables; the whole tool-testing
  harness could not execute anything).
- **Apply-to-page loop (rung 4/6)** — `ApplyMetaToPage` + `PagePickerDialog`, writing through
  `useUpdatePageIntent`. **Proven end-to-end:** applied a generated title+description to a real
  page; `web.page` took both fields plus a recomputed `seo_metrics_desired` (source `client`),
  identical to a workspace save.
- Survived an adversarial review — fixed empty-string data loss, cache-invalidation bypass,
  unretryable stale-version failures, index-keyed "Applied" state, an unscoped list read (THE VIEW
  LAW), and unescaped LIKE metacharacters.

### Partial

- **`AddKeywordsToPage` is wired but NOT proven live.** Per-row and bulk buttons render correctly
  (verified in the browser); the write goes through `addPageSupportingKeywords`, already used in
  production by `MarketingPageWriteTargets`. The live click-through was blocked by an unrelated
  compile error from a concurrent session (`features/war-room/redux/thunks.ts` importing
  `WAR_ROOM_ROOM_AGENT_ID`, mid-rename to `_SLOT`). **Do this first** — see Next steps.
- **Never observed in a live chat stream.** All verification ran through the `/ui` preview page,
  which replays stored payloads. Behavior while `status` is `started`/`progress` is untested, and
  `SeoOverlay` is only reachable from a real tool card.
- Review-queue row `4acb7ca9-a4a8-4c9e-85eb-ee551b553c0d` still `pending`.

### Not started

- No unit test for `resolve.ts` — the shape contract everything depends on is pinned by nothing.
- No consecutive-run consolidation (agents call `check_batch` repeatedly; the skill says N calls of
  one known-pretty tool fold into ONE card — see `fs_list` → `FsBatchCard` in `ToolCallBatch.tsx`).
- **Canvas rungs still open on the keyword table:** no sort/filter on any column, no drill on a
  keyword, no period deltas. Rung 1 table stakes, unmet.

### Known issues / risks

- `web.page` holds duplicate rows per URL and records crawled assets (365 image, 69 json, 47 xml)
  as pages. `searchPagesForMetaApply` works around the second with a `content_type_last` filter.
  Spun off as its own task.
- The in-code registry beats any DB renderer. A `tool_ui` row for `seo` on `matrx-default/default`
  would silently never render. By design — know it before debugging.
- The `tool.test_sample` rows for `seo` are **real captured payloads**, not regenerable fixtures.
  Do not delete them.
- Stale `tool.ui` row for `seo_check_meta_descriptions` on surface `chrome-extension/pilot`.

## 3. Architecture

```
features/tool-call-visualization/
├── registry/registry.tsx        5 seo keys → SeoInline/SeoOverlay + seoHeaderExtras
├── renderers/seo/
│   ├── resolve.ts               ← THE dispatcher. Result shape → SeoVariant union
│   ├── SeoInline.tsx            ToolResultCard; picks body by variant
│   ├── SeoOverlay.tsx           same resolver, roomy bodies
│   ├── KeywordDataBody.tsx      keyword tables + AddKeywordsToPage
│   └── RankReceiptBody.tsx      collect_rank receipt (SERP + AI-answer)
└── renderers/seo-shared/        SerpToolInline / SerpToolOverlay (meta bodies)

features/marketing/seo/          ← THE CORE. Never fork these.
├── serp/                        SerpResult, SerpFieldChips/Bars, metrics.ts, ApplyMetaToPage
├── keyword-research/components/ KeywordMetrics, AddKeywordsToPage
└── rank/types.ts                SeoCollectionReceipt
features/marketing/components/pages/PagePickerDialog.tsx   shared "send to a page" shell
```

Flow: `entry.result` → `resolveSeoVariant()` → `{meta|keywords|rank}` → body → core primitives.
Unrecognized payload → `null` → `GenericRenderer` (never a crash).

**Write paths — never bypass:** desired metadata → `useUpdatePageIntent` (optimistic-locked on
`version`, recomputes `seo_metrics_desired`). Keywords → `addPageSupportingKeywords` (upserts the
keyword + creates the `seo_keyword → web_page` association edge).

**Backend (aidream, read-only here):** `packages/matrx-ai/.../tools/implementations/seo.py`,
`packages/matrx-seo/matrx_seo/contracts.py`, `packages/matrx-scraper/.../meta_metrics.py`.

**Skills:** `create-tool-renderer`, `section-canonicalization`.

**Where to look:** `/administration/agents/mcp-tools/617b5d2b-138a-40f9-952a-b25d701328d9/ui` —
the Sample dropdown holds 5 real payloads. Log in per `CLAUDE.md` § Web Access.

## 4. Next steps (in order)

1. **Prove `AddKeywordsToPage` live.** Open the `/ui` page, pick the `keyword_data` sample, click
   "Add 1 to page", search `iso-27001`, Attach. Confirm the edge landed:
   ```sql
   select k.phrase from platform.associations a join seo.keyword k on k.id=a.source_id
   where a.target_id in (select id from web.page where url like '%iso-27001%');
   ```
   Requires the war-room compile error above to be resolved first (or any dev server that builds).

2. **Run `seo` from a real chat** — the only untested scenario for the renderer itself, and it
   covers both the live-stream render and the runtime overlay. `/agents/all` → *SEO Metadata
   Generator*, *Meta Data Length Confirmation Agent*, *LSI Variations & Metadata*, or *Gemini Tools
   Test* → Run. Watch the card during flight (slim row → card, must not auto-collapse), then
   "Open" → Window Panel for `SeoOverlay`.

3. **Bring the keyword table to rung 1** — sort and filter every column, drill on a keyword.
   Table stakes per the doctrine; currently hardcoded to sort by volume.

4. **Add `resolve.ts` unit tests** — one per variant, plus JSON-string result and unrecognized →
   `null`.

5. **Batch consolidation** for repeated `check_batch` calls (`ToolCallBatch.tsx`).

**To run any action without an agent:** `/demos/api-tests/tool-testing` → **New** → search `seo` →
fill args → **Execute** → **Rendered** tab. Executes against the live backend.

## 5. Gotchas

- **`entry.result` may be a JSON string.** Always `resultAsObject`.
- **Never re-measure pixels client-side.** Trust the server's `*_pixels` / `*_chars` / `*_ok`.
- **`overall_ok` semantics differ per action** — batch items carry it; title/description items
  carry `title_ok`/`description_ok`. Read `serp/types.ts` before touching the normalizers.
- **Never render UUIDs** (`run_id`, `raw_payload_id`) in a tool body — they belong in Tool Admin.
- **Radix Selects resist browser automation.** Clicks and synthetic pointer events on
  `[role="option"]` all fail. What works: grab the trigger's React fiber
  (`Object.keys(el).find(k => k.startsWith('__reactFiber$'))`), walk up `.return` to
  `memoizedProps.onValueChange` (~14 levels), call it directly. Cost many turns twice.
- **Tool definitions drift under you.** `seo` went v4 → v6 (gaining `engine`, `search_type`,
  `dataforseo`) mid-project. Re-read `select parameters from tool.definition where name='seo'`
  before trusting any arg mapping.
- **Verification bar:** this repo does not accept "verified" from mocks or simulated streams.
  Render real captured payloads through the production path, or run the tool for real.
- **Do not fix test-site data by hand** to make a feature look like it works — the product's own
  flows must do it, and the gap IS the finding (canvas doctrine).
