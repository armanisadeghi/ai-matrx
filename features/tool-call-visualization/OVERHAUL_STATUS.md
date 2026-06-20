# Tool Call Visualization — Overhaul Status & Roadmap

**Living tracker for the tool-viz overhaul. Delete when the overhaul lands.**
Last updated: 2026-06-19. Companion to `FEATURE.md` (architecture) + `KNOWN_DEFECTS.md` (D6).

---

## The canonical architecture (the target — zero legacy)

Two **paths** for rendering a tool result; **one clean system inside each**; **no versions, no shims, no duplicates**.

1. **Declarative (DB-stored data) — the primary path.** A tool's UI is a JSON config in the database (NOT code). One small interpreter per platform renders it natively. The same config renders on web / extension / desktop / mobile / vertical apps. Change a tool → update a row → all platforms update. The **only** safe path for user-defined + third-party tools, and the **only** path that supports per-user / per-org "preferred version" components.
2. **Hard-coded (in-repo React) — a thin escape hatch.** Only for a few core, highly-interactive tools that never change (e.g. Update Plan / Task). Accepted cost: each platform re-implements them, and a tool change touches every repo — so we keep this set tiny.

**Three views per tool** (live ≠ done ≠ overlay), where the full-screen overlay ALWAYS carries: raw I/O (for engineers) + the pretty view + extra visualizations. Big-data tools also get a **dedicated route**.

**The competitive rule:** we have zero legacy and zero reason to support it. The moment we keep a second/legacy system "just in case," we throw away our only advantage over Google/Microsoft. So: delete on cutover, never accrete.

---

## DONE (this session — committed, type-clean)

- [x] **Generic renderer rebuilt** — type-aware field library (`result-fields/`): shape detection → recursive `ResultValue` → table / key-value / markdown / media (durable via `InlineMediaRef`) / json / url-chips / scalar / **UUID shorten+copy** / empty / compact error. Carries ~97% of tool calls.
- [x] **Persisted = live (P0-1)** — `persistedToolEntry()`; reloaded turns render identically to live (real events + timestamps).
- [x] **Shell behavior** — done/persisted calls collapse to one line (only live-streaming auto-expands); no hover backdrop; calm errors (recessive label + compact card, detail behind the click); friendly collapsed subtitle from the registry.
- [x] **Overlay raw tab** — three verbatim JSONs (Tool / Input / Result) + dedicated Error section, via `JsonInspector`.
- [x] **CTX showcase** — `ctx_get` / `ctx_batch` / `ctx_patch` → note cards.
- [x] **SQL showcase** — `sql` / `db_query` / `db_schema` → intent line + result table + "Show SQL".
- [x] **Working-document live diff** — `ctx_patch` on the working doc → before→after diff, reconciles to server.
- [x] **Search/Research — TWO versions** (Revival + Modern), inline + overlay, side-by-side in the gallery for A/B.
- [x] **Dynamic Babel path — diagnosed broken** (KNOWN_DEFECTS D6) and cleaned up.
- [x] **Gallery test harness** — `/demos/tool-viz/result-fields`.

---

## PENDING — by track

### Track 1 — The canonical DECLARATIVE system (the centerpiece)
- [ ] **Define the declarative schema** (`ToolDisplayEntry`): per-field `PhaseAware` (started/done/error), path expressions (`args.key`, `output.rows.0.title`), named transforms, the field-component vocabulary (reuse the new `result-fields/` library as the render primitives).
- [ ] **Build the interpreter** that renders a config → UI using the field library (NO Babel, NO eval). This replaces the entire `dynamic/` compile system.
- [ ] **New DB shape** for `tool_ui`: store the JSON config, not TSX code. New columns / table; drop the code columns (`inline_code`, `overlay_code`, `utility_code`, `header_*_code`, `language`, `allowed_imports`).
- [ ] **Resolution**: static registry → declarative (DB config) → generic. (Drop the Babel fetch/compile branch entirely.)
- [ ] **Author one real declarative renderer end-to-end** + verify it renders in the gallery AND a real chat (proves the DB-driven path — the "both kinds" requirement).
- [ ] **Migrate the worthwhile existing dynamic renderers** (research / usertable / etc., recoverable from the old DB rows + git) to declarative configs.

