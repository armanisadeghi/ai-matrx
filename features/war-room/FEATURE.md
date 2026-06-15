# War Room — FEATURE.md

> Session-based multitasking command center. Desktop-first. A user opens saved
> **War Rooms**, each a **cockpit of threads**: a **Stage** mode (a live
> watchlist rail + one driven thread) and a **Grid** mode (the self-arranging
> bento gallery, all at once), toggled in the header. Every thread bundles a
> Task + Notes + Audio transcript behind four tabs, is context-aware, and can be
> pinned, parked, or projected. **Read this before touching any
> `features/war-room/**` code.**

**Status:** Active (Waves 1–6 shipped). **Owner route group:** `(core)`.

---

## What it is

The answer to context-switching: a War Room is a cockpit, not a wall of equal
cards. **Stage mode** keeps every thread alive in a glanceable watchlist rail
(each row shows a live status word + an "is-alive" pulse glyph) beside the one
thread you're driving on a full-height Stage — click any rail row to snap it onto
the Stage with full working state. **Grid mode** is the bird's-eye bento gallery
of every thread at once, arranged and resized by the generic gallery engine
(video-call gallery math + bento at low counts), so 3 tiles look intentional and
12 still hold up. The header is mission control: a **Stage⇄Grid** toggle, the
**instrument projector** (force every thread to one view — all-Tasks, all-Notes…),
a **Comfortable/Compact density dial**, and a live **active / parked / pinned**
meter. Threads pin/park (hide) like Meet participants; parked threads stay
readable as chips and restore-and-stage on click. Rooms are saved sessions you
return to. War Room is a **thin consumer** — it owns the layout engine, the
thread shell, and the session model; all substrate data lives in the existing
features (tasks, notes, transcription, scopes).

## Routes (`app/(core)/war-room/`)

| URL | Renders | Notes |
|---|---|---|
| `/war-room` | `WarRoomLanding` (`ModuleLanding`) | Marketing. Authed users redirect to `/all`. |
| `/war-room/all` | `WarRoomAllView` | Browse / create / delete saved rooms (the list "savior" page). |
| `/war-room/[id]` | `WarRoomShell` | The cockpit: mission-control header (title + live meter + Stage⇄Grid + projector + density dial + session context) over `StageView` (rail + driven thread) or `WarRoomGallery` (Grid). |
| `/war-room/admin` | `FeatureAdminPage` | Super-admin map of every route/component/slice/table. |

## Data model (3 tables, all `ctx_war_room_*`)

- **`ctx_war_room_sessions`** — the room. Owner + multi-scope + `context_scope_ids` (jsonb scope-id array = the session-level context default) + soft-delete.
- **`ctx_war_room_tiles`** — one row per tile. `task_id`/`note_id` FKs (nullable), `context_organization_id`/`context_scope_ids` (NULL = inherit session), `active_tab`, `is_pinned`, `is_hidden`, `position`.
- **`ctx_war_room_tile_audio_sessions`** — link table: tile → N `studio_sessions` (`source='war_room'`), `is_active` marks the current one.

RLS follows the `studio_sessions` `check_resource_access(...)` pattern (migration `migrations/ctx_war_room_schema.sql`). Cross-user sharing is not wired yet (register in `shareable_resource_registry` when it is).

## State — the `warRoom` slice (`redux/`)

Stores **only linkage + tile UI state** (sessions/tiles registries, audio links, ephemeral UI). Task data stays in the agent-context tasks slice, note data in `notes`, transcript data in `transcriptStudio`. Selectors are per-key memoized (`redux/selectors.ts`); thunks (`redux/thunks.ts`) are the only writers.

## Room UI (`components/room/` + `components/tile/` + `hooks/`)

The cockpit is one canonical build (the consolidation of a 4-way ui bake-off — winner `reimagine` + grafts from `dense`/`refine`/`sharp`):

- **`WarRoomShell`** — the frame + mission-control header. Routes the body to `StageView` or `WarRoomGallery` by `mode`.
- **`roomViewContext`** — the ONLY home for ephemeral room view state (`mode` stage/grid · `projectedTab` · `density` · the staged thread). React context, **never Redux, never persisted** — these are view preferences, not session data. `DENSITY_LAYOUT` maps the dial to gallery floors; `resolveStagedId` clamps the Stage to a visible thread so it can't strand.
- **Stage mode:** `StageView` (rail + stage) → `RailTile` rows (read-only watchlist, `PulseGlyph` + status word) and `StageTile` (the hero focus pane, full working state). Parked threads fold into a collapsible rail section.
- **Grid mode:** `WarRoomGallery` (the gallery engine + density floors) → `WarRoomTile` (operable card: accent rail + metric chips + segmented tabs + projector; double-click → Stage). Parked threads dock in `HiddenTilesTray`.
- **Shared tile primitives:** `TileTabBar` (segmented, kind-colored switcher), `TileTabContent` (the 4 real bodies + combined view — the single source both modes render), `TileMetricChips`, `TileOptionsMenu`, `PulseGlyph`, `ParkedThreadChip`, `tileKind` (semantic accent map: task→primary, notes→info, audio→warning, all→success).
- **Hooks (compose the real slices read-only, written once):** `useTilePulse` (live status word/headline/preview + is-alive signal), `useTileMetrics` (chip readings), `useTileActions` (rename/pin/hide/expand/delete/stage resolver). Stage, Grid, and parked chips all consume these — no forked tile logic.

