# Tool Call Visualization — Overhaul Status & Roadmap

**Living tracker for the tool-viz overhaul. Delete when it lands.**
Last updated: 2026-06-20. Companion to `FEATURE.md` (architecture) + `KNOWN_DEFECTS.md`.

---

## The vision (corrected — code-first, built on the applet runtime)

Tool visualization = the rich, **live** UI that renders what an agent is doing (a note updating, tasks read, a working-document diff streaming in). The end goal is **users building Custom Apps inside our app** — running agent-written code is *the product*, not a risk to design around.

**The canonical foundation already exists: the Agent Apps applet runtime** (`aga_apps`, route `/p/[slug]`, live at `/p/ap-world-lesson`). It stores agent-written component code, runs it through the shared `compile-core` Babel sandbox with an allow-listed scope + error boundary, exposes a clean **`useAgentApp()` data-in/out contract**, and **streams live**. Tool visualization is built **on this runtime**, as a consumer with a tool-result data contract.

**The 90 / 10 rule:**
- **~90% of tools → dynamic, agent-written code loaded from the DB** and run through the shared runtime. The only path that scales to user-defined + third-party tools and to N platforms without editing N repos.
- **~10% core, highly-interactive tools → an in-code (in-repo) version is OK** — *as long as a user can load their own DB version via preferences.*

**Four render targets (one near-identical "inside"):** React-web · HTML/JS-embed (Shopify/WordPress) · React-Native/Expo · React+Vite+Tauri. Made convergent by: a plain-JS core, a platform-adapter/capability layer (web⇄desktop can plausibly collapse to one render + two shells), AI-assisted target transpilation (cheap when the wrapper contracts + data-in/out are identical), and a strong multi-layer safety wrapper. Stored as 4 variants (columns/tables) of the same component.

**Data-object rendering is the LAST-RESORT fallback** — only for customers who can't use React/Vite/Tauri/HTML.

**Security (now):** agent-authored code only · basic red-flag scan · sandbox auto-exec by a verification agent · AI review before "safe." Not a launch blocker; hardened pre-launch. Goal today = stop our *own* agent code from breaking the app/DB.

**The competitive rule:** zero legacy is our only edge over Google/Microsoft. Delete superseded systems on cutover — never accrete a second one.

---

## The code-runner landscape (from investigation 2026-06-20)

| System | DB table | Role | Verdict |
|---|---|---|---|
| **Agent Apps** | `aga_apps` (+ `aga_versions/executions/errors`) | Runs agent-written applets; shells + slots; `useAgentApp()` contract; streaming | ✅ **CANONICAL — build on this** |
| **`compile-core.ts`** | — | Shared Babel transform primitive (load/strip/transform) | ✅ **CANONICAL shared primitive** |
| **tool-viz `dynamic/`** | `tool_ui` | Separate, narrower tool-result code-runner w/ its OWN scope builder | ⛔ **DUPLICATE — consolidate into the runtime, then delete** |
| **Prompt Apps** | `prompt_apps` | Pre-agent-apps predecessor | ⛔ **DELETE — greenlit; 61/61 rows migrated to `aga_apps`** |
| **dynamic-react** | — (inline md/notes blocks) | Inline React code blocks; uses `compile-core` + tool-viz scope | ✅ Active consumer (fold into the unified scope) |
| **code-editor `unused/`** | — | Abandoned editors | ⛔ Dead (2025-11) — delete |
| **`skl_render_*`** | `skl_render_definitions/components` | Template (not JS) render blocks — and the **only** place with a `platform` column today | ℹ️ Reference for the multi-platform pattern |

Duplication to kill: **two scope builders** (`agent-apps/utils/allowed-imports.ts` vs `tool-call-visualization/dynamic/allowed-imports.ts`) and **two runtime wrappers** for the same Babel core.

---

## DONE (committed, type-clean)

