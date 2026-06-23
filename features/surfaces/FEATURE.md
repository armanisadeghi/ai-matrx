# Tool Registry · UI Surfaces (v2)

**Status**: shipped
**Owner**: tool-registry
**Routes**: `/admin/surfaces`

## What this is

The dedicated admin UI for the `ui_surface` table. Built to scale to the
~100+ surfaces this system has (vs. the typical 1–2 most apps need), with
grouping, bulk operations, usage stats, and inline editing.

The simpler per-row CRUD on `/admin/lookups` (UI Surfaces tab) still exists
and is fine for one-off edits, but a callout banner there directs admins to
the v2 page for serious management.

## Why a dedicated page

The original `UiSurfaceCrud` (under `/admin/lookups`) is a flat table. With
~100 surfaces across 4 clients, that becomes unusable:

- No grouping → an admin can't tell which surfaces are "pages" vs "overlays"
  vs "debug" without reading every row.
- No bulk ops → activating an entire tier of debug overlays would take 10
  individual clicks.
- No usage info → an admin can't tell which surfaces actually have tools or
  agents pointing at them, so dead surfaces accumulate silently.
- No inline edit → changing a description means opening a modal per row.

The v2 page solves all four.

## Architecture

- **Service**: [features/surfaces/services/surfaces.service.ts](./services/surfaces.service.ts)
  - `listSurfacesWithStats()` — single round-trip that fans out 3 reads
    (`ui_surface` + `tl_def_surface` + `agx_agent_surface`) and joins counts
    in JS. Cheaper than three separate sequential queries; cheaper than a
    server-side RPC for a table that admins read at most a few times per session.
  - `bulkSetSurfacesActive(names, active)` — one `UPDATE ... WHERE name IN (...)`.
  - `tierFor(sortOrder)` + `SURFACE_TIERS` — convention-driven grouping (see
    "Sort_order tiers" below).
- **Component**: [features/surfaces/components/SurfacesAdminPage.tsx](./components/SurfacesAdminPage.tsx)
  - Client tabs (matrx-admin / matrx-user / matrx-public / chrome-extension /
    All) drive the primary filter.
  - Status filter (active / inactive / all) and free-text search refine.
  - Body groups by tier (Pages, Specialized, Overlays, Editor variants, Debug).
  - Per-row controls: select checkbox, inline description edit (click to
    expand), tool-count badge, agent-count badge, active toggle, delete with
    FK-cascade-aware confirm.
  - Bulk control bar appears when ≥1 row is selected: activate / deactivate /
    clear selection.
  - "New surface" dialog with client picker, local-name input (validates
    `^[a-z0-9-/]+$` so multi-segment names like `debug/state-analyzer` are
    allowed), tier picker (auto-assigns sort_order = tier.min + 50), and
    description.

## Sort_order tiers (convention)

There's no `kind` or `category` column on `ui_surface`. Tiering is done via
`sort_order` ranges, and the UI groups + labels each band:

| Sort range | Tier label      | What goes here |
|---|---|---|
| 0–99       | Reserved        | (intentionally empty — reserved for future / pinned items) |
| 100–299    | Pages           | Top-level routes / primary destinations |
| 300–999    | Specialized     | Power-user surfaces, secondary tools |
| 1000–1999  | Overlays        | Modals, sheets, popout windows |
| 2000–8999  | Editor variants | Editor and authoring surfaces |
| 9000+      | Debug           | Admin-only debugging overlays |

The "New surface" dialog uses the tier picker to assign `sort_order = tier.min + 50`,
so new surfaces land in the middle of their band and don't collide with seeded rows.

## Seed (current production state)

After migration `seed_matrx_frontend_surfaces_expanded` (2026-05-05):

| Client | Active | Total |
|---|---|---|
| `matrx-user` | 46 | 59 |
| `matrx-admin` | 18 | 33 |
| `matrx-public` | 5 | 8 |
| `chrome-extension` | 2 | 2 |
| **Total** | **71** | **102** |

The inactive 31 are placeholders for emerging surfaces (beta UIs, debug
overlays not yet wired, etc.) — they're seeded so tools/agents can opt-in
to gating against them without admin work, but not activated by default.

## Conventions baked in

- `confirm()` from `@/components/dialogs/confirm/ConfirmDialogHost` for
  destructive actions.
- No barrel files; direct imports.
- No `useMemo` / `useCallback` / `React.memo` (per CLAUDE.md, React Compiler
  handles memoization).
