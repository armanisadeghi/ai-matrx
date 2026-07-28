---
status: active
updated: 2026-07-28
repos: [matrx-frontend]
vision: [.claude/skills/code-splitting/SKILL.md]
---

# Handoff — Build-Graph Fragmentation Campaign (memory, build time, chunk consolidation)

**Read first:** `.claude/skills/code-splitting/SKILL.md` (rule 3, "THE FRAGMENTATION LAW") — the doctrine this campaign produced. Nothing below overrides it. This doc also absorbed `docs/_current/bundle-optimization-tracker.md` (deleted 2026-07-28) — its still-open items live in Remaining work; its resolved/disproven claims are in Done and Gotchas.

## 1. Vision

**Arman's, and now measured fact:** the production build's binding constraints are **memory and build time** — NOT bundle size, NOT lighthouse. The Vercel Turbo machine has 60 GB; the app once built in 4–5 min and crept to 20–40 as split boundaries accumulated. Protection = keep client code **in one piece, compiled once, behind ONE `next/dynamic({ssr:false})` boundary at the edge of each surface** — the model is [`components/MarkdownStream.tsx`](../../components/MarkdownStream.tsx) ("a million lines as ONE piece behind ONE edge; fragmenting the client graph is what balloons memory").

**Mechanism:** every `next/dynamic()` manufactures a loadable — a manifest entry whose chunk group resolves per consuming context. `React.lazy` is only an async edge inside the parent's chunk graph. Build memory/time scale with **chunk-group count × consuming contexts**.