- [x] **Generic renderer** — type-aware field library (`result-fields/`): shape → recursive `ResultValue` → table / key-value / markdown / durable media / json / url-chips / scalar / UUID-shorten+copy / empty / compact error. (~97% of calls.)
- [x] **Persisted = live (P0-1)**, shell collapse-on-done, no hover backdrop, calm errors, raw tab = 3 verbatim JSONs + Error via `JsonInspector`.
- [x] **In-code showcases:** CTX (`ctx_get/batch/patch`), SQL (`sql/db_query/db_schema`), working-document live diff.
- [x] **Search/Research — TWO versions** (Revival + Modern), inline + overlay, A/B in the gallery.
- [x] **Gallery harness** `/demos/tool-viz/result-fields`.
- [x] **Investigation:** mapped the applet runtime as the canonical code-runner; identified the duplicate/legacy runners.
- [x] **Canonical DB-driven renderer SHIPPED** (parallel session): `db-renderer/` on the agent-apps `compile-slot` (sync Babel) — resolution is now `static registry → DB renderer → generic`; the old async `dynamic/` hang is bypassed; verified end-to-end (`agent_call` row renders, no hang). **Track 1 essentially done** — remaining = delete the old `dynamic/` (Track 2).
- [x] **Shell visual = Claude-Code style** — collapsed tool calls read as part of the response: no bg/border (incl. hover), chevron follows the text, body font (`text-sm`) + dimmer, `mb-2` paragraph spacing; expanded = thin-border + transparent box BELOW the chevron line with a 500ms grid-rows animation; body mounts only once ever-opened.
- [x] **3-layer collapse/display system** — default `"auto"` (expand-while-streaming → auto-collapse 3s after done) → registry `displayMode` (`stay-open`/`never-open`) → user pref (`selectToolDisplayPreference`: verbose/minimal, stubbed). `getToolDisplayMode` + `ToolRenderer.displayMode`.
- [x] **Realistic stream simulator** (`simulator/`) — replays only the parts that truly stream (whole query sections over time, no char-trickle) into an evolving `ToolLifecycleEntry`; gallery Play/Replay feeds both research versions + a live shell instance. Verified: q1→q2→q3 stagger; shell auto-collapses after done.
- [x] **Applet runtime verified in local dev** — `/p/ap-world-lesson` (fully_custom Babel applet) renders; the canonical runtime works dev + prod.
- [x] **Batch folding** — a run of ≥2 consecutive tool calls folds into one `ToolCallBatch` line (lightweight toggle → full normal cards flat below, no deforming nest); `EnhancedChatMarkdown` groups slots/segments; `InlineToolBatch`/`DbToolBatch` reuse the single-tool cards. Verified live (persisted; live-stream path unverified).
- [x] **Transcript "giant gaps" fix** (higher-level, not tool-viz code) — `AgentConversationDisplay` filters `tool`/`system` rows from `displayEntries` so an agentic turn (interleaved `assistant → tool → assistant`) stays ONE `AssistantTurnGroup` instead of fragmenting into stacked gapped groups. See `features/agents/components/chat/FEATURE.md`.
- [x] **FOUR DB-loaded renderer examples** (`migrations/tool_ui_db_renderer_examples.sql`, contract_version 2, surface `matrx-default/default`) — agent-authored code in `tool_ui`, NONE in the codebase, compiled at runtime via `compileSlotComponent`: `fs_list` (folder/file list), `shell_execute` (terminal), `memory` (sparse status + importance bar), `travel_get_weather` (rich weather card). The reference set proving "most renderers load from the DB." **Verified live:** `memory` in a real chat (`2e287645`) and all four in the gallery (`/demos/tool-viz/result-fields` → "DB-loaded renderers"). Seed is idempotent (ON CONFLICT) + ledger-recorded.

---

## PENDING — by track

### Track 1 — Build tool-viz on the canonical applet runtime (the centerpiece)
- [ ] **Unify the code-runner**: ONE shared runtime = `compile-core` (Babel) + ONE allow-listed scope + ONE sandbox wrapper + error boundary + safety layers. Consumed by agent-apps, tool-viz, and inline blocks — each with its own thin data contract.
- [ ] **Tool-result data contract** on the runtime: a tool renderer is agent-written code that receives `(entry, events)` (in) and renders (no submit-back needed for display) — the tool-viz analog of `useAgentApp()`.
- [x] **Tool renderers stored as agent-written code in the DB**, run through the unified runtime. Resolution is live: `static registry → DB renderer (db-renderer/) → generic`. Five DB renderers now exist (`agent_call` + the four examples).
- [x] **Author one real DB tool renderer end-to-end** + verify in gallery AND a real chat. Done four (`fs_list`/`shell_execute`/`memory`/`travel_get_weather`); the old `tool_ui` hang is bypassed (sync compiler).
- [x] **Confirm the runtime renders in our local dev** — the four DB renderers + `/p/ap-world-lesson` all compile + render in local Turbopack dev. No dev-only hang.

