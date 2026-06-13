# Mermaid Render Block — Handoff & Honest Status

**Date:** 2026-06-12 (updated 2026-06-13) · **Author:** claude · **Status:** Live on web (pushed) and **user-confirmed working**; remaining gaps documented below.

> **2026-06-13 update — confirmed live by the user.** Diagrams render and edit in chat. Two additions shipped after first review: (a) **18 content blocks** in a new **"Diagrams"** context-menu category — one per diagram type (human labels) + 4 combos + the general "Any Diagram (all types)" — applied + live-verified (closes §7.2's operational turn-on); (b) a **fullscreen** view from the block header (Expand → full-viewport overlay, Esc to exit), browser-verified. The replication skill (§ below) is now being written, per the original plan to document the process after live confirmation.

This is the paving build for the render-block skill system. It is **done for web** and **pushed to both repos** (frontend `4546c7e1a` on `origin/main`; aidream mermaid pipeline already on `origin/main`). Read this before testing live or extending — it is deliberately honest about what is **proven** vs **wired-but-unproven**, and where it falls short of the original vision.

> **Do NOT write the "add a render block" replication skill yet.** Per the user: that gets written *after* live confirmation. This handoff is the raw material for it.

---

## 1. What shipped (web)

- **Block type `mermaid`** from ` ```mermaid ` / ` ```mmd ` fences — detected **client + server**, rendered live during streaming with a **forgiving auto-fix sanitizer** (recovers reserved-word `end`, unquoted-paren labels, bare `->` arrows, `//`/`#` comments, smart quotes, HTML-escaped arrows — and **screams** `[MermaidSanitize] RECOVERED …` on every fix).
- **Reusable core** `components/mermaid/`: dynamic-import singleton runtime (mermaid v11 + ELK, never in the initial bundle), last-good-render, pan/zoom viewport, per-type catalog, export (SVG / PNG / `.mmd` / save-to-files).
- **Artifact lifecycle**: materializes to `canvas_items` (`type:"mermaid"`, `content.metadata.diagramType/title`); chat refs resolve `"latest"` and live-refresh on edit; public-share path wired.
- **MermaidWorkbench** (canvas): three views of one diagram — **Diagram** (tap-to-edit), **Outline** (structured rows), **Code** (CodeMirror) — gated by a per-adapter **round-trip fidelity check** so structural editing can never silently destroy content (downgrades to code-only instead). Session-versioned saves via `cx_canvas_save_user_version`.
- **Agent editing**: `matrx-user/mermaid-editor` surface + "Edit with AI" rail (`useMermaidAgentEdit`, a faithful clone of cleanup's proven `useAiPostProcess`).
- **Platform skill** `mermaid-diagrams` + **content block** `mermaid-diagram` seeded (migration applied + live-verified).

---

## 2. Verified — with real proof (not mock)

| Area | How it was proven |
|---|---|
| Renderer, all diagram types | Browser screenshots: 9 diagrams (flowchart, mind map, sequence, pie, timeline, state, ER, gantt) rendered with correct node/edge counts at `/demos/mermaid`. |
| Forgiving sanitizer | Browser: the broken sample (`A[Validate (strict) mode] -> B{ok?}`, reserved `end`, `//` comment) rendered **clean** with **0 error cards** and logged `RECOVERED … via 4 fix(es): fix-comment-syntax → fix-arrow-typos → quote-unsafe-labels → fix-reserved-end`. This test caught + fixed a real regex bug. |
| Adapters (round-trip + ops) | 23 unit tests — `serialize(parse(s)) ≡ s` and op correctness for flowchart/mindmap/sequence/pie/timeline. |
| Forgiving ladder | 4 unit tests (recover broken sample, leave valid untouched, Stage-A lossless, streaming stays quiet). **27/27 total green.** |
| Server pipeline | Local smoke test: stream processor emits typed `mermaid` blocks (complete + token-by-token), `content == data.source` (lossless), mid-stream raw DSL present, zero integrity-check errors. |
| Migration | 8/8 live-DB row checks (ui_surface, skl_*, content_blocks, RPC present **and runs**). `ui_surface_value` ×14 + role synced. |
| Static quality | `0` mermaid errors in `tsc` and `eslint`. |

---

## 3. Wired + typechecked + unit-tested, but NOT live-verified end-to-end

These code paths exist, compile, lint clean, and their parts are unit-tested — but the **full browser round-trip** was not executed this session (the dev server's Turbopack HMR kept corrupting after many rapid edits — see §6). **These are the user's "test live" list.**

1. **Chat → materialize → canvas → workbench → save version → chat ref shows v2.** The full artifact lifecycle in a real `/chat`. Each step is wired; the chained flow wasn't run.
   - *Repro:* in `/chat`, get an agent to emit a ` ```mermaid ` flowchart → confirm it renders inline, then a `canvas_items` row appears (`type='mermaid'`); refresh → it loads by id; click **Edit** → workbench opens; edit a node → "Saved" + `v2`; the chat block reflects v2.
2. **Agent edit round-trip** (workbench "Edit with AI"): instruction → agent streams → ` ```mermaid ` fence extracted → live preview → Apply → saved as new version.
   - *Repro:* open a mermaid in canvas → AI panel → pick an agent → "make the happy path green" → watch the preview build → Apply → confirm new version.
   - *Risk note:* the hook clones `useAiPostProcess` 1:1, but **no agent is bound to the mermaid surface yet** (see §4.2), so it currently relies on the name-heuristic + user-input fallback. Bind/seed an agent to exercise the binding path.
3. **Skill body injection** into a live agent's system prompt (`skill_config.included` → aidream `skill_merge.apply_unified_skills`). Row exists (6182 chars); injection path confirmed by exploration, not run live.
4. **Public share** of a mermaid canvas item (logged-out render via `StandaloneMermaidView`).
5. **Save-to-workspace** (fileHandler blob upload → "Diagrams" folder, SVG + `.mmd`).
6. **`<artifact type="mermaid">` wrapped path** — only the bare fence was browser-verified.
7. **Mobile** (390px) — designed for it (drawers, bottom sheets, single scroll, 44pt targets), not viewport-tested.

---

## 4. Gaps vs. the original vision (not exactly as asked)

### 4.1 Chat right-click does NOT surface mermaid-scoped agents (the biggest gap)
**Asked:** right-click a render block in chat → it gets "its own customized set of agents" scoped to that artifact, the agent modifies it, result comes back into the artifact.
**Built:** right-click passes the diagram **DSL** as context (`data-block-source` → `diagram_source`) to whatever agent the user picks, but the chat menu lists **assistant-message-surface** agents, not mermaid-scoped ones. The scoped agents + the "comes back into the artifact" round-trip live in the **workbench rail** (reached via the block's **Edit** button), modeled on Scribe.
**Why:** `MarkdownContextMenuProvider` is one instance per conversation with a single `surfaceName`; per-block-type surface switching doesn't exist. Building it is the documented v2 (a dynamic-contexts extension of `useUnifiedAgentContextMenu`). Tracked: `KNOWN_DEFECTS.md` D5 #3.
**Net:** the *capability* (agent edits a diagram and it comes back) is fully there — via the workbench, not the chat right-click. The chat right-click is a data hand-off + "Edit" entry point.

### 4.2 No curated / seeded "Diagram Editor" agent
**Asked:** "custom agents scoped specifically to this artifact and this render block style."
**Built:** the surface, a `diagram_editor` agent **role** (in the manifest, `defaultAgentId: null`), and a rail that accepts **any** agent (heuristics make any agent work). **Missing:** a seeded system agent bound to `matrx-user/mermaid-editor` with the mermaid skill, and a rail picker filtered to surface-bound agents. Recipe in §7.1. *(Not auto-done: seeding a user-facing system agent is your call per "ask before creating," and it should be live-tested before shipping to prod.)*

### 4.3 The skill + content block are seeded but not attached to any agent
They **exist and are available**, but no agent has the skill in `skill_config.included` or the content block in its instructions — so **out of the box no agent proactively emits mermaid** (though any agent's incidental ` ```mermaid ` fence now renders). This is by design (opt-in per agent) but is the operational "last mile." Turn-on steps in §7.2.

---

## 5. Weaknesses / technical debt

1. **Visual mode is coupled to mermaid's SVG DOM shape** (`components/mermaid/visual/svg-id-map.ts`: `flowchart-<id>-N`, `L_<from>_<to>_N`). A mermaid major bump could change these. Mitigated by a runtime self-check that **gracefully disables** visual affordances (outline + code still work), but a silent degrade is possible. Re-check `svg-id-map.ts` on any mermaid upgrade.
2. **Structural editing covers 5 of ~20 diagram types** (flowchart/mindmap/sequence/pie/timeline). The rest are render + code + AI only. By design (one backbone), but the visual/outline promise is partial — each new type is an additive adapter.
3. **Fidelity gate is all-or-nothing per document** — one unrecognized-but-plausible line downgrades the *whole* diagram to code-only. Safe (never destroys content) but blunt. A granular "edit what we understand, lock the rest" model is a bigger future effort.
4. **The sanitizer is a heuristic ladder, not a parser** — it fixes the common LLM mistakes; novel breakage still shows the (contained) error card. Expect to add fixers as new failure modes surface in production.
5. **CodeMirror uses `theme="none"`** — no explicit dark theme on the code editor; may look flat in dark mode. Minor polish (`components/mermaid/code/CodeModePane.tsx`).
6. **No recovery telemetry** — `scream()` logs to console only. Aggregating which fixes fire most would tell us which backend-prompt rules to tighten.
7. **Generated types committed broadly** — the commit included regenerated `types/database.types.ts` + `types/python-generated/stream-events.ts` (full live-DB / backend schema, not just mermaid). Harmless (generated, source-of-truth) but worth knowing.

---

## 6. Dev-environment gotcha (cost real time here)
After **many rapid edits**, Turbopack HMR corrupts with `module factory is not available` and renders stick on skeletons **app-wide** — a browser reload does **not** fix it; **restart the dev server**. (This is in user memory `feedback_turbopack_hmr_restart`.) First import of the ~2MB mermaid chunk also takes ~15-30s to compile in dev — skeletons during that window are normal, not a bug.

---

## 7. How to turn it on / improvement recipes (prioritized)

### 7.1 (High) Seed a "Diagram Editor" agent bound to the surface
Make the "Edit with AI" rail useful out of the box and realize "agents scoped to this artifact":
1. Create/choose a system agent; give it `skill_config.included = [<mermaid-diagrams skill id>]` (or put the content block in its instructions).
2. Add an `agx_agent_surface` binding for `(agent, 'matrx-user/mermaid-editor')` mapping `diagram_source` → the agent's diagram variable (or rely on auto-name-match).
3. Set it as the manifest role's `defaultAgentId` in `features/surfaces/manifests/mermaid-editor.manifest.ts` and re-sync surfaces.
4. **Then** filter `AgentEditRail`'s picker to surface-bound agents (currently shows all — correct until an agent is bound).
Live-test the round-trip (§3.2) before prod.

### 7.2 (High) Attach mermaid to your main chat agent(s)
So agents actually produce diagrams: in the agent's context menu, add the **"Mermaid Diagrams"** content block to its instructions, **or** include the `mermaid-diagrams` skill in the agent (skills UI / `skill_config.included`). Verify the skill body lands in the system prompt (aidream debug / first turn).

### 7.3 (Medium) Build the chat-block per-type agent menu (§4.1's v2)
Extend `useUnifiedAgentContextMenu` so a right-clicked block resolves its **own** surface/agents dynamically (the diagram already flows as `diagram_source`). This fully realizes the original vision: right-click a mermaid block → mermaid agents → result back into the artifact.

### 7.4 (Medium) More adapters — state, ER, gantt, class — to widen visual/outline coverage. Each is one file under `components/mermaid/adapters/` + a registry line; the round-trip test harness (`components/mermaid/__tests__/adapters.test.ts`) is the template.

### 7.5 (Low) CodeMirror dark theme; PNG export scale/background options; sanitizer recovery telemetry; granular fidelity.

---

## 8. File map (for the next agent)

- **Core (reusable):** `components/mermaid/` — `runtime.ts` (only mermaid importer), `sanitize.ts` (forgiving ladder), `diagram-type.ts`, `catalog.ts`, `MermaidRenderer.tsx`, `MermaidViewport.tsx`, `MermaidView.tsx`, `export.ts`, `extract-fence.ts`.
- **Editor:** `components/mermaid/model/` (doc types, ops, adapter contract, `round-trip.ts` fidelity gate), `adapters/` (flowchart/mindmap/sequence/pie/timeline + `register.ts`), `workbench/` (MermaidWorkbench, useMermaidEditor, useMermaidArtifactSave, editor-bridge, AgentEditRail, NewDiagramMenu), `visual/`, `outline/`, `code/`, `hooks/useMermaidAgentEdit.ts`.
- **Chat block:** `components/mardown-display/blocks/mermaid/MermaidBlock.tsx`; detection in `…/markdown-classification/processors/utils/content-splitter-v2.ts` (`SPECIAL_CODE_LANGUAGES` + `CODE_LANGUAGE_ALIASES`) + `features/agents/redux/execution-system/utils/stream-block-accumulator.ts` (live fence promotion); registry in `…/block-registry/BlockComponentRegistry.tsx` + `BlockRenderer.tsx`; round-trip in `…/utils/assemble-cx-content-blocks.ts`.
- **Artifact/canvas:** `features/canvas/materialization/*` (materializable-types, reconcileArtifacts marker, planMaterialization metadata), `features/canvas/core/CanvasBody.tsx`, `canvas-block-meta.ts`, `shared/PublicCanvasRenderer.tsx`, `services/canvasArtifactService.ts` (saveUserVersion/createManual), `hooks/useCanvasItem.ts` (`resolve:"latest"` + `CANVAS_ITEM_UPDATED_EVENT`).
- **Surface / context menu:** `features/surfaces/manifests/mermaid-editor.manifest.ts` (+ registry), `features/context-menu-v2/markdown/{resolveMarkdownContext,MarkdownContextMenuProvider}.tsx`, `…/internal-handlers/SafeBlockRenderer.tsx`.
- **Server (aidream):** `packages/matrx-ai/matrx_ai/processing/blocks/models/mermaid.py`, `parsers/mermaid_parser.py`, `models/base.py` (enum), `block_detector.py` (SPECIAL_CODE_LANGUAGES + alias), `stream_processor.py` (classification + parser map), `packages/matrx-connect/.../render_blocks.py` (registry).
- **Migration / docs:** `migrations/mermaid_render_block_platform.sql`, `features/artifacts/FEATURE.md`, `…/block-registry/ADDING_BLOCKS.md` (mermaid = the Flavor-F worked example), `KNOWN_DEFECTS.md` D5, `app/(dev)/demos/mermaid/page.dev.tsx`.

---

## 9. Bottom line
Web is **done and live**. The diagram *capability* — render, forgiving recovery, materialize, three-mode edit, version, share, agent-edit-and-return — is built, statically clean, and unit-tested, with the renderer + sanitizer **proven in the browser**. What remains is (a) **live e2e confirmation** of the chained flows (§3), (b) the **operational turn-on** — attaching the skill and seeding a diagram agent (§7.1–7.2), and (c) the **v2 chat-scoped agent menu** (§4.1). None block the feature; all have recipes above.