- Bulk delete is intentionally NOT supported — single-row delete with
  cascade-warn is enough; bulk delete is a footgun for FK-target tables.
- Hard delete is allowed (no `is_active=false` "soft delete" alternative
  needed since `is_active` already exists). The confirm message warns when
  the surface has tool or agent references.

## v2.1 — full enrichment (2026-05-05 second pass)

After the user-requested "go all in" pass, the page picks up:

- **Per-surface detail drawer** ([SurfaceDetailDrawer.tsx](./components/SurfaceDetailDrawer.tsx)) opens on row name click or chevron. Shows:
  - Identity edit (active toggle, description edit, **rename**)
  - "Tools on this surface" — joined `tl_def_surface ⋈ tl_def`, click-through to the tool admin
  - "Agents visible here" — joined `agx_agent_surface ⋈ agx_agent`
  - "Custom tool UI components" — `tl_ui` rows scoped to this surface
- **Rename support** with FK cascade. Backend migration `ui_surface_fk_cascade_on_update` adds `ON UPDATE CASCADE` to the three FKs (`tl_def_surface.surface_name`, `agx_agent_surface.surface_name`, `tl_ui.surface_name`), so renames are a single atomic UPDATE that auto-propagates to all dependent rows.
- **Bulk delete** in the bulk action bar. The confirm aggregates tool/agent reference counts across all selected rows and warns explicitly that DELETE is non-cascading (FK behavior on delete is `NO ACTION`).
- **"Add from candidates" dialog** ([SurfaceCandidatesDialog.tsx](./components/SurfaceCandidatesDialog.tsx)) — a curated catalog ([data/surface-candidates.ts](./data/surface-candidates.ts)) of ~70 plausible-but-unseeded surfaces (window-panel overlays, second-tier admin pages, agent embedding widgets, etc.) discovered via codebase inventory. Filter by client / kind / search, multi-select, optionally force-active on insert, bulk insert in a single round-trip.
- **"New client" dialog** inline (NewClientDialog at the bottom of the page file). Avoids round-tripping to `/admin/lookups` to add a `ui_client`.
- **Keyboard shortcuts**: `/` focuses the search input; `Esc` closes the open drawer / dialog / clears selection (in that priority order).
- The candidate-count badge on the "Candidates" button shows how many catalog rows aren't yet seeded — naturally trends to 0 over time.

## Change Log

