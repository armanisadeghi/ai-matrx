# Render Blocks — Master Handover (SVG · Charts · Slide Decks · Forms · Map · Stats · Diff)

**Date:** 2026-06-25 · **Author:** Claude (Opus 4.8) · **Status:** Seven verticals **shipped + committed** to `main`. DB packs applied + verified. This doc exists so nothing is lost if context is wiped — read it before continuing render-block work.

> Companion doc: `docs/handoffs/MERMAID_RENDER_BLOCK_HANDOFF.md` (mermaid was the first render block + the paving for the skill/pack pattern). This doc covers everything built **after** that: the SVG, Chart, enhanced Slide-Deck (+ presets + Unsplash), and Forms verticals — plus the unified-artifact architecture they now ride on.

---

## 0. TL;DR — what exists now

Four new/upgraded render blocks, each shipped as a **full pack** (render block + SKL skill + content blocks + sample agent), all live:

| Vertical | Emit syntax | Renders via | Pack (skill / sample agent) | Materializes? |
|---|---|---|---|---|
| **SVG** | ` ```svg ` fence (raw `<svg>`) | `SvgArtifact → SvgBlock` (sandboxed iframe) | `svg-illustrations` / "SVG Illustrator (sample)" | ✅ yes (registry) |
| **Charts** | ` ```chart ` fence (JSON spec) | `ChartArtifact → ChartBlock` (recharts via `next/dynamic ssr:false`) | `data-charts` / "Chart Builder (sample)" | ✅ yes (registry) |
| **Slide decks** | `{presentation:{slides,theme}}` JSON | `PresentationArtifact → Slideshow → SlideView` | `slide-decks` / "Deck Builder (sample)" | ✅ yes |
| **Forms** | `<questionnaire>` tag (section markdown) | `QuestionnaireArtifact → QuestionnaireRenderer` | `interactive-forms` / "Form Builder (sample)" | ✅ yes (generic persistence) |
| **Map** | ` ```map ` fence (JSON `{markers,center?,zoom?}`) | `MapArtifact → MapBlock → MapCanvas` (leaflet via `next/dynamic ssr:false`, OSM tiles, no key) | `interactive-maps` / "Map Maker (sample)" | ✅ yes (registry) |
| **Stats** | ` ```stats ` fence (JSON `{stats:[{label,value,change?,trend?}]}`) | `StatsArtifact → StatsBlock` (light, no lib) | `stat-cards` / "Stat Reporter (sample)" | ✅ yes (registry) |
| **Diff** | ` ```diff ` fence (JSON `{old,new,split?}`) | `DiffArtifact → DiffBlock → DiffCanvas` (react-diff-viewer-continued via `next/dynamic ssr:false`) | `code-diffs` / "Diff Reviewer (sample)" | ✅ yes (registry) |

Plus two slide-deck enhancements: a **preset/template library** (10 named looks + live picker) and **Unsplash auto-fill** (slides with `imagePrompt` get sourced imagery).

> **Map/Stats/Diff (added 2026-06-25)** rode the unified architecture with zero new infrastructure: the streaming-promotion path is now generalized (any `SPECIAL_CODE_LANGUAGES` entry auto-promotes), so wiring each was just register-in-both-registries + a thin `*Artifact` wrapper + the block component + a pack. Dev demo: `/demos/blocks/visual-blocks`.

---

## 1. The architecture you MUST understand first

Render blocks no longer route through `BlockRenderer`'s `block.type` switch (that was the OLD way mermaid/svg used). The codebase was **intentionally upgraded** (~1 week before this session, stable since) to a **unified artifact-renderer system**. This is registry-driven and is why adding a block type is now mostly "register it."

**Routing flow (chat):**
```
fence/JSON/tag  →  content-splitter detects block.type  →  BlockRenderer (early branch ~L283):
   resolveArtifactDef(block.type) → _def.canvasType
   if hasArtifactRenderer(_def.canvasType): <ArtifactRender canvasType=… mode="artifact" raw=content …/>
