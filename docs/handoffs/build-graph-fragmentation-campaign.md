---
status: active
updated: 2026-10-08
repos: [matrx-frontend]
vision: [.claude/skills/code-splitting/SKILL.md]
---

# Handoff — Build-Graph Fragmentation Campaign (memory, build time, chunk consolidation)

**Read first:** `.claude/skills/code-splitting/SKILL.md` (rule 3, "THE FRAGMENTATION LAW") — the doctrine this campaign produced. Nothing below overrides it. This doc also absorbed `docs/_current/bundle-optimization-tracker.md` (deleted 2026-07-28) — its still-open items live in Remaining work; its resolved/disproven claims are in Done and Gotchas.

## 0. ACTIVE — 2026-10-08 build-time regression (tracker; update every step)

**Truth:** Vercel main build ~5.5 min (Sep 20) → ~15–17 min (Oct 8). All the growth is the Turbopack compile phase (2.9 → 10.4 min) plus a bigger output to finalize and cache. All three Vercel projects grew in proportion, so the cause is shared code. Vercel load, the Next canary pin and route growth are measured OUT (compile vs concurrent builds r = −0.04 over 211 builds).

**Measured steps** (server chunks / output MB from the Vercel logs, the only stable metrics):
- Sep 25 13:32, b58a3f942 → 26f897b94: output 643 → 1,010 MB, chunks 6,077 → 6,609. Window = 521 commits + package bumps (print 0.5 → 0.8, content-ir 0.12 → 0.17, records, records-ui). **Not yet attributed.**
- Oct 7 22:58, dfc373972 → a00f27f43: output 1,350 → 2,615 MB, chunks 7,903 → 9,705. Cause: `@ai-matrx/icons` 0.3.5 switched to Lucide's `dynamicIconImports` (2,118 `import()` calls). **Fixed in aidream bfff9347d7** (one `import("lucide-react")` edge + guard test).
- Side cost: Vercel node_modules grows ~0.7 GB/day between cache resets (4 → 12 GB), so cache create/upload takes ~2.5 min. Suspected cause: pnpm keeps orphaned package versions for 7 days (`modules-cache-max-age`).