## Reused primitives (do NOT rebuild)

- Layout: generic `computeGalleryLayout` (`lib/layout/galleryLayout.ts`) + `useGalleryLayout` (`hooks/useGalleryLayout.ts`) — extracted, reusable by any tiled workspace.
- Landing: `ModuleLanding`. Text inputs: `ProTextarea`. Confirms: `confirm()`.
- Task tab: `EditableTaskTitle`, task thunks (`createTaskThunk`/`createSubtaskThunk`/…), `TaskAttachments`, and `TaskCommentPopover` (new shared primitive in `features/tasks/`).
- Notes tab: `ProTextarea` + the notes autosave middleware (`createNote` API).
- Audio tab: `MicrophoneIconButton` + the transcript-studio thunks/selectors; expand via `useOpenTranscriptStudioWindow`.
- Context: `EntityTargetPicker` (org) + `EntityScopeTagger` (controlled) via `WarRoomContextPicker`.

## Invariants (load-bearing)

1. **Context is a controlled selection the records carry.** War Room pickers persist org/scope ONLY onto `ctx_war_room_*` rows (`setSessionContextThunk` / `setTileContextOverrideThunk`). They **never** write `appContextSlice` (global active context) or `ctx_scope_assignments`. `selectTileEffectiveContext` resolves `tile override ?? session default`. See [`features/scopes/FEATURE.md`](../scopes/FEATURE.md).
2. **A tile is the container; its tabs are thin consumers.** A tile = `{task_id?, note_id?, audio sessions[]}`. Notes/tasks/transcripts are owned by their features and survive tile/room deletion.
3. **The "new" tile is a render concern**, not a DB row, until the user captures into it.
4. **Room view state is ephemeral.** Stage/Grid mode, the projector, the density dial, and the staged thread live ONLY in `roomViewContext` (React context) — never Redux, never persisted, never on the record. The projector overrides which tab is *shown*, never the tile's saved `active_tab`. Don't reach for a slice for any of these.
5. **Desktop-first.** The gallery math assumes a wide viewport.

## Doctrine

- **Build the platform, not the artifact.** The gallery engine and `TaskCommentPopover` were extracted as reusable primitives, not buried here. Before adding a tile capability, check whether the substrate feature already exposes it.
- New routes/panels/overlays/components → add to the `/war-room/admin` map config.
- After substantive changes, update this doc + the Change Log.

## Known deferral

The deeper **transcription working-state Redux migration** (Wave 0) — lifting `useCleanupSession`'s local edit/run state into `transcriptStudio` so a minimal Audio tile and its expand overlay share **live in-progress clean edits** — is deferred. Today the *committed* transcript is already shared via DB + the studio slice; only simultaneous live clean-editing across both views is unsynced. Tracked for when shared live editing is needed.

## Verify

Dev-login → `/war-room/all`. Create a room; add threads. **Stage mode:** rail shows every thread with a live status word; click a row → it stages with full state; the rail "new thread" auto-stages; parked threads collapse under the rail and restore-and-stage on click. **Grid mode:** grid re-flows at 1/2/3/8/12; the **density dial** packs/loosens it; double-click a card → Stage. **Projector:** set the whole room to one view, then clear it (saved per-tile tabs untouched). Pin/park + restore (rail section + Grid tray). Task (name/subtask/attachment/comment, persists), Notes (Text/Matrx-Split/Preview + single-layer in the All view; type → autosave → reload), Audio (New Session → studio_sessions row; record needs a real mic), Context (session org/scope → threads inherit → reload persists; never mutates global). Expand opens each tab's full UI. Editable session + thread titles.

## Change Log

- 2026-06-14 — Waves 1–5: schema + slice + landing + `/all`; gallery engine + tile system + pin/hide; Task/Notes/Audio/Combined tabs (all functional); session + per-tile context-awareness; expand overlays; this doc + `/war-room/admin` map.
- 2026-06-14 — Wave 6 (ui bake-off consolidation): the canonical room UI became a cockpit — **Stage⇄Grid** modes, a live watchlist rail (`StageView`/`RailTile`/`StageTile`), the **instrument projector**, a **Comfortable/Compact density dial**, live metric chips + accent rails on tiles, and a parked-thread chip treatment. New ephemeral `roomViewContext`; new `useTilePulse`/`useTileMetrics`/`useTileActions` hooks and shared tile primitives (`TileTabContent`/`TileMetricChips`/`TileOptionsMenu`/`PulseGlyph`/`tileKind`). Removed `TileFrame` (its chrome is now inlined in the richer tiles) and the four `_bakeoff/` variants + `/war-room/bakeoff/*` routes. Parity preserved: editable titles, options menu, icon tab switcher, all four tab bodies, note modes, context controls, pin/park/restore, expand overlays, real loading/empty/not-found.