- **2026-06-23** — Registered **two** conversation-document surfaces: `matrx-user/working-document` (cloud agent reads + writes) and `matrx-user/scratchpad` (cloud agent reads only; surface agents edit). They **share one value set + scope helper** (`manifests/_conversation-document.manifest.ts`, 14 values + 5 baselines) but stay separate because their bound agents differ — the canonical "same shape, different purpose → two surfaces" case. Manifests `working-document.manifest.ts` / `scratchpad.manifest.ts`; `ui_surface` + 19 `ui_surface_value` rows each, synced direct-SQL + verified live. Scope emitted at trigger time by `useWorkingDocumentSurfaceScope` and wired into the editor's `UnifiedAgentContextMenu` in `WorkingDocumentEditor` (mirrors the canonical `/notes` mount; the document's PARTS are the context, the conversation enters as `conversation_id` + `conversation_context`). New `working-document` / `scratchpad` literals in `SourceFeature`. **The surface-recursion model this exercises — a context item becoming its own surface — is documented in `.cursor/skills/surface-authoring/SKILL.md` → "What a surface is".**
- **2026-06-23** — `matrx-user/agent-builder` manifest expanded with focused-variable values for the Edit Variable modal: `variable_name`, `variable_help_text`, `variable_default_value`, `variable_required`, `variable_custom_component`, `variable_binding`, and `variable_json`. The Help Text `ProTextarea` emits these alongside the live full-agent scope so bound agents can operate on the exact variable being edited.
- **2026-06-22** — Fixed context-menu launch scope: `buildApplicationScopeFromMenuContext` no longer lets `undefined` keys from stale `contextData` clobber live captured `selection`/`text_before`/`text_after`; falls back `selection` ← `active_text` when nothing is highlighted (notes convention). `UnifiedAgentContextMenu` accepts optional `getApplicationScope` (same contract as ProTextarea) for live ref-based scope at launch.
- **2026-06-23** — Context menu **Bound Agents** submenu: when `UnifiedAgentContextMenu` receives `surfaceName`, it queries `agx_agent_surface` (RLS-filtered) and lists agents grouped as My agents / System / Shared with me / per-org. Launches via `useAgentLauncher().launchAgent` with `runtime.surfaceName` so binding value mappings resolve. **`ProTextarea`** now accepts the same `surfaceName` + `getApplicationScope` props — its "…" menu shows an identical grouped bound-agents section and runs via `useAiPostProcess` with the host surface's bindings. Service: `features/surfaces/services/surface-bound-agents.service.ts`; hook: `features/surfaces/hooks/useSurfaceBoundAgents.ts`.
- **2026-06-22** — Agent surfaces admin (`/agents/[id]/surfaces`, `SurfacesListColumn`): added set-up / not-set-up counts (surfaces with `ui_surface_value` rows via `surfaceValueCount`) and a second filter pill row; composes with the existing bound / unbound filter.
- **2026-06-22** — Registered `matrx-user/rag-search` (the `/rag/search` Search Lab's Agent Chat tab). 11 values: baseline `selection`/`content`/`context` + retrieval scope (`query`, `data_store_id`, `data_store_name`, `source_kinds`, `admin_bypass_acl`, `rerank`, `multi_query`, `use_hyde`). Manifest `rag-search.manifest.ts` + `createRagSearchScope`; `ui_surface` + `ui_surface_value` rows seeded. The Agent Chat tab launches the canonical agent via `useAgentLauncher` with `runtime.surfaceName = "matrx-user/rag-search"` + `applicationScope`, arming the RAG tool family on the run. New `rag-search` value added to the `SourceFeature` union.
- **2026-06-13** — Two reusable primitives added for the Custom Dictionary feature: (1) `ui_surface.supports_dictionary` flag → surfaces so flagged get the user's dictionary auto-injected server-side (resolved into `SurfaceManifest.supports_dictionary`); seeded true for the transcription/TTS surfaces. (2) `user_surface_state` — a generic per-user, per-surface state store (`features/surfaces/user-state/` + `features/surfaces/redux/userStateSlice.ts`, hook `useSurfaceUserState`), the "Level 3" preferences primitive that replaces cookies for surface-scoped state. See `features/dictionary/FEATURE.md`.
- **2026-06-10 (later)** — `matrx-user/transcripts-cleanup` expanded to the
  reference "expose everything" standard: 8 → 36 values (active pane,
  session identity, all container texts incl. `all_custom_outputs`,
  word/char counts, mic/recording/lock state, queued inserts, clean + slot
  agent wiring with run phases, `custom_slots_summary`, `context_items`).
  `CleanupPad.buildScope()` emits all of them (selection family stays with
  the menu). DB synced direct-SQL, verified zero-drift by field-level diff.
  Reference mapping example: agent `Cleanup Surface Demo Reporter`
  (`42971fe0`) + GLOBAL `agx_agent_surface` binding with deliberately
  non-matching names (`working_text` ← `raw_transcript_text`,
  context slots ← arrays) + shortcut `Surface Demo: Session Report`
  (Transcription ai-action category, admin-user-scoped). Use this trio as
  the template when wiring other surfaces.
- **2026-06-10** — Registered `matrx-user/transcripts-cleanup` (the
  `/transcripts/cleanup` page): baseline `selection`/`content`/`context` +
  `session_id`, `session_title`, `raw_transcript_text`,
  `cleaned_transcript_text`, `custom_output_text`. Route prefix added ABOVE
  `/transcripts` in `route-to-surface.ts`. DB rows synced directly
  (`ui_surface` + 8 `ui_surface_value` rows). First consumer of bindings at
  launch-time outside the context menu: the cleanup page's
  `useAiPostProcess` resolves `agx_agent_surface.value_mappings` (most
  specific scope wins) via `resolveValueMappings` before falling back to
  name heuristics / `user_input` — so binding any agent to this surface
  controls exactly which variable/slot receives the transcript.
- **2026-05-15 (bulk push)** — Registered 11 more surface manifests +
  made agent-builder fully functional. New: `matrx-user/documents`,
  `research`, `tasks`, `data-tables`, `files`, `projects`, `messages`,
  `lists`, `canvas`, `ai-results`, `agent-advanced-editor`. The
  agent-builder surface now emits its full scope at runtime via
  `features/agents/hooks/useAgentBuilderSurfaceScope.ts` — the existing
  `UnifiedAgentContextMenu` mounts in `SystemMessage.tsx` /
  `MessageItem.tsx` pass the agent definition (incl. `agent_json`,
  `system_instruction`, model/tools/slots) as `contextData`. **DB synced
  directly** (anon key can't write, service endpoint unreachable from the
  agent shell) via `scripts/emit-surface-sync-sql.ts` → MCP `execute_sql`
  upsert; `ui_surface_value` now mirrors all 20 registered manifests
  (337 values). Emitter wiring still pending for the read-only/list
  surfaces (documents, research, tasks, data-tables, files, projects,
  messages, lists, canvas, ai-results) — manifests + DB are live so
  bindings work; runtime scope emission lands when actions are built.
- **2026-05-05** — v2 page shipped at `/admin/surfaces`. Backend seed
  expanded to 102 surfaces. Banner added to `/admin/lookups` UI Surfaces
  tab pointing at v2.
- **2026-05-05 (later)** — v2.1: drawer, rename via FK cascade, bulk
  delete, candidate inventory dialog, inline client creation, keyboard
  shortcuts.
- **2026-05-15** — `matrx-user/notes` manifest expanded from the Phase 1
  stub (4 surface-specific values) to a full 19 surface-specific + 5
  baseline declaration covering selection / scope mirror, active-note
  metadata, workspace context (open tabs, folder tree), and editor / pane
  state. Renamed `current_note_category` → `current_note_folder`
  (existing name was misleading; zero downstream bindings to migrate).
  Notes editor context menu now emits the surface scope and tags
  `runtime.surfaceName = "matrx-user/notes"` so `agx_agent_surface`
  bindings resolve at launch. See `features/notes/hooks/useNotesSurfaceScope.ts`.
- **2026-05-15 (third pass)** — Bulk manifest publication: 4 new
  surfaces + 1 expanded.
  - `matrx-user/agent-builder` (new) — 18 surface-specific values covering
    agent identity, system_instruction, user_message_draft, model,
    tools, custom_tools, mcp_servers, context_slots,
    variable_definitions, output_schema, settings, plus `agent_json`
    for full-agent inputs and editor focus state. Existing
    `UnifiedAgentContextMenu` mounts in `SystemMessage.tsx` and
    `MessageItem.tsx` updated with `surfaceName="matrx-user/agent-builder"`.
  - `matrx-user/chat` (new) — 16 values: active conversation, targeted
    message (`current_message_*`), last user/assistant, full thread,
    composer draft, streaming state.
  - `matrx-user/agent-run` (new) — 20 values supporting "judge an
    agent" use case: agent_definition + agent_json + user_request +
    variable_values + agent_response + all_messages + tool_calls +
    completion_stats.
  - `matrx-user/scraper` (new) — 14 values: URL + title + content (text
    / markdown / html) + metadata + main_image + links + status +
    execution time.
  - `matrx-user/code-editor` (expanded) — 6 → 12 values:
    `current_file_modified`, `current_column_number`, `selection_range`,
    `current_function_name`, `open_file_count`, `modified_file_paths`.
    Existing `UnifiedAgentContextMenu` mounts in
    `CodeEditorContextMenu.tsx` and `CodeWorkspaceContextMenu.tsx`
    updated with `surfaceName="matrx-user/code-editor"`.

  Total: 9 surfaces, 195 values registered (was 5 / 106). Drift check
  passes. Emitter wiring deferred for chat / agent-run / scraper —
  manifests publishable as-is; runtime emitters land when concrete
  actions are built against each surface.
- **2026-05-15 (later)** — `matrx-user/transcripts` manifest landed —
  24 surface-specific + 3 baseline values covering segment / playback
  mirror (`active_text`, `current_segment_*`, `current_playback_time`),
  transcript identity, the speaker dimension (`speaker_list`,
  `per_speaker_text`), full segments dimension (`all_segments`,
  `all_segments_text`), and media/editor state. Viewer
  (`features/transcripts/components/TranscriptViewer.tsx`) now wraps the
  segment area in `UnifiedAgentContextMenu` with `surfaceName =
  "matrx-user/transcripts"`, emitting scope via
  `features/transcripts/hooks/useTranscriptsSurfaceScope.ts`. Audio
  playback state is read live from the `<audio>` ref at trigger time so
  the emitted `current_playback_time` / `current_segment_*` are
  click-accurate. New `transcripts` value added to the `SourceFeature`
  union. Sister surface `matrx-user/transcript-studio` (live recording
  with 3 agent pipelines) is intentionally NOT bundled — it has existing
  hand-coded scope vocabulary to preserve and warrants its own PR.
