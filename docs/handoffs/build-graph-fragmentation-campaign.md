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
- Build config: `next.config.js` (`experimental.cpus: 4` + `turbopackMemoryLimit` 40 GiB are load-bearing; heavily commented). Profiles `MATRX_PROFILE` across 3 Vercel projects. Turbopack fs-tracing guard + `pnpm build:trace` local profiling: `docs/BUILD-TIME-TURBOPACK.md`.
- Ship loop: edit → `pnpm type-check` → `git commit --only <your files>` (parallel sessions share the tree) → `./scripts/release.sh` → read that release's Vercel duration + build-system report (Vercel MCP `list_deployments` / `get_deployment_build_logs`; apples-to-apples = same machine line, same `MATRX_PROFILE` line, cold vs warm cache).
- Baseline as of 2026-07-28: v0.4.191 cold build **12 min**, "No memory or disk space problems detected."

## 3. Remaining work (priority order)

1. **File-previewer triple registry (~23 sites)** — `features/files/components/core/FilePreview/FilePreview.tsx` (11) + `components/mardown-display/blocks/matrx-file/UniversalInlineFile.tsx` (7) + `features/code/editor/BinaryFileViewer.tsx` (5) re-split the same previewer modules. Fix: one shared previewer switch, static except `PdfPreview` (pdfjs) and maybe `HtmlPreview`.
3. **`features/canvas/core/CanvasRenderer.tsx` — ~18 inner dynamics** beneath 3 already-dynamic shells, loading the same block components as BlockComponentRegistry (triple-lazied). Tier like batch 3.
4. **Monaco:** ~6 duplicate wrappers over one dep + **dead code** `features/code-editor/components/unused/*` (ProCodeEditor, CodeEditor, AdvancedCodeEditor, LiveCodeEditor — still statically in the graph, verified present 2026-07-28) — delete, then one monaco edge.
5. **Batch 2 leftover — `AgentConversationDisplay.tsx`** (3 dynamics × 65 contexts): its `AgentAssistantMessage` dynamic carries a "static import 500s the route — jspdf → fflate node worker" comment. Verify whether `next.config.js` `turbopack.resolveAlias` jspdf-browser pin made it stale (branch test: static-import, dev SSR render of `/chat`). If safe, all three + `AgentEmptyMessageDisplay`'s 2 inner dynamics go static.
6. **`features/admin/AdminFeatureProvider.tsx`** — 4 dynamics in an always-mounted provider → Method C wrapper→core.
7. **react-syntax-highlighter heavy entry** (verified still true 2026-07-28): all 8 importers use `Prism` (every refractor grammar) — switch to `PrismLight` + register only used languages (~ts, js, tsx, python, json, bash, sql). Analyzer had it at ~563 modules × 715 routes.
8. **Cartesia shell-leak** — `constants/voice-options.ts` still statically imports `lib/cartesia/voices.ts` (2,243 LOC) (verified 2026-07-28); analyzer had `@cartesia/cartesia-js` in 716 routes. **Re-verify shell reach first** (data is from 2026-04) — if still shell-reachable, cut at the import root with a lazy loader.
9. **lucide-react parse pile** — 3,671 importing files; the 2026-04 analyzer had 1,712 icon modules × 731 routes (~20% of every route's graph by module count). The proposed fix is inlining shell-used icons (the `@lobehub/icons` playbook). **Stale data — rerun `pnpm build:analyze:save` + `scripts/analyze-routes.py` before acting.**
10. **react-leaflet per-export wrapping** — `app/(public)/free/zip-code-heatmap/components/ZipCodeMap.tsx` (ships in slim!) + `app/(dev)/demos/tests/_maps/OpenStreetMapComponent.tsx` → one map impl module each.
11. Small: `components/mardown-display/blocks/json/JsonBlock.tsx` view modes, `components/ssr/route-display/RouteDisplaySwitcher.tsx`, `NotesWindow` inner singles, `ContentManagerMenu.lazy.tsx`.
12. **`(dev)` helper-leak audit** — prod code importing helpers under `app/(dev)/` bypasses profile parking.
13. **Dead `webpack:` block in `next.config.js`** — Next 16 builds with Turbopack only; the whole `webpack:` block + `utils/next-config/webpackConfig.js` is a prod no-op that misleads agents. Port anything real to `turbopack:{}` or delete.
14. **Lint guard design** — nothing stops re-fragmentation. Do NOT resurrect the reverted `reactLazyBan` (wrong rule). A right guard flags *new registries of ≥4 dynamics* — design carefully or skip.
15. **Authed production click-through** of batch 1–3 surfaces still owed: `/settings/*` tabs, org resources → Peek, `/artifacts/[id]`, chat with mixed block types. (Guest `/p/chat` verified 2026-07-28; agent sessions can't type login passwords — needs Arman or a logged-in browser session.)

Remaining ranked targets from the 3-agent audit (verify before acting): PublicProviders → CanvasSideSheetInner (1.4 MB × (public) routes), matrx-envelope registry framer-motion (109 routes), KindInstanceRender → SafeBlockRenderer, rootReducer lazy injection (architectural), transcript-parser importing AdvancedTranscriptViewer. Arman is skeptical of the CodeBlock/IconResolver "defeated split" findings — verify chains personally.

## 4. Done

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
- `MATRX_PROFILE` on ai-matrx resolves `core`; the slim cutover is prepared but not flipped — escape hatch, Arman's call.
- Any `.channel(` work → `supabase-realtime` skill first (the `/p/chat` incident class).
- Parallel sessions share this tree: `git commit --only`, expect foreign staged files; dev servers only via `.claude/launch.json`.

## Change log
- `2026-07-28` — claude: took over; verified `/p/chat` hotfix live + 12-min green baseline; absorbed `docs/_current/bundle-optimization-tracker.md` (stale items re-verified against code, resolved items collapsed, tracker deleted).
- `2026-07-27` — claude: doc created at campaign handoff (batches 1–3 + hotfix shipped; backlog ranked).
