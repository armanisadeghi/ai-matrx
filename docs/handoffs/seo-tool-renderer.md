---
status: active
updated: 2026-07-27
repos: [matrx-frontend]
vision: []   # no standing vision doc — the brief was verbal; quoted verbatim below
---

# SEO tool renderer — how the `seo` agent tool renders in chat

## 1. Vision — Arman's words

The whole brief arrived in **one message**, with three distinct clauses. There were no
mid-flight changes or refinements; every requirement below is from that single brief.
Quoted verbatim so nothing gets laundered:

1. **"create a beautiful component for the 'seo' tool"** — the tool was falling through to the
   generic JSON-table view in chat.
2. **"we already have some things that you could use or find that we used to have but they're
   just not properly connected. We used to have the component for SEO metadata or something
   like that. See if you can find that."** — a direct instruction to go looking for orphaned
   prior art before writing anything new. It was right: three working SERP renderer folders
   existed and were wired to tool names the backend no longer emits.
3. **"we have a core components for visualizing SEO metadata that is used in our marketing and
   SEO modules. The key is to use those same core components so that we get to continue
   hardening and improving the core."** — the load-bearing clause. The tool renderer is not
   allowed its own visuals. It must consume the same primitives the marketing/SEO surfaces
   use, so that every future improvement to the core lands in chat for free, and drift is
   structurally impossible.

Standing repo doctrine that governs this work equally (from `CLAUDE.md` / `PRINCIPLES.md`,
not restated by Arman in this task but binding):
build the platform, not the artifact · reuse → extend → compose → create ·
**deprecated/"fallback" code gets deleted, not kept** · hide nothing from the user ·
no verification claims from mocks or simulated streams.

### Why the key decisions went the way they did

- **Dispatch on RESULT SHAPE, not on the `action` argument.** The backend consolidated five
  SEO tools into one `seo` tool that switches on `action`. Dispatching on `action` would have
  been the obvious read of the schema — and would have broken every one of the **37 calls
  already in `chat.tool_call` under the retired `seo_check_meta_*` / `seo_get_keyword_data`
  names**, which carry no `action` argument at all. Shape dispatch serves both, so ONE
  renderer covers every payload the platform has ever produced. This is the single most
  important design choice here; do not "simplify" it into an action switch.
- **`chrome: "card"` on the canonical `ToolResultCard`.** SEO results are "known pretty data"
  per the `create-tool-renderer` skill. Card chrome means the shell renders the card directly
  with no folded glyph line above it, and the header owns the count + pass/fail summary — so
  no body ever repeats it.
- **The keyword sparkline was extracted, not copied.** `KeywordResearchWorkbench` had a
  private `TrendSparkline` + competition badge + volume formatter. Copying them into the
  renderer would have created the exact drift clause 3 forbids, so they were lifted into a
  shared module and the workbench now consumes it. One implementation, two surfaces.
- **The three legacy adapter folders were deleted, not left in place.** Shape dispatch made
  them redundant, and the no-legacy rule is explicit. Their tool names stay registered (they
  point at the same components) purely so persisted history still renders.
- **Server-computed pixel/char values are trusted, never re-measured.** `serp/metrics.ts` is
  an exact mirror of aidream's `meta_metrics.py` and has a parity test. Re-measuring
  client-side would reintroduce the drift that test exists to prevent.

## 2. Current state

### Done

- Unified renderer — `features/tool-call-visualization/renderers/seo/` (`resolve.ts`,
  `SeoInline.tsx`, `SeoOverlay.tsx`, `KeywordDataBody.tsx`, `RankReceiptBody.tsx`).
- Registry: 5 keys (`seo` + the 4 legacy names) all point at the same pair, card chrome,
  one shared `seoHeaderExtras`, added to `RESULT_IS_PURPOSE_TOOLS` — `registry/registry.tsx`.
- Core extraction — `features/marketing/seo/keyword-research/components/KeywordMetrics.tsx`
  (sparkline, competition badge, volume/CPC formats); `KeywordResearchWorkbench` consumes it.
- New canonical `features/marketing/seo/rank/types.ts` (`SeoCollectionReceipt`, mirroring
  aidream `CollectionReceipt`); it also now types marketing's `RankCheckCompletedEvent.receipt`
  (was `Record<string, unknown>`).