### Track 2 — Legacy & duplicate PURGE (delete, don't keep)
- [ ] **Delete Prompt Apps** (`features/prompt-apps/`, routes, `prompt_apps` usage) — greenlit, fully migrated.
- [ ] **Delete tool-viz `dynamic/` separate compiler + its `allowed-imports.ts`** once Track 1's unified runtime serves tool results.
- [ ] **Purge `v1`/`v2`/`contract_version`** everywhere (`tool_ui.contract_version`, `ContractVersion`, `makeV1Stub`, all "v2 contract" mentions). One system, no version branching.
- [ ] **Collapse duplicate scope builders** → one shared allow-list/scope.
- [ ] **Delete dead** `features/code-editor/components/unused/*`; the legacy re-export shim `features/chat/.../stream/ToolCallVisualization.tsx`; stale `tool_ui` rows.
- [ ] **Canonicalize** the two `parseResearch.ts` → one (after the research pick); one `useToolTabs`; one display-name resolver.
- [ ] **Repoint the AI generator** + admin editor to author against the unified runtime.

### Track 3 — Four-platform model (greenfield)
- [ ] **Schema for 4 variants** per component (web / html-embed / RN-Expo / Vite-Tauri) — columns or related table; pattern off `skl_render_components.platform`.
- [ ] **The convergence wrapper**: shared plain-JS core + per-target platform-adapter/capability layer + identical data-in/out contract, so the four sources stay near-identical (AI-transpilable).
- [ ] **Web⇄Desktop collapse** (Tauri): SPA/SSG, native behind one capability layer, `window.__TAURI__` feature-gates → one render target, two shells.
- [ ] **HTML/JS embed wrapper**: hosted bundle + mount point; WordPress shortcode/Gutenberg block; Shopify Theme App Extension; iframe optional. One component, thin per-host wrapper.
- [ ] **Data-object fallback** generator (last resort) for non-supported stacks.

### Track 4 — In-code showcases (the 10%) + preference override
- [ ] **Per-user / per-org "preferred version"** — let a user load their own DB renderer in place of the in-code one (the rule that keeps the 10% honest).
- [ ] **Register the research pick** (Revival / Modern / graft) + handle the `🔍 Results for…` `core_web_search` format.
- [ ] **Interactive family** (`update_plan` / `tasks`) — bespoke in-code UI.

### Track 5 — Three-view model + shell completion
- [ ] **Dedicated full-route view** (3rd mode) for huge results — open a tool result as its own page.
- [x] **Batch folding** — DONE (see DONE section): `ToolCallBatch` folds a run of consecutive calls into one expandable line.
- [ ] **Canonical overlay header** honoring registry `getHeaderSubtitle`/`getHeaderExtras` across overlay + window.

### Track 6 — Authoring (agents + users)
- [ ] **Rewrite `create-tool-renderer` skill** — author DB code through the unified runtime; in-code only as the rare escape hatch.
- [ ] **Safe user-facing builder** (capture fixture → renderer) reusing `tool_test_sample` + `ToolRendererPreview`.
- [ ] **Drift-guard test** (port from matrx-extend).

### Track 7 — Backend (aidream)
- [ ] **Continuous streaming** through long tool calls (stop going silent).
- [ ] **Emit + persist `tool_step`/`tool_progress`** (today only started/completed/error land).
- [ ] **Stale-sample capture** (low priority).

### Track 8 — Generic polish
- [ ] Semantic-token sweep of remaining surfaces (window panel etc.); a11y on the inline expand control; `/tool-call-visualization/admin` map; resolve `responseDensity` no-op.

### Track 9 — Verification (your testing + ongoing)
- [ ] Live: CTX / SQL / research / working-doc diff in real chats; replay parity on reload; the DB code-runner end-to-end; the applet runtime in local dev.

---

## Recommended sequence
1. **Track 1 + 2 together:** stand up the unified runtime for tool results (on the proven applet foundation), render one DB tool end-to-end, then delete the duplicate tool-viz compiler + Prompt Apps + the `v1/v2` cruft. *One canonical code-runner, zero legacy left behind.*
2. **Track 4:** register the research pick; add the per-user/org preference override.
3. **Track 5:** dedicated route + batch folding.
4. **Track 3:** the four-platform model + convergence wrapper (the big multiplier).
5. **Track 6:** authoring skill + user builder. **Track 7:** backend streaming (parallel). **Track 8:** polish.