### Track 2 — LEGACY & VERSION PURGE (delete, don't keep)
- [ ] **Delete the Babel dynamic-compile system** (`dynamic/compiler.ts`, `dynamic/allowed-imports.ts`, the Babel loader usage, `DynamicToolRenderer` fetch/compile, the v1 stub, incident-reporter for compile/runtime). It renders nothing today — pure liability. *Can start NOW; collapses resolution to [static → generic].*
- [ ] **Purge all `v1` / `v2` / `contract_version` references** — the `tool_ui.contract_version` column + check constraint, `ContractVersion` type, `makeV1Stub`, every "v2 contract" doc/code mention. One system, no version branching.
- [ ] **Delete the legacy re-export shim** `features/chat/.../stream/ToolCallVisualization.tsx` (P3-5); repoint imports.
- [ ] **Delete remaining dead v1 `tool_ui` rows** (P3-2) once declarative supersedes them. *(Demo rows already deleted.)*
- [ ] **Canonicalize duplicates** — the two `parseResearch.ts` → one shared parser (after the research pick); one `useToolTabs` for overlay + window panel (P2-2); one display-name resolver.
- [ ] **Repoint the AI generator** (`admin/tool-ui-generator-prompt.ts`) from TSX-authoring to declarative-config authoring.
- [ ] **Repurpose/retire** the `tool_ui_version` table + admin TSX editor (`ToolUiComponentEditor`) for the declarative model.
- [ ] **Audit `responseDensity`** (P3-4) — wire it or delete it (currently a no-op for the shell).

### Track 3 — Showcases & registration
- [ ] **Pick a research version** (Revival / Modern / graft) → register for `research_web` / `core_web_search_and_read` / `news_get_headlines`; handle the `🔍 Results for…` format from `core_web_search`.
- [ ] **News** (`news_get_headlines`) — confirm image-gallery view in the chosen version.
- [ ] **Interactive family** (deferred, hard-coded): `update_plan` / `tasks` — bespoke interactive UI.
- [ ] Sweep the **other high-volume tools** (`web`, `fs_*`, `memory`, `data`, browser tools) — most should be declarative configs, not code.

### Track 4 — The three-view model + shell completion
- [ ] **Dedicated full-route view** (3rd mode) — open a huge tool result as its own page (`/tools/[callId]` or similar), loading by id from Redux/DB.
- [ ] **Batch folding** (P2-7) — collapse a run of consecutive calls (e.g. several `ctx_get`s) into one expandable line; auto-collapse when the agent moves on.
- [ ] **Overlay header** (P1-4) — one canonical header honoring registry `getHeaderSubtitle` / `getHeaderExtras` (revive the gradient header + counts) across overlay + window.

### Track 5 — Customization & cross-platform (needs declarative first)
- [ ] **Per-user / per-org "preferred version" components** — override a tool's config at user/org level.
- [ ] **Safe user-facing builder** — pick fields against a captured fixture → declarative config (no code). Reuse `tool_test_sample` + `ToolRendererPreview`.
- [ ] **Cross-platform sharing** — the shared declarative schema consumed by extension / desktop / mobile / vertical apps; per-platform variant column only where genuinely needed.

### Track 6 — Skills (agent authoring)
- [ ] **Rewrite `create-tool-renderer` skill** — declarative-config first; hard-coded React as the rare escape hatch; point at the field library + fixture harness.
- [ ] **Cross-repo skill** mirroring matrx-extend's tool-display so one mental model spans repos.
- [ ] **Drift-guard test** (port from matrx-extend) so renamed tools don't silently fall back.

### Track 7 — Backend (aidream)
- [ ] **Continuous streaming** — keep emitting events through long tool calls (don't go silent); enables real-time progress instead of theater.
- [ ] **Emit + persist `tool_step` / `tool_progress`** for high-value tools (today only started/completed/error land) — powers data-driven progress + richer replay.
- [ ] **Stale-sample capture** (P2-9, low priority) — opportunistically save a tool's sample on next use when missing/stale; no extra confirm calls.

### Track 8 — Generic polish remaining
- [ ] **Semantic-token sweep of older surfaces** (P3-1) — window panel + any remaining hardcoded colors (`DynamicLoadingIndicator` still uses `slate-*`, etc. — dies with Track 2 anyway).
- [ ] **Accessibility** (P3-3) — ARIA/keyboard parity on the inline expand control.
- [ ] **Per-feature admin map** (P2-5) — `/tool-call-visualization/admin`.

### Track 9 — Verification (your testing + ongoing)
- [ ] Live end-to-end: CTX / SQL / research / working-doc diff in real chats.
- [ ] Replay parity in a reloaded conversation.
- [ ] Declarative renderer end-to-end (once built).
- [ ] Confirm whether the Babel hang is dev-only (`next build`) — academic once Track 2 deletes it.

---

## Recommended sequence
1. **Track 2 first move:** delete the broken Babel dynamic system now (removes the hang, the `v1/v2` cruft, the security surface, 5.7 MB). Resolution → [static → generic]. *Zero legacy, immediately.*
2. **Track 1:** build the declarative schema + interpreter as the dynamic path; one renderer end-to-end.
3. **Track 3:** register the research pick (canonicalize parser); migrate easy tools to declarative.
4. **Track 4:** dedicated route + batch folding.
5. **Track 5/6:** user/org customization, builder, skills.
6. **Track 7:** backend streaming + step events (parallel, cross-repo).
7. Finish the **purge** (Track 2) as each legacy piece is superseded — nothing left behind.