- Deleted: `renderers/seo-meta-{tags,titles,descriptions}/` + the dead `Seo*Result` envelope
  types in `serp/types.ts`.
- Fixed `app/api/tool-testing/conversation/route.ts` — it wrote the retired `conversations` +
  `conversation_participants` tables through the deprecated-table shim (which throws), so
  "create conversation" failed and **the entire tool-testing harness could not execute any
  tool**. Now on canonical `chat.conversation`, caller's own token (RLS applies), personal org.
- Docs updated: `tool-call-visualization/FEATURE.md` + `RENDERER_STATUS.md`,
  `marketing/seo/serp/README.md`, `marketing/seo/keyword-research/FEATURE.md`.
- **Shipped and deployed.** Commit `60171d066` is on `origin/main` and has gone out in
  subsequent releases (v0.4.158+ are downstream of it).
- **Verified against real persisted payloads** — the meta-check and keyword variants rendered
  through the production `ToolCallVisualization` path at the tool's `/ui` preview page, driven
  by 3 samples captured from Arman's own runs into `tool.test_sample`.

### Partial

- **Overlay body never visually confirmed.** `SeoOverlay` compiles and is registered, but only
  the inline card was ever put on screen. The overlay renders in the Results tab of the tool
  overlay / window panel.
- **Never observed in a live chat stream.** Verification went through the admin preview page,
  which uses the same components and shell but replays a stored payload rather than a live
  stream. Behavior while `status` is still `started`/`progress` is untested in the wild.
- **Review-queue row `4acb7ca9-a4a8-4c9e-85eb-ee551b553c0d` is still `pending`** — Arman has
  not reviewed it. Read `agent.review_queue` for feedback before doing more work here.

### Not started

- **`collect_rank` has never run — zero calls in `chat.tool_call`, ever.** `RankReceiptBody`
  has therefore never rendered real data. It is written against aidream's `CollectionReceipt`
  contract and parses defensively, but treat it as unproven. Highest-risk unknown in this work.
- No unit test for `resolve.ts`. The shape contract — the thing everything else depends on —
  is pinned by nothing. (`serp/metrics.parity.test.ts` covers the SERP math, not the resolver.)
- No consecutive-run consolidation. Agents call `check_batch` repeatedly (20 real calls); the
  `create-tool-renderer` skill says N back-to-back calls of the same known-pretty tool should
  fold into ONE card (see the `fs_list` → `FsBatchCard` branch in `components/ToolCallBatch.tsx`).

### Known issues / risks

- **`features/seo/**` moved to `features/marketing/seo/**`** after this work landed, by a
  different session. Imports were updated and `pnpm type-check` is green, but any older doc or
  commit message referencing `features/seo/...` is now a stale path.
- `renderers/seo-shared/` has exactly **one** consumer now (`renderers/seo/`). Two folders for
  one renderer. Left alone deliberately — `SerpToolInline`/`SerpToolOverlay` are a real
  intermediate layer over the `serp/` primitives — but it is a fair merge candidate.
- The 3 `tool.test_sample` rows for `seo` are **real captured payloads**, not fixtures someone
  can regenerate. They are what the `/ui` preview page renders. Do not delete them.
- `tool.ui` has a stale DB-renderer row for `seo_check_meta_descriptions` on surface
  `chrome-extension/pilot`. Harmless for web (we read `matrx-default/default` only), but it is
  a legacy-name artifact someone should retire on the extension side.
- **The in-code registry beats the DB renderer.** If anyone authors a `tool_ui` row for `seo`
  on `matrx-default/default`, it will silently never render. That is by design; know it before
  debugging "my DB renderer does nothing".

## 3. Architecture / orientation

```
features/tool-call-visualization/
├── registry/registry.tsx          5 seo keys → SeoInline/SeoOverlay + seoHeaderExtras
├── renderers/seo/
│   ├── resolve.ts                 ← THE dispatcher. Result shape → SeoVariant union
│   ├── SeoInline.tsx              ToolResultCard wrapper; picks the body by variant
│   ├── SeoOverlay.tsx             same resolver, roomy bodies
│   ├── KeywordDataBody.tsx        inline + overlay keyword tables
│   └── RankReceiptBody.tsx        collect_rank receipt (UNPROVEN — never run)
└── renderers/seo-shared/          SerpToolInline / SerpToolOverlay (meta-check bodies)

features/marketing/seo/            ← THE CORE. Never fork these.
├── serp/                          SerpResult, SerpFieldChips/Bars, metrics.ts (Python mirror)
├── keyword-research/components/KeywordMetrics.tsx   shared sparkline/badge/formats
└── rank/types.ts                  SeoCollectionReceipt + parse/format helpers
```