ArtifactRender → the per-type renderer (lazy) → wraps the real block component
```

**The two registries (both in `features/canvas/artifact-types/`):**
- `artifact-type-registry.ts` — `ARTIFACT_TYPE_DEFS` maps a canvasType to `{ aliases, standaloneAliases, materializable, persistenceStrategy?, adapter? }`. `resolveArtifactDef`/`resolveCanvasType`/`getArtifactDef` read it. **svg, chart, mermaid, presentation, questionnaire are all registered here.**
- `artifact-renderers.tsx` — `ARTIFACT_RENDERERS` maps a canvasType to a lazy component, gated by `hasArtifactRenderer()`. Entries: `mermaid→MermaidArtifact`, `svg→SvgArtifact`, `chart→ChartArtifact`, (presentation/questionnaire have their own `*Artifact` renderers too).

**The per-type renderers** live in `features/canvas/artifact-types/renderers/` (`SvgArtifact.tsx`, `ChartArtifact.tsx`, `PresentationArtifact.tsx`, `QuestionnaireArtifact.tsx`, `MermaidArtifact.tsx`). Each is a thin wrapper that forwards `content`/`raw` to the real block component (`SvgBlock`, `ChartBlock`, `Slideshow`, `QuestionnaireRenderer`).

**Canvas + public render:** `features/canvas/core/CanvasBody.tsx` and `features/canvas/shared/PublicCanvasRenderer.tsx` BOTH delegate to `<ArtifactRender>` via `hasArtifactRenderer()`. So any registered type renders in chat, canvas, and public shares with one registration. `CanvasContentType` (`features/canvas/redux/canvasSlice.ts`) includes `svg`/`chart`.

**Materialization is registry-driven** (`features/canvas/materialization/`): `reconcileArtifacts.ts` builds `MATERIALIZABLE_MARKERS` **from the registry** (` ```svg `, ` ```chart `, etc. are auto-derived), and `materializeMessageArtifacts.ts` persists any `materializable:true` type to `canvas_items`. Generic content types (svg/chart) have **no `adapter`/`onMaterialize`** — they just persist their raw content. Stateful types (quiz/flashcards/html) use a `persistenceStrategy:"custom"` + adapter; **questionnaire uses `persistenceStrategy:"generic"`** (the generalized replacement for the old per-block `useMessageBlockPersistence` hook — see §5).

**Bundle policy (critical — the user enforces this):** the markdown render system loads behind ONE `next/dynamic({ssr:false})` boundary (`SafeBlockRenderer` → `BlockRenderer`), so everything `React.lazy`'d under it is bundle-safe. **`next/dynamic ssr:false` + conditional render is the ONLY thing that keeps a heavy lib out of the server build** — `React.lazy`/`Suspense` still build on Vercel. Recharts is isolated this way inside `ChartBlock` (`const ChartCanvas = dynamic(() => import("./ChartCanvas"), { ssr:false })`). SVG uses a sandboxed iframe (no lib). When adding any heavy-lib block, do the same.

---

## 2. SVG vertical

- **Emit:** a ` ```svg ` fence containing a complete `<svg>`. Detected via `SPECIAL_CODE_LANGUAGES` (content-splitter) + promoted at fence-open (stream-block-accumulator) + reconstructed as ` ```svg ` on DB round-trip (assemble-cx-content-blocks).
- **Render:** `components/mardown-display/blocks/svg/SvgBlock.tsx` — renders **sandboxed** (`SandboxedHtml`, a no-scripts iframe; agent SVG is hostile) + **responsive** (frame takes the SVG's own viewBox aspect ratio, capped 70vh) + copy/download/fullscreen. `SvgRenderBlock` type is in `types/python-generated/missing-types.ts` (client-only).
- **Pack:** skill `svg-illustrations` teaches the hard safety rules (no `<script>`/`on*`/external refs/`<foreignObject>` — sandboxed & stripped) + authoring rules (always viewBox, system fonts, `<title>`/`<desc>`). 3 content blocks ("Illustrations" category). Migration `migrations/svg_render_block_pack.sql`.

## 3. Chart vertical

- **Emit:** a ` ```chart ` fence with a JSON spec: `{type:"bar|line|area|pie|scatter", title?, x?, y?:[…], data:[…]}` (pie uses `{label,value}` items). Same detection/promotion/round-trip wiring as svg.
- **Render:** `components/mardown-display/blocks/chart/` — `chart-spec.ts` (PURE, forgiving normalizer: tolerates trailing commas, infers keys, coerces numeric strings, pie synonyms), `ChartCanvas.tsx` (the ONLY recharts importer), `ChartBlock.tsx` (light shell; loads ChartCanvas via `next/dynamic ssr:false`). `ChartRenderBlock` type in missing-types.
- **Pack:** skill `data-charts` (type→intent map, spec shape, rules). 4 content blocks ("Charts" category). Migration `migrations/chart_render_block_pack.sql`.

