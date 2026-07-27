# Handoff — Build-Graph Fragmentation Campaign (memory, build time, chunk consolidation)

**Status:** active · **Owner:** unassigned (previous agent session ended) · **Last groomed:** 2026-07-27
**Read first:** `.claude/skills/code-splitting/SKILL.md` (rule 3, "THE FRAGMENTATION LAW") — it is the doctrine this campaign produced. Nothing below overrides it.

---

## 1. Vision

**Original vision (Arman's, and now measured fact):** the production build's binding constraints are **memory and build time** — NOT bundle size, NOT lighthouse scores. The Vercel Turbo machine has 60 GB; this app once built in 4–5 minutes and crept to 20–40 as code-splitting boundaries accumulated. The way you protect memory/time is to keep client code **in one piece, compiled once, behind ONE `next/dynamic({ssr:false})` boundary at the edge of each surface**. The model is [`components/MarkdownStream.tsx`](../../components/MarkdownStream.tsx): an enormous rendering engine (block registry, artifacts, editors) as one statically-imported graph behind one edge.

**Why (the mechanism):** every `next/dynamic()` call manufactures a *loadable component* — a react-loadable-manifest entry whose chunk group is resolved per consuming context. `React.lazy` is only an async edge inside the parent's existing chunk graph (no manifest entry). Build memory/time scale with **chunk-group count × consuming contexts**. Scattered dynamics ("fragmentation") multiply that product; consolidation collapses it.

**Refinements added during the work (in order, each explicit):**

1. **The controlled experiment (2026-07-27)** that turned the vision into numbers — identical 60 GB Turbo machines, cold cache, v0.4.122 base:
   - baseline: GREEN, 12 min
   - baseline + ~190 lazy→dynamic conversions: **OOM SIGKILL, DNF** (this mistaken campaign was fully reverted in v0.4.137; the whole story is in the memory file and the skill)
   - baseline + the same surfaces **consolidated** (all-static inside one edge per surface, 5 edges replacing ~90 boundaries): **GREEN, 8 min, −108 MB output — 33 % faster than untouched baseline**
2. **Tiering (Arman's browser concern, adopted as policy):** consolidation must not bombard the browser. The *light majority* of a surface goes static (one fetch, no chunk waterfall); the *genuinely heavy engines* (monaco/syntax-highlighter, mermaid, reactflow, CodeMirror, Univer, pdfjs) **keep individual boundaries** so a page never downloads an engine it isn't using. Inside an already-`ssr:false` gate, those retained boundaries should be **`React.lazy`** (build-cheap), not `next/dynamic`.
3. **Sanctioned exceptions:** `features/overlays/OverlayController.tsx`'s ~156 `lazyOverlay` entries (windows open one-at-a-time — per-item chunks are correct) and true SSR-safety boundaries (see Gotchas).
4. **Measure every batch:** one release per batch, read the Vercel build duration + "Build system report" per release. Never land a fleet of changes blind.

---

## 2. Current state (gap analysis)

### Done — deployed and verified
- **Revert of the mistaken lazy→dynamic campaign** (v0.4.137) — production went from 14 consecutive OOM build failures back to green.
- **Batch 1** (v0.4.142, commit `eea65ef88`) — LIVE, **production built in 9 min**:
  - `features/canvas/artifact-types/artifact-renderers.tsx` — 30 renderers static (see batch 3 tiering below); out-of-gate edge = `ArtifactRenderDynamic.tsx` + component-free `artifact-renderer-keys.ts` (consumer: `features/artifacts/components/CmsArtifactDetail.tsx`).
  - `features/settings/registry.ts` — 39 tabs static; route edges = `features/settings/route-shell/SettingsTabContent.tsx` / `SettingsRouteSidebar.tsx` front doors over new `*Impl.tsx` files (overlay path already edged by `lazyOverlay`).
  - `features/organizations/peek/registry.ts` — 19 peeks static; edge = `features/organizations/peek/ResourcePeekHost.tsx` front door over `ResourcePeekHostImpl.tsx`.
- **Batch 2** (v0.4.144, commit `c073b527c`) — stacked-boundary removals: `SmartAgentVariables.tsx` (6 dynamics → static; was 6 × 65 contexts), `JsonInspector.tsx` (3 light panes static, CodeMirror `JsonEditorPane` keeps its boundary), `ContextValueBody.tsx` (stopped double-wrapping the `MarkdownStream`/`JsonInspector` front doors), `ChatSidebar.tsx` → front door + `ChatSidebarImpl.tsx` (4 always-together parts static), `UtilitiesOverlay.tsx` (NotesView static).
- **Batch 3** (v0.4.147, commit `44bdc0f14`... check `git log`) — the flagship:
  - `components/mardown-display/chat-markdown/block-registry/BlockComponentRegistry.tsx` — **72 of 80 block components static; 8 heavy keep `React.lazy`**: `CodeBlock`, `HtmlInlinePreview`, `ReactCodeBlock`, `StreamingDiffBlock`, `SearchReplaceBlock` (react-syntax-highlighter), `MatrxFileBlock` (Univer/previewers), `InteractiveDiagramBlock` (reactflow), `MermaidBlock` (mermaid).
  - `artifact-renderers.tsx` re-tiered: `mermaid`/`diagram`/`react`/`code` renderers back to `React.lazy` (batch 1 had made them static, which put mermaid/reactflow into the always-fetched markdown chunk — runtime regression, fixed).
- **Doctrine + record:** Fragmentation Law written into `.claude/skills/code-splitting/SKILL.md` (rule 3 + anti-pattern table + checklist); full incident + backlog in the agent memory file `project_build_oom_findings`.
- **Hotfix** (last release of this session): `features/public-chat/components/sidebar/SidebarChats.tsx` — production `/p/chat` crashed with "cannot add postgres_changes callbacks after subscribe()" (static realtime topic, a pre-existing landmine on the supabase-realtime skill's suspicious list, surfaced by batch 2's mount-timing change). Fixed with `uniqueChannelTopic()`. **VERIFY on production `/p/chat` after deploy — this was in flight when the session ended.**

Build trajectory: 21m50s (v0.4.122) → 9 min (batch 1 alone) → 10–13 min band with ~10 heavy feature releases layered on. Zero build failures since the revert.

### Partial
- **Batch 2 leftover:** `features/agents/components/messages-display/AgentConversationDisplay.tsx` (3 dynamics that render together, × 65 contexts) was deliberately **skipped**: its `AgentAssistantMessage` dynamic carries a load-bearing comment ("static import 500s the route — jspdf → fflate node worker"). Before consolidating, verify whether `next.config.js`'s `turbopack.resolveAlias` jspdf-browser pin has made that comment stale (test: static-import it in a branch, run a dev SSR render of `/chat`). If safe, all three go static; `AgentEmptyMessageDisplay.tsx`'s own 2 inner dynamics flatten too.
- **Production verification pass** of batches 1–3 surfaces (authed): `/settings/*` tabs, org resources → Peek, `/artifacts/[id]`, chat with mixed block types, `/p/chat` sidebar. Local dev-server checks passed pre-release; production click-through was still owed when the session ended.

### Not started — the ranked backlog (from a 3-subagent audit; full details in memory `project_build_oom_findings`)
1. **`react-markdown` duplicate wrappers × 10** — 9 inside `components/mardown-display/**` (`MarkdownRenderer`, `BasicMarkdownContent`, `ConfigurableMarkdownContent`, `MarkdownInput`, `MarkdownTextDisplay`, `NewRichTextEditor`, `LinkComponentWithFetch`, `ThinkingTraceMarkdown`, `CandidateProfile`) + `features/rag/.../CleanedMarkdownPane.tsx`. Each duplicates the unified/remark graph into its own chunk group. Fix: ONE shared `LazyReactMarkdown` module; likely the biggest single-dep win remaining.
2. **File-previewer triple registry (~23 sites)** — `features/files/components/core/FilePreview/FilePreview.tsx` (11) + `components/mardown-display/blocks/matrx-file/UniversalInlineFile.tsx` (7) + `features/code/editor/BinaryFileViewer.tsx` (5) re-split the *same* previewer modules. Fix: one shared previewer switch, static except `PdfPreview` (pdfjs) and maybe `HtmlPreview`.
3. **`features/canvas/core/CanvasRenderer.tsx` — ~18 inner dynamics** beneath 3 already-dynamic shells (`AdaptiveLayout`, both `ConversationShell`s) loading the same block components as BlockComponentRegistry (triple-lazied). Tier like batch 3.
4. **Monaco:** ~6 duplicate wrappers over one dep + **dead code** `features/code-editor/components/unused/*` (ProCodeEditor, CodeEditor, AdvancedCodeEditor, LiveCodeEditor) still statically in the graph — delete, then one monaco edge.
5. **`features/admin/AdminFeatureProvider.tsx`** — 4 dynamics in an always-mounted provider → Method C wrapper→core.
6. **react-leaflet per-export wrapping** — `app/(public)/free/zip-code-heatmap/components/ZipCodeMap.tsx` (ships in slim profile!) + `app/(dev)/demos/tests/_maps/OpenStreetMapComponent.tsx` → one map impl module each.
7. Small: `components/mardown-display/blocks/json/JsonBlock.tsx` view modes, `components/ssr/route-display/RouteDisplaySwitcher.tsx`, `NotesWindow` inner singles, `ContentManagerMenu.lazy.tsx`.
8. **`(dev)` helper-leak audit** — prod code imports helpers under `app/(dev)/` ("fake demos" debt); profile parking does NOT catch those.
9. **Lint guard for the new doctrine** — there is currently NO automated guard against someone re-fragmenting (the earlier `reactLazyBan` was reverted along with the campaign — do NOT resurrect it; it enforced the *wrong* rule). A right guard would flag *new registries of ≥4 dynamics* — design carefully or skip.

### Known issues / risks
- **The OOM ceiling still exists.** ~60 GB machine, `next.config.js` `experimental.cpus: 4` + `turbopackMemoryLimit` 40 GiB are load-bearing. If builds fail again: read the SIGKILL **phase line** first (mid-compile = Turbopack pool; "Collecting page data" = worker pool) before blaming the last commit; a green build followed by red supersets means borderline-nondeterministic.
- Batch 1's `artifact-renderer-keys.ts` duplicates the RENDERERS key list — **keep in lockstep** with `artifact-renderers.tsx` when adding a type.
- `MATRX_PROFILE` on the ai-matrx Vercel project resolves to `core` (main + admin). The slim cutover (env pin per project) was prepared but **not flipped** — an available escape hatch if memory tightens, Arman's call.

---

## 3. Architecture / orientation

- **Front-door pattern:** `Foo.tsx` (thin `"use client"` shell: `dynamic(() => import("./FooImpl"), {ssr:false, loading})`, exports props type) over `FooImpl.tsx` (everything static). Grep `*Impl.tsx` for examples; canonical: `MarkdownStream.tsx`/`MarkdownStreamImpl.tsx`, `CanvasSideSheet.tsx`, `ChatSidebar.tsx`.
- **Registries:** id → component maps. Consolidated ones import components statically and keep heavy entries as `React.lazy` (see `BlockComponentRegistry.tsx` header comment — it names the 8 and why). `lazyOverlay` (`features/overlays/boundary/lazyOverlay.tsx`) is the sanctioned per-item splitter for overlays only.
- **Build config:** `next.config.js` — memory knobs under `experimental` (heavily commented, read before touching); build profiles `MATRX_PROFILE` (three Vercel projects: ai-matrx / ai-matrx-manage / ai-matrx-demos); releases only build for `release:`-prefixed commits via `scripts/vercel-ignore-build.sh`.
- **Ship loop:** edit → `pnpm type-check` (the ONLY type gate; the build ignores type errors) → `git commit --only <your files>` (parallel agent sessions share this tree — never `git add -A`) → `./scripts/release.sh --message "..."` → watch the Vercel build duration + build-system report for that release. One batch per release.
- **Measuring:** Vercel MCP (`list_deployments`, `get_deployment_build_logs`) or `vercel ls ai-matrx --prod`. Apples-to-apples = same machine line ("Turbo Build Machine 30 cores, 60 GB"), same profile line (`[matrx] MATRX_PROFILE=...`), cold-vs-warm cache line.

## 4. Next steps (in order)
1. Confirm the `/p/chat` hotfix release went READY; open `https://aimatrx.com/p/chat` and verify no error boundary and the sidebar loads (guest + signed-in).
2. Production click-through of batch 1–3 surfaces (list in "Partial" above).
3. Backlog item 1 (react-markdown ×10) as its own release; read the build time.
4. Backlog item 2 (previewer triple registry), then 3 (CanvasRenderer), then 4 (monaco + dead-code delete) — one release each, measure each.
5. Resolve the `AgentConversationDisplay` jspdf question and finish batch 2.
6. Sweep items 5–8; groom this doc after every batch (collapse done work to one line); delete the doc when the backlog is empty.

## 5. Gotchas & context
- **Never mass-convert `React.lazy` → `next/dynamic`.** That exact move OOM-killed 14 straight production builds on 2026-07-27 and was fully reverted. The skill's rule 3 has the numbers; treat it as law.
- **In-gate `React.lazy` is cheaper for the build than `dynamic`** — inside any `ssr:false` subtree, prefer static; where a boundary is genuinely needed for runtime weight, use `React.lazy`.
- **Don't stack `ssr:false` boundaries** down one render path; don't wrap an existing front door (e.g. `MarkdownStream`) in another `dynamic`.
- **SSR-safety boundaries are real:** some dynamics exist because a static import breaks SSR (jspdf/fflate node-worker class). Never flatten one without testing the server render; they're commented in place.
- **Realtime:** any `.channel(` work → `supabase-realtime` skill first; static topics crash on remount (the `/p/chat` incident).
- **Parallel sessions** work this repo simultaneously: check `git status` before committing, use `git commit --only`, expect the index to contain someone else's staged files.
- **Dev servers:** never start one raw; only via `.claude/launch.json` preview configs, and expect another session's server to be occupying the machine.
- The experiment worktrees (control / mine-only / right-way) live under the session scratchpad and are disposable; the right-way patch is fully landed on main.

## Change log
- `2026-07-27` — claude: doc created at campaign handoff (batches 1–3 + hotfix shipped; backlog ranked).