| # | Test | Status | Result |
|---|---|---|---|
| 1 | Local A/B: main as-is vs the icons fix dropped into node_modules (`lab:run`, chunks + output + RSS) | **done 2026-10-08** | efa490a55: compile 12.3 → 7.2 min, peak RSS 46.0 → 26.3 GB, wall 14.7 → 9.6 min, server chunks 10,195 → 8,425. Icons 0.3.37 published + adopted (lock). |
| 2 | Icons fix published → adopted → next Vercel build: chunks ≈ 7.9k, output ≈ 1.35 GB | **done 2026-10-08** | icons 0.3.37 live from v0.4.3052: main compile 2.8–5.0 min (was 9–14), chunks 7,245, output 1.39 GB (was 2.6), node_modules 3.5 GB (was 11.7), cache upload 0.88 GB (was 1.55). manage 1.6–2.7 min, demos 3.5 min. |
| 3 | Attribute the Sep 25 step: A/B the package bumps alone on the pre-step tree | todo | |
| 4 | Cache bloat: prune orphans at install → Vercel node_modules ≈ 4 GB, cache upload < 1 min | shipped, verify on Vercel | `.npmrc` `modules-cache-max-age=0`; local node_modules 32 → 8.7 GB. |
| 3b | print inlined MathJax (2.4 MB) into BOTH /document and /markdown-html (`splitting:false` flattens lazy imports) → own `/mathjax` entry | **done**: print 0.12.14 published + adopted; local C run compile 7.2 → 4.3 min (single run, RSS flat 26.4 GB) | /document 3.4 MB → 766 KB, /markdown-html 3.3 MB → 694 KB |
| 3c | Probe: stub the 3 context-menu lazy edges added Sep 26–Oct 5 (upper bound of their cost) | **done — leave them** | RSS −2.2 GB at most, compile within noise (7.3 min) |
| 6 | Static page generation 6 s (Sep 22) → 37–48 s | **done 2026-10-09** | cause: 192 `templates_public` reads (every prerendered template page re-read the paged catalogue). Shared process read + guard test. Vercel static gen 48 s → 8 s. |
| 7 | Generate workers 1 → 8 (generate process only first) | **done 2026-10-09** | tree peak 9.2 GB; page-data ~61 s → ~20 s |
| 8 | One `next build` pass with 8 workers instead of compile + generate processes | **live 2026-10-09 01:43** (first green 1-pass release, no memory problems) | lab whole-tree peak 32.8 GB of 60; Vercel post-compile ~2.4 → ~1.5 min |
| 9 | `@ai-matrx/chat` in `transpilePackages` | **done — leave it** | lab H: −0.9 GB RSS, no chunk change (noise) |
| 10 | THE TRACE LAW: server functions shipping source folders (admin layout 573 files × 275 functions; /data/try-everything 3,451; check-findings ~22,000 incl. migrations/docs/scripts) | **done 2026-10-09** (cfb8899f8) | build-time route tree + `appDir()`; check-findings reads pure JSON; guard `check-server-trace-scope` (post-build, self-tested) → 1,644 bundles clean. Lab build of main: compile 3.1 min, whole build 3m58s, RSS 25 GB |
| 11 | Do the generate workers slow compile? (A/B/A, cpus 8/1/8) | **done — no** | 4.7*/3.5/3.7 min (*high load); wall 316/263/256 s |
| 12 | Compile cost of the one lazy Lucide catalog chunk | **done — negligible** | same chunks, RSS 25.4 vs 25.6 GB |
| 13 | Turbopack persistent build cache | **measured, not shippable on Vercel's cache** | warm compile 71 s (vs 4-5 min), cold peak 39.2 GB, cache 6.7 GB + node_modules 3.4 GB vs 4.75 GB cap. Next lever if Arman wants it: keep the cache outside Vercel (download before, upload after) |
| 14 | 20-hour hold check (2026-10-09 02:00 → 22:40) | **holding** | main median 7.4 min (6.0–9.8, 22 green), manage 3.4, demos 6.3. 3 failures, none build-config: a missing export (other lane), a Next canary panic while printing an error (code-frame `─` char boundary), one transient. Chunk creep 7,245 → 7,772 = product growth (82 commits, 4 pages; 6 new lazy imports all single front doors) |
| 15 | Remaining levers, measured | **diminishing** | traced node_modules only 46 MB (output = compiled code); pre-build 16 s (kind-sandbox CSS 10 s: scans the whole app via globals.css, changes every commit, not cacheable); post-compile ~1.5 min is Next/Vercel internals. Only big lever: Turbopack persistent cache stored outside Vercel (warm compile 71 s) — est. net −1.5 min after ~2 min of cache transfer |
| 5 | Keep going: per-package `import()` census (only icons fanned out; coding-sessions' 2,543 files are an unimported standalone UI) + cross-entry duplication census: records 1.55 MB duplicated across its entries, associations 340 KB, meet 220 KB | records/associations next — measure before restructuring | |

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

- **A Vercel build-time jump is NOT proof of a tree regression — prove locality first** (code-splitting skill, Step 0): compile-phase line across bracket builds, the demos/admin control projects, and a local worktree A/B at the bracket commits. 2026-08-17: main 13.4→18.3 min compile in one day, local A/B 11.7 vs 11.0 (flat), demos +64% with none of the day's code in its surface — Vercel-infra slowdown, nothing in the tree.
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
- `2026-08-17` — claude: added the prove-locality-first gotcha + Step 0 in the code-splitting skill after the 13.4→18.3 min compile scare traced to Vercel infra, not the tree (local A/B flat, demos control project +64% with no new code).
- `2026-07-28` (later) — claude: shipped the wave in the Done block (previewers, canvas, batch-2 finish, admin provider, leaflet, JsonBlock, (dev) kit relocation, dead code); v0.4.192 measured flat at 12 min; remaining list re-ranked.
- `2026-07-28` — claude: took over; verified `/p/chat` hotfix live + 12-min green baseline; absorbed `docs/_current/bundle-optimization-tracker.md` (stale items re-verified against code, resolved items collapsed, tracker deleted).
- `2026-07-27` — claude: doc created at campaign handoff (batches 1–3 + hotfix shipped; backlog ranked).