## 4. Slide-Deck vertical (the big one)

- **Emit:** JSON `{presentation:{slides:[…], theme:{…}}}` (detected by the `presentation` root key). Server-parsed (aidream `presentation_parser.py` → Pydantic `Slide` model with a free-form `extra` dict) AND client-raw both work. Slide fields the renderer reads: `type`/`layout`, `title`, `subtitle`, `description`, `bullets[]`, `quote`, `author`, `image_url`/`imageUrl`, `notes`, and `extra` (`imagePrompt`, `stats[]`, `columns[]`, `eyebrow`).
- **Renderer:** `components/mardown-display/blocks/presentations/`:
  - `SlideView.tsx` — the per-slide renderer. **3 tiers** (`theme.variant`: `generic`/`fancy`/`deluxe`) × **many layouts** (`slide.layout`: title, section, bullets, two-column, quote, stat, image-full, image-split, closing — inferred from fields when absent).
  - `Slideshow.tsx` — the shell (nav, fullscreen, export menu, canvas button) + resolves the preset + renders `SlideView`.
- **Presets / templates (`presets.ts`):** 10 named looks — `classic, corporate, editorial, bold, minimal, midnight, ocean, sunset, forest, mono` — each a `{variant, palette, font}` bundle. `theme.preset:"editorial"` applies one (explicit theme fields still override via `resolveDeckTheme`); a **live Template picker** in the Slideshow toolbar lets viewers switch (`presetTheme()`). Font: serif decks read editorial (`deckFontFamily`).
- **Unsplash auto-fill (`slide-images.ts`):** a slide with `extra.imagePrompt` (and no `image_url`) auto-sources a landscape Unsplash photo with attribution. `resolveUnsplashImage(query)` → POSTs `/api/unsplash` `search.getPhotos`, module-cached + deduped, fires `photos.trackDownload` (ToS). `SlideView`'s `useSlideImage(slide)` hook resolves explicit-URL-first, else the prompt. **`/api/unsplash` gained the `photos.trackDownload` method** for compliance.
- **Pack:** skill `slide-decks` (tiers, layouts, image guidance, presets, Unsplash). Content blocks `deck-fancy`/`deck-deluxe`/`deck-from-research` ("Presentations" category). Migrations: the slide-deck pack + `presentation_unsplash_teaching.sql` + `presentation_presets_teaching.sql`.

## 5. Forms vertical

- **Emit:** a `<questionnaire>` … `</questionnaire>` tag wrapping **section-per-question markdown**: each question is a `## Q1: …` heading, the next line is `Type: <Input|Text|Radio|Checkbox|Dropdown|Slider|Toggle>`, choices are a `-` bullet list, sliders add `Range: min-max`. Parsed by `separatedMarkdownParser` (`processors/custom/parser-separated.ts`) → sections; `QuestionnaireContext` reads `Type:`/options/range. **This format is the real parser contract — don't change it without reading the parser.**
- **Render + answer round-trip:** `QuestionnaireArtifact → QuestionnaireRenderer`. The user's answers persist into the message content via the **generic persistence strategy** (`persistenceStrategy:"generic"` in the registry + `features/canvas/artifact-types/persistence/artifact-adapters.ts`), so the model SEES them next turn. NOTE: earlier this session I'd wired a per-block `useMessageBlockPersistence` hook into `QuestionnaireRenderer`; the architecture upgrade **generalized that into the generic strategy** — the per-block hook is gone and that's correct, don't re-add it.
- **Pack:** skill `interactive-forms` (the format, 7 types, the answers-come-back idea). 3 content blocks ("Forms" category). Migration `migrations/forms_render_block_pack.sql`.

---

## 6. DB packs reference (live UUIDs — for skill_config.included, etc.)