Flow: `entry.result` → `resolveSeoVariant()` → `{kind:"meta"|"keywords"|"rank"}` → the matching
body → core primitives. Unrecognized payload → `null` → `GenericRenderer` (never a crash).

**Backend source of truth (aidream, read-only for this work):**
`packages/matrx-ai/matrx_ai/tools/implementations/seo.py` (the 5 actions),
`packages/matrx-ai/matrx_ai/tools/output_models/seo.py` (keyword output),
`packages/matrx-seo/matrx_seo/contracts.py` (`CollectionReceipt`),
`packages/matrx-scraper/matrx_scraper/meta_metrics.py` (the pixel/char twin of `metrics.ts`).

**Skills to invoke:** `create-tool-renderer` (contract + the hide-nothing rule),
`section-canonicalization` (the SEO/SERP system is its worked reference).

**Where to look at it:** `/administration/agents/mcp-tools/617b5d2b-138a-40f9-952a-b25d701328d9/ui`
— the Sample dropdown holds the 3 real payloads. Log in per `CLAUDE.md` § Web Access
(`/login`, `admin@admin.com`). The workbench that shares the keyword primitives is at
`/seo/keyword-research`.

## 4. Next steps (in order)

1. **Read `agent.review_queue` row `4acb7ca9-a4a8-4c9e-85eb-ee551b553c0d`.** If Arman left
   feedback, that outranks everything below. Follow the `agent-review-queue` skill's status
   contract (act → set back to `pending`, or `archived`).
2. **Prove `collect_rank`.** Run the `seo` tool with `action=collect_rank` (needs Brave or
   SerpAPI provider credentials server-side), capture the receipt into `tool.test_sample`, and
   confirm `RankReceiptBody` renders it. This is the one variant with zero real-world evidence.
3. **Watch it in a live chat.** Run each action in `/chat` and confirm the inline card renders
   during streaming, not just after. Card chrome shows the slim row while streaming, then the
   card on completion — confirm that transition looks right.
4. **Confirm the overlay.** Open the tool overlay / window panel for each variant and check the
   Results tab: SERP page for meta checks, full keyword table for `keyword_data`.
5. **Add `resolve.ts` unit tests.** One case per variant plus the JSON-string result and the
   unrecognized-payload → `null` fallback. Cheap, and it pins the contract everything rests on.
6. **Consider batch consolidation** for repeated `check_batch` calls — pattern in
   `components/ToolCallBatch.tsx` (`fs_list` → `FsBatchCard`).
7. **Optional cleanup:** merge `renderers/seo-shared/` into `renderers/seo/`; retire the stale
   `chrome-extension/pilot` `tool_ui` row.

## 5. Gotchas

- **Some `keyword_data` results are stored as JSON strings, not objects.** `resultAsObject`
  handles it; never assume `entry.result` is an object.
- **Never re-measure title/description pixels client-side.** Trust the server's `*_pixels`,
  `*_chars`, `*_ok`. `metrics.ts` mirrors Python and has a parity test; a second measurement
  path is drift.
- **`overall_ok` semantics differ per action.** Batch items carry `overall_ok`; title/description
  items carry `title_ok`/`description_ok`, which the normalizers map onto `overallOk`. Read
  `serp/types.ts` before touching the mapping.
- **Do not render `run_id` / `raw_payload_id` / any UUID** in a tool body — house rule from the
  `create-tool-renderer` skill. They belong in Tool Admin / Raw.
- **Driving Radix Selects with browser automation:** `.click()` and coordinate clicks are
  unreliable on them. Dispatch `pointerdown` + `pointerup` on the trigger, wait ~300ms, then
  the same on the `[role="option"]` — all inside ONE `javascript_tool` call, because the popup
  unmounts between calls. This cost a lot of turns; don't rediscover it.
- **Screenshot coordinates are screenshot-pixel space (2× the CSS viewport here), while `ref`
  clicks report CSS pixels.** Mixing them silently clicks empty space.
- **Verification bar:** this repo does not accept "verified" from mocks or simulated streams.
  Render real captured payloads through the production path, or run the tool for real.