**Refinements (each explicit, in order):**
1. **Controlled experiment 2026-07-27** (identical 60 GB machines, cold cache, v0.4.122 base): baseline GREEN 12m · +~190 lazy→dynamic conversions **OOM DNF** (reverted v0.4.137) · same surfaces **consolidated** (5 edges replacing ~90 boundaries) **GREEN 8m, −108 MB — 33% faster than baseline**.
2. **Tiering (Arman's browser concern, adopted):** the light majority of a surface goes static; genuinely heavy engines (monaco/syntax-highlighter, mermaid, reactflow, CodeMirror, Univer, pdfjs) keep individual boundaries — as **`React.lazy`** when inside an already-`ssr:false` gate.
3. **Sanctioned exceptions:** `lazyOverlay`'s ~156 one-at-a-time overlay entries; true SSR-safety boundaries (commented in place).
4. **Measure every batch:** one release per batch; read Vercel build duration + build-system report. Never land a fleet blind.

## 2. Resources

- Doctrine + patterns + leak-hunt method: `.claude/skills/code-splitting/SKILL.md`. Full incident history: memory `project_build_oom_findings`.
- Front-door pattern: `Foo.tsx` (thin `"use client"` shell, `dynamic(() => import("./FooImpl"), {ssr:false})`, exports props type) over `FooImpl.tsx` (all static). Canonical: `MarkdownStream.tsx`, `ChatSidebar.tsx`. Consolidated registry exemplar: `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx` (72 static / 8 `React.lazy`, header comment names why).
- Build config: `next.config.js` (`experimental.cpus: 4` + `turbopackMemoryLimit` 30 GiB are load-bearing; heavily commented). The ai-matrx Vercel project builds with **`MATRX_PROFILE=slim`** (observed in the v0.4.192 build log 2026-07-28 — the slim cutover HAS been flipped; admin parks). Profiles `MATRX_PROFILE` across 3 Vercel projects. Turbopack fs-tracing guard + `pnpm build:trace` local profiling: `docs/BUILD-TIME-TURBOPACK.md`.
- Ship loop: edit → `pnpm type-check` → `git commit --only <your files>` (parallel sessions share the tree) → `./scripts/release.sh` → read that release's Vercel duration + build-system report (Vercel MCP `list_deployments` / `get_deployment_build_logs`; apples-to-apples = same machine line, same `MATRX_PROFILE` line, cold vs warm cache).
- Baseline as of 2026-07-28: v0.4.191 cold build **12 min**, "No memory or disk space problems detected."

## 3. Remaining work (priority order)

1. **Production click-through + measure the 2026-07-28 wave.** Everything in the top Done block below ships in the next release — read its Vercel build duration/report, then click through: a file preview (cloud files + inline chat file + code-editor binary tab), a canvas open (quiz/flashcards/diagram/code), a chat transcript with mixed blocks, `/free/zip-code-heatmap`, tasks/settings/agent-connections/content-plan resizable shells.
2. **react-syntax-highlighter heavy entry** (verified 2026-07-28): all 8 importers use `Prism` (every refractor grammar) — switch to `PrismLight` + register only used languages (~ts, js, tsx, python, json, bash, sql). Runtime-bundle win; be careful not to visibly degrade rare-language highlighting in chat.
3. **Monaco ~6 duplicate wrappers** over one dep → one monaco edge (dead `components/unused/*` already deleted).
4. **Cartesia shell-leak** — `constants/voice-options.ts` statically imports `lib/cartesia/voices.ts` (2,243 LOC); analyzer (2026-04, stale) had `@cartesia/cartesia-js` in 716 routes. Re-verify shell reach first; if real, cut at the import root with a lazy loader.
5. **lucide-react parse pile** — 3,671 importing files; 2026-04 analyzer had it at ~20% of every route's graph. Proposed fix is inlining shell-used icons (the `@lobehub/icons` playbook). **Rerun `pnpm build:analyze:save` + `scripts/analyze-routes.py` before acting.**
6. **Previewer follow-up:** single `dynamic(ssr:false)` front doors for the ungated entry paths — `FileTabsBody.tsx`/`MobileStack.tsx` (route `/files/f/[fileId]` statically reaches FilePreview) and `EditorArea.tsx:35` (`/code` statically reaches BinaryFileViewer).
7. **`(dev)` leak, last cluster:** `MatrxTable` under `app/(dev)/demos/tests/matrx-table/` is imported by production flashcards (4 sites) and drags the legacy AnimatedForm system — move its 4 component files to `components/matrx/table/` (which already owns its Table*/BottomSection deps); consider deleting the dead `app/(transitional)/_flash-cards/` copies. After this, `app/(dev)` is parkable.
8. Small: `components/ssr/route-display/RouteDisplaySwitcher.tsx` (4 dynamics), `NotesWindow` inner singles, `ContentManagerMenu.lazy.tsx`, demo `_maps/OpenStreetMapComponent.tsx` per-export leaflet wrapping.
9. **Dead `webpack:` block in `next.config.js`** — Next 16 builds with Turbopack only; the block + `utils/next-config/webpackConfig.js` is a prod no-op that misleads agents. Port anything real to `turbopack:{}` or delete.
10. **Lint guard design** — nothing stops re-fragmentation. Do NOT resurrect the reverted `reactLazyBan` (wrong rule). A right guard flags *new registries of ≥4 dynamics* — design carefully or skip.
11. **Authed production click-through of batches 1–3** still owed: `/settings/*` tabs, org resources → Peek, `/artifacts/[id]`. (Agent sessions can't type login passwords — needs Arman or a logged-in browser session; folds naturally into item 1.)

Remaining ranked targets from the 3-agent audit (verify before acting): PublicProviders → CanvasSideSheetInner (1.4 MB × (public) routes), matrx-envelope registry framer-motion (109 routes), KindInstanceRender → SafeBlockRenderer, rootReducer lazy injection (architectural), transcript-parser importing AdvancedTranscriptViewer. Arman is skeptical of the CodeBlock/IconResolver "defeated split" findings — verify chains personally.

## 4. Done

- **2026-07-28 wave (committed, ships next release):** previewer triple registry → ONE `PreviewerSwitch` (23 loadables → 7 static + 4 in-gate lazy; `BinaryFilePdfPreview`'s stacked boundary absorbed); CanvasRenderer tiered batch-3 style (18 dynamics → 15 static + 3 in-gate lazy); batch 2 finished (`AgentConversationDisplay` trio static — the jspdf SSR-500 note was stale, alias pin verified by dev SSR render; `AgentEmptyMessageDisplay`'s `MarkdownStreamImpl` front-door bypass killed); AdminFeatureProvider → Method C wrapper→core; zip-code heatmap 5 leaflet dynamics → 1 view edge; JsonBlock 5 dynamics → in-gate lazy; dead code deleted (`code-editor/components/unused/*`, `components/ssr/select/app-data-select.tsx`); resizable-panel kit relocated `app/(dev)…/_lib` → `features/resizable-panels/` (28 of 33 (dev) helper leaks closed, 25 import sites).
- **v0.4.192 measured (markdown front door alone): 12 min cold, no memory problems, output −1 MB** — flat vs the 12-min v0.4.191 baseline; the win is chunk-group count/memory headroom, not wall-clock yet.
- **v0.4.194 ERRORED — NOT this campaign's code:** a parallel session committed a rag-visualization front-door rename (`IngestFlowAnimation.tsx` → `*Impl`) while leaving the new front-door file untracked, so main itself didn't resolve `DocumentTab.tsx`'s import; local gates passed because tsc/dev read the working tree where the file existed. Their v0.4.195 (3 min later) committed the missing files and carried the whole wave green: **12 min cold, no memory problems**. New release gate `scripts/check-untracked-imports.sh` (first in `run-release-gates.sh`) makes this class extinct.
- **Measurement discipline (Arman's ruling, 2026-07-28):** every batch's effect is read as a controlled comparison — same Vercel project/profile/machine line, same cache state, adjacent releases. If interleaved foreign commits or a failed build pollute the pair, re-establish the baseline before attributing anything; never claim a win or a regression from a polluted pair.
- **Batch 4 (2026-07-28): react-markdown consolidated to ONE front door** — `components/markdown-core/MarkdownCore.tsx` → `MarkdownCoreImpl` (preset map: plain/gfm/gfm-breaks/math/rich/chat/message); 11 wrappers converted; dead edges deleted (`text-block/*` minus `editorLoading`, `candidate-profiles/*`, `MarkdownClassifier`); CleanedMarkdownPane's dynamic-as-plugin bug fixed. Three deliberate standalone exceptions, each commented in place: the two `(public)` share viewers (SSR/SEO needs the body in server HTML) and `FilePreview/previewers/MarkdownPreview.tsx` (rehype-prism grammars stay out of the shared chunk). Adversarially verified (preset fidelity, no lost props, no dangling imports) + live-rendered on the markdown demo.
- Mistaken lazy→dynamic campaign fully reverted (v0.4.137) — 14 straight OOM builds back to green.
- Batch 1 (v0.4.142): artifact-renderers, settings registry (39 tabs), org peek registry (19) consolidated behind front doors. Production 9 min.
- Batch 2 (v0.4.144): SmartAgentVariables, JsonInspector, ContextValueBody, ChatSidebar front door, UtilitiesOverlay.
- Batch 3 (v0.4.147): BlockComponentRegistry 72 static / 8 `React.lazy`; artifact-renderers re-tiered (mermaid/reactflow back to lazy).
- `/p/chat` SidebarChats static-realtime-topic crash hotfixed (`uniqueChannelTopic`) — verified live on production 2026-07-28, zero console errors.
- Doctrine written: code-splitting skill rule 3 + CLAUDE.md invariant rewritten around the Fragmentation Law.
- From the absorbed tracker: lobehub/icons removed (22→9 min win); pdfjs-dist dep dedup; layout `import type` sweep (reduxTypes/emptyGlobalCache); thin-shell+Impl refactor of 7 shell singletons; `heavyImplStaticImportBan` + `canonicalMenuStaticImportBan` eslint guards; prompt-builtins shell leak died with `UnifiedContextMenu`'s deletion (verified gone 2026-07-28); heavy `from 'lodash'` imports are at zero; `reactCompiler` contradiction resolved (`true`, matches CLAUDE.md).

## 5. Gotchas

- **Never mass-convert `React.lazy` → `next/dynamic`** (the OOM incident). In-gate, prefer static; where runtime weight demands a boundary, `React.lazy`.
- **Don't stack `ssr:false` boundaries** down one render path; don't re-wrap existing front doors.
- **SSR-safety boundaries are real** (jspdf/fflate class) — never flatten one without a server-render test.
- **The OOM ceiling still exists** (~60 GB; `cpus: 4` + 40 GiB limit load-bearing). Builds fail again → read the SIGKILL **phase line** first (mid-compile = Turbopack pool; "Collecting page data" = worker pool); green-then-red supersets = borderline-nondeterministic, not the last commit.
- **Disproven — do not re-suggest:** adding `@tabler/icons-react` / `react-icons/*` to `optimizePackageImports` (already in Next's default list — verified against Next source; the flag doesn't reduce Turbopack parse cost anyway); "disk size = bundle size" (monaco + onnx runtimes are CDN-loaded); deleting zero-importer files as a *bundle* win (build-time micro-win only).
- Batch 1's `artifact-renderer-keys.ts` duplicates the RENDERERS key list — keep in lockstep with `artifact-renderers.tsx`.
- `MATRX_PROFILE` on ai-matrx is `slim` (flipped; verified in the v0.4.192 build log). Compare build times only against other slim builds.
- Any `.channel(` work → `supabase-realtime` skill first (the `/p/chat` incident class).
- Parallel sessions share this tree: `git commit --only`, expect foreign staged files; dev servers only via `.claude/launch.json`.

## Change log
- `2026-07-28` (later) — claude: shipped the wave in the Done block (previewers, canvas, batch-2 finish, admin provider, leaflet, JsonBlock, (dev) kit relocation, dead code); v0.4.192 measured flat at 12 min; remaining list re-ranked.
- `2026-07-28` — claude: took over; verified `/p/chat` hotfix live + 12-min green baseline; absorbed `docs/_current/bundle-optimization-tracker.md` (stale items re-verified against code, resolved items collapsed, tracker deleted).
- `2026-07-27` — claude: doc created at campaign handoff (batches 1–3 + hotfix shipped; backlog ranked).