**Skills (`skl_definitions`, `skill_type='render_block'`, system, public):**
| skill_id | uuid |
|---|---|
| `svg-illustrations` | `24523cca-3b47-4451-88e6-b7ce5d5f8c19` |
| `data-charts` | `dfbebf4d-fc2a-4378-9285-8f97edda03c2` |
| `slide-decks` | `baee889a-ff81-4755-bea3-879bc7b2e931` |
| `interactive-forms` | `be6f1297-d821-42af-8fc3-cfeaaf1cbfbd` |
| `mermaid-diagrams` | `a79122d6-cd9f-4235-8ca2-ac386473f09d` |
| `interactive-maps` | `9916558b-dd84-4955-b8c6-52a9cc0d7aa6` |
| `stat-cards` | `9d40080c-e36c-4821-836d-4a925912d343` |
| `code-diffs` | `c1a9b2b6-ad08-4ce9-ac06-f25f2c8e4e37` |

**Render defs (`skl_render_definitions.block_id`):** `mermaid`, `svg`, `chart`, `presentation`, `questionnaire`.

**Sample agents (`agx_agent`, owned by info@aimatrx.com, skill in `skill_config.included`):**
| name | id |
|---|---|
| SVG Illustrator (sample) | `7ac52030-2555-4e04-8da2-747f0f3debd3` |
| Chart Builder (sample) | `f0db58a9-0ac7-4393-af0d-8b1786d91772` |
| Deck Builder (sample) | `2cfe03bf-7ff8-46cb-9518-3f0817fbbfaf` |
| Form Builder (sample) | `b2d86144-7b2c-4583-92f4-e598ba3f27d1` |
| Map Maker (sample) | `46aeec4b-53fc-4314-9645-1ab279c4dfc9` |
| Stat Reporter (sample) | `de1724db-014a-406c-809b-edcd62743629` |
| Diff Reviewer (sample) | `bfdb33e7-e9a2-4f31-8156-c93f997f9403` |

**Content blocks (13):** `svg-illustration`, `svg-diagram`, `svg-infographic` (Illustrations) · `chart-any`, `chart-bar`, `chart-line`, `chart-pie` (Charts) · `deck-fancy`, `deck-deluxe`, `deck-from-research` (Presentations) · `form-questionnaire`, `form-survey`, `form-intake` (Forms).

**Applying migrations:** no local `psql`/connection string and the Supabase MCP needs OAuth. The reliable path used all session: from `/Users/armanisadeghi/code/aidream`, `uv run python db/apply_migrations.py --only <file_stem> --source matrx-frontend [--dry-run]` — applies ONE pending file + records the shared ledger. Verify live with a throwaway `node --env-file=.env.local --import tsx` script using `createAdminClient()`. Model id used for sample agents: `5b467c4b-80f3-420f-a516-05218907521b`.

---

## 7. Verification state (honest)

- **Statically:** all code tsc-clean + eslint-clean; chart parser unit-verified (9 cases); SVG meta-parsing verified on real examples.
- **Live-verified:** SVG + chart + all new diagram types render in `/demos/mermaid`; the deck preset picker (all 10 presets, Midnight palette switch) at `/demos/slide-deck`; Unsplash auto-fill (image-split + image-full slides sourced photos with attribution).
- **Verified by code-trace (not a live e2e click-through):** svg/chart **materialization to `canvas_items`** (registry-driven, identical path to mermaid which is proven) and the forms **answer round-trip** (generic strategy; mirrors the proven quiz path). A full live test = emit the block in a real `/chat` turn and confirm the `canvas_items` row / the answers reaching the model. Low risk but not exercised live.
- **Headless-preview gotcha:** the dev server's first compile of heavy chunks (mermaid ~2MB, Slideshow export menu) takes 30–45s; screenshots sometimes render blank even when the DOM is correct (use `preview_eval` to read the real DOM + computed styles). Restart the dev server after many rapid edits (Turbopack HMR corruption).

---

## 8. Gotchas / environment

