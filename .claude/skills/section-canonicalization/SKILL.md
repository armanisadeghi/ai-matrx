---
name: section-canonicalization
description: The platform recipe for taking ONE small feature section (a preview, a calculator, an analyzer, any focused piece of UI + logic) and building it out COMPLETELY — canonical reusable component, floating window panel, in-page section integration, deterministic shared utility, DB persistence written by both client and server, Python twin exposed as an agent tool, surface manifest for AI agents, and a public page. Use whenever the task is "make this section canonical", "set this up properly like the SEO metadata system", "productize this widget", "this section needs the full treatment", or when building a new analyzer/preview/calculator section anywhere in the app. The SEO metadata / Search Appearance system is the worked reference implementation for every step.
---

# Section canonicalization — one section, every consumer

**The artifact is disposable; the system is the product.** A "section" (a SERP
preview, a readability panel, a cost calculator…) is done only when its pieces
serve EVERY consumer: the page it started on, a floating window, other
features' pages, the database, the Python server, agents, and the public.

**Worked references (mirror them):**
1. The SEO metadata system — `features/marketing/seo/serp/` +
   `windows/seo/SerpAnalyzerWindow.tsx` + marketing `PageWorkspace` SERP
   section + aidream `matrx_scraper/meta_metrics.py`. Read
   [`features/marketing/seo/serp/README.md`](../../../features/marketing/seo/serp/README.md) first.
2. The page-audit system (second application, proves the recipe generalizes) —
   `features/marketing/seo/audit/` (three evaluators, ONE stored contract
   `audit_metrics`) + `features/marketing/seo/social/` (platform-faithful share cards) +
   `windows/seo/SocialCardWindow.tsx` + `/seo/social-preview` + aidream
   `matrx_scraper/audit_metrics.py`. Shows how MULTIPLE related evaluators
   share one versioned jsonb contract instead of one column each, and how a
   verdict enum (`indexable | check | blocked`) + severity-tagged issues
   (`AuditIssueList`) make richer visuals than bare booleans.

**Deliverable 9 — the rollup view.** Once a metric is stored per row, the
list and the parent entity both want it. That's two more cheap surfaces:
per-row glyphs in the existing table (marketing pages "Health" column) and a
dedicated rollup dashboard over the whole set (`.../audit`:
`lib/audit-rollup.ts` pure aggregation + bounded paged fetch + verdict tiles
/ pass-rate bars / top-issues-with-drill-down / worst-rows). **The rollup
ONLY aggregates — it never re-derives a metric**, so it can never disagree
with the detail view or the server. Aggregation lives in a pure, unit-tested
module (never inside the component), and the fetch is bounded with a LOUD
throw rather than a silent truncation.

**Adding a section to an existing stored contract** (the url-quality case):
make it **additive and optional** on the payload type, exclude it from the
existing `overall_ok` when its severity model differs (warnings-only), and
prefer the stored copy with a live-computed fallback — old rows then keep
working untouched and no backfill is required to ship.

## The eight deliverables

Work through them in order — each builds on the previous. Skipping one is a
decision to surface to the user, not a silent omission.

| # | Deliverable | Reference |
|---|---|---|
| 1 | **Canonical component library** — pure presentational pieces + ONE prop-driven composite | `features/marketing/seo/serp/` (`SerpResult`, `SerpValidation`, `MetaRecommendations`, `MetadataAnalyzer`) |
| 2 | **Deterministic core utility** — environment-free calculation module | `features/marketing/seo/serp/metrics.ts` + `char-widths.ts` |
| 3 | **Window panel** — the composite in a floating window, prop-fed, openable from anywhere | `windows/seo/SerpAnalyzerWindow.tsx` + opener `features/overlays/openers/serpAnalyzerWindow.tsx` |
| 4 | **In-page section upgrades** — replace every hand-rolled version with the canonical pieces + a header launcher into the panel | marketing `PageWorkspace` `SerpPreview` |
| 5 | **DB persistence** — versioned jsonb contract, auto-written on BOTH triggers (user save + server capture) | `migrations/web_seo_metrics.sql` |
| 6 | **Python twin + agent tool** — same algorithm in the server package, wired into the automatic pipeline, exposed as a tool | `matrx_scraper/meta_metrics.py`, crawl persister, `seo` tool |
| 7 | **Surface manifest** — values + intro + agentRoles placeholders, synced to DB | `features/surfaces/manifests/marketing-page.manifest.ts` |
| 8 | **Public page** — the composite offered free at a public route | `app/(public)/seo/metadata/page.tsx` |

## 1-2 · Component library + deterministic core

- **Pieces are exported individually** — the composite is assembled FROM them,
  never a monolith. A page that can't import just the chips/preview/issues-list
  is the failure this skill exists to kill.
- The composite is **prop-driven and host-agnostic**: `initial*` props,
  optional `onValuesChange`, feature toggles (`enableFetch`). No route
  assumptions, no Redux.
- **Container queries, not viewport breakpoints** (`@container/<name>` +
  `@[64rem]/<name>:`): the same composite must lay out correctly full-page AND
  inside a window panel.
- The calculation module is **deterministic and environment-free** — no canvas,
  no DOM, no `Date.now()` in the math. Same input → same output in browser,
  SSR, tests, and Python. If the existing code measures via a browser API,
  replace it with a data-table implementation both languages can share.

## 3 · Window panel (current registration reality)

The `window-panel-authoring` skill predates the registry split — the CURRENT
five touch points are:

1. `features/window-panels/registry/windowRegistryMetadata.ts` — `STATIC_REGISTRY` entry (slug, overlayId, label, defaultData, mobilePresentation, optional `urlSync`).
2. `features/window-panels/registry/overlay-ids.ts` — add the overlayId to `OVERLAY_IDS` (typed union; forgetting it is a compile error at dispatch sites).
3. `features/window-panels/windows/<area>/<Name>Window.tsx` — outer `if (!isOpen) return null` guard; inner renders `WindowPanel` with stable `id`, `overlayId`, `onCollectData`, `urlSyncKey` matching the registry. Track live child values in a **ref** for `onCollectData` — don't re-render the shell per keystroke.
4. `features/overlays/OverlayController.tsx` — `lazyOverlay(() => import(...))` const + `isOpenById` + `dataById` selectors + a render block (typed prop narrowing from `data`).
5. Opener hook `features/overlays/openers/<overlayId>.tsx` — `useOpenXWindow(options)` dispatching `openOverlay` with normalized data. Optionally a Tools-grid tile (`tools-grid/toolsGridTiles.ts`).
- **Size the panel so the full composite is visible on a large screen** (the SERP analyzer uses 1360×900, min 560×480); container queries handle shrinkage.

## 4 · In-page sections

- Replace hand-rolled markup with the canonical pieces (compact density
  variants exist for tight spaces — use them, don't fork).
- The section header gets a **window-launch icon button** (`AppWindow` lucide)
  pushing the section's live data through the opener hook.
- Any editor of the section's data gets **live verdict feedback** from the
  deterministic utility (chips + issues list) — users must know if their draft
  is good BEFORE saving.

## 5 · DB persistence — versioned, dual-writer

- One jsonb column per storage point, **snake_case versioned contract**:
  `{ v: 1, source: "<writer>", computed_at, ...payload }`. Document the shape
  in the migration file itself.
- **Both writers produce byte-identical payloads**: client stamps on every user
  save; server stamps on every automatic capture. Neither is a "backup" of the
  other — they cover different data (e.g. desired vs observed).
- Apply via Supabase MCP + ledger upsert (`public._schema_migrations`) + `pnpm
  db-types` + aidream `python db/generate.py` (regenerates the ORM models —
  never hand-edit `models_*.py`).
- Multi-table ALTERs deadlock against live writers holding locks in the
  opposite order — **apply one statement at a time** on hot tables.

## 6 · Python twin + agent tool

- The canonical Python module lives in the PACKAGE that runs the automatic
  pipeline (e.g. `matrx-scraper`), not in an aidream app module — packages must
  not import app code, and the standalone service deploy must include it.
  aidream-side consumers (agent tools, registered functions) import from the
  package.
- **Parity is tested, not asserted**: generate a fixture JSON from Python
  (diverse strings: unicode, CJK, symbols, whitespace-only, too-long) and lock
  it with a TS test (`features/marketing/seo/serp/metrics.parity.test.ts` pattern).
  Numbers, booleans, AND issue strings must match byte-for-byte. Char counts
  use **code points** (`Array.from(s).length` ↔ Python `len`).
- Wire the computation into the automatic pipeline at its single write
  chokepoint (for scraping: `matrx_scraper/web_crawl/persistence.py`
  `_persist_rows`) so every capture persists the metrics without anyone asking.
- The agent tool almost certainly exists or is one dispatcher action away
  (`matrx_ai/tools/implementations/`) — point it at the package module; never
  keep a second copy of the math.

## 7 · Surface manifest — make it real for agents

Follow the `surface-authoring` skill (manifest + `createXxxScope` helper +
registry + `pnpm check:surface-drift` + ui_surface row + DB sync). Additions
this campaign proved out:

- **Declare `agentRoles` as the AI placeholder** — named slots
  (`metadata_optimizer`, `serp_analyst`, …) with `defaultAgentId: null`. The
  binding UI and runtime are then ready the day the agents land.
- Write the **`intro`** teaching the ONE distinction agents must not confuse
  (for marketing pages: observed = immutable evidence, desired = editorial
  intent they may propose).
- Ship a **runtime scope builder** beside the feature
  (`features/marketing/lib/marketing-page-scope.ts` pattern): loaded workspace
  data → `createXxxScope(...)`, ready for `launchAgentExecution` — even before
  any launch UI exists.
- **Known sync traps** (both fixed live, but the class recurs): the
  `ui_surface_value_type_chk` CHECK constraint must include every
  `SurfaceValue.valueType` the TS union allows; `service_role` needs SELECT on
  `agent.menu_surface` (and friends) or the admin sync 42501s. A sync 500 of
  "Unknown error" is a thrown non-Error — run
  `applyManifestSync` directly via a tsx script to see the real failure.

## 8 · Public page

The composite IS the public tool — the page adds only chrome (header, SEO
`metadata` export). If the public page still owns private `_components`
versions of anything reusable, move them into the feature.

## Verification bar (all of it)

- `pnpm type-check` green; parity test green; `pnpm check:surface-drift` green.
- Browser-verified: public page, window panel opened FROM the in-page launcher
  with data pre-filled, section renders real data.
- DB-verified with real rows: trigger the user save and SELECT the stored
  payload; after server deploy, confirm the automatic pipeline stamps its
  column on a fresh capture.
- Docs: feature README/FEATURE.md updated (consumers + parity contract), the
  owning feature's Change Log dated, admin map rows added.