- **Concurrent multi-agent tree (BIG one):** this repo runs several Claude sessions on the same `main`, and history is "rewritten constantly." My commits were repeatedly **bundled into other agents' commits** (e.g., `5c7744c95 "Before massive sheet migration"`) and once `main` got reset to an older tip — work appeared "lost" but was always recoverable from the object store. **My commits were never pushed to origin**, which is why a reset could un-tip them. If durability matters, **push** (but `git push` on `main` deploys to Vercel and may carry others' commits — confirm first). A safety branch `render-blocks-recovery` was created during the scare; it's now redundant (everything's on `main`) — safe to delete.
- **Stage only your files** — never `git add -A` (the tree always has other agents' uncommitted work, often 100+ files).
- **The `extra` dict is your friend** for slide data — it survives both the Pydantic server parse and the client-raw path, so new slide fields go there.

---

## 9. Open items / possible next steps

- **Live e2e materialization + forms-answer test** (the one thing verified-by-trace, not by a live `/chat` turn).
- **Deck "surface" presets** (dark/light slide backgrounds): presets currently vary accent palette + variant + font, not the card surface. A `midnight`/dark surface would need text-color flipping in `SlideView` — deferred.
- **Mermaid bundle-build cost:** the build-time doubling is Vercel **compiling** mermaid's huge code-split graph (cytoscape/d3/elkjs/katex). It's correctly behind `next/dynamic`; the only lever to reclaim build time is loading mermaid from a CDN at runtime instead of bundling — a focused future change.
- **More chart types / SVG export-as-PNG / per-slide image regeneration** — nice-to-haves.

---

## 10. Key file map

- **SVG:** `components/mardown-display/blocks/svg/SvgBlock.tsx`; renderer `features/canvas/artifact-types/renderers/SvgArtifact.tsx`; type in `types/python-generated/missing-types.ts`.
- **Charts:** `components/mardown-display/blocks/chart/{chart-spec.ts,ChartCanvas.tsx,ChartBlock.tsx}`; renderer `…/renderers/ChartArtifact.tsx`.
- **Decks:** `components/mardown-display/blocks/presentations/{SlideView.tsx,Slideshow.tsx,presets.ts,slide-images.ts}`; renderer `…/renderers/PresentationArtifact.tsx`; `/api/unsplash/route.ts`.
- **Forms:** `components/mardown-display/blocks/questionnaire/{QuestionnaireRenderer.tsx,QuestionnaireContext.tsx}`; parser `…/processors/custom/parser-separated.ts`; renderer `…/renderers/QuestionnaireArtifact.tsx`.
- **Architecture:** `features/canvas/artifact-types/{artifact-type-registry.ts,artifact-renderers.tsx,renderers/*}`, `features/canvas/materialization/*`, `features/canvas/core/CanvasBody.tsx`, `features/canvas/shared/PublicCanvasRenderer.tsx`, `features/canvas/redux/canvasSlice.ts`.
- **Detection plumbing:** `…/processors/utils/content-splitter-v2.ts` (`SPECIAL_CODE_LANGUAGES`), `features/agents/redux/execution-system/utils/{stream-block-accumulator.ts,assemble-cx-content-blocks.ts}`, `…/block-registry/{BlockComponentRegistry.tsx,BlockRenderer.tsx}`.
- **Migrations:** `migrations/{svg,chart,forms}_render_block_pack.sql`, the slide-deck pack, `presentation_{unsplash,presets}_teaching.sql`.
- **Demos:** `app/(dev)/demos/slide-deck/page.dev.tsx`, `app/(dev)/demos/mermaid/page.dev.tsx`.

---

## 11. Recipe to add the NEXT render block (distilled)

1. Build the FE block component (light; heavy libs behind `next/dynamic ssr:false`).
2. Register it: add a `{canvasType, aliases, standaloneAliases, materializable:true}` row in `artifact-type-registry.ts`, a lazy entry in `artifact-renderers.tsx`, and a thin `XArtifact.tsx` wrapper in `renderers/`. Add the canvasType to `CanvasContentType`. (If client-only, add a `*RenderBlock` type in `missing-types.ts`.)
3. Detection: add the fence to `SPECIAL_CODE_LANGUAGES` + the accumulator promotion + the assemble-cx round-trip (only for fence types).
4. Pack: ONE idempotent migration (skill body — read the REAL parser, don't invent syntax — + render def + content blocks) applied via the aidream applier + verified live; then a sample agent.
5. Materialization, canvas render, and public render come **free** from the registry.
