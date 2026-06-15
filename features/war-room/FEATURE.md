# War Room — FEATURE.md

> Session-based multitasking command center. Desktop-first. A user opens saved
> **War Rooms**, each a self-arranging gallery of **tiles**; every tile bundles a
> Task + Notes + Audio transcript behind four tabs, is context-aware, and can be
> pinned or hidden. **Read this before touching any `features/war-room/**` code.**

**Status:** Active (Waves 1–5 shipped). **Owner route group:** `(core)`.

---

## What it is

The answer to context-switching: every open thread becomes a tile in a grid that
arranges and resizes itself (video-call gallery math + bento at low counts), so
3 tiles look intentional and 12 still hold up. Tiles pin/hide like Meet
participants. Rooms are saved sessions you return to. War Room is a **thin
consumer** — it owns the layout engine, the tile shell, and the session model;
all substrate data lives in the existing features (tasks, notes, transcription,
scopes).

## Routes (`app/(core)/war-room/`)

| URL | Renders | Notes |
|---|---|---|
| `/war-room` | `WarRoomLanding` (`ModuleLanding`) | Marketing. Authed users redirect to `/all`. |
| `/war-room/all` | `WarRoomAllView` | Browse / create / delete saved rooms (the list "savior" page). |
| `/war-room/[id]` | `WarRoomHydrator`-less `WarRoomShell` | The room: header (title + session context) + tile gallery. |
| `/war-room/admin` | `FeatureAdminPage` | Super-admin map of every route/component/slice/table. |

## Data model (3 tables, all `ctx_war_room_*`)

- **`ctx_war_room_sessions`** — the room. Owner + multi-scope + `context_scope_ids` (jsonb scope-id array = the session-level context default) + soft-delete.
- **`ctx_war_room_tiles`** — one row per tile. `task_id`/`note_id` FKs (nullable), `context_organization_id`/`context_scope_ids` (NULL = inherit session), `active_tab`, `is_pinned`, `is_hidden`, `position`.
- **`ctx_war_room_tile_audio_sessions`** — link table: tile → N `studio_sessions` (`source='war_room'`), `is_active` marks the current one.

RLS follows the `studio_sessions` `check_resource_access(...)` pattern (migration `migrations/ctx_war_room_schema.sql`). Cross-user sharing is not wired yet (register in `shareable_resource_registry` when it is).

## State — the `warRoom` slice (`redux/`)

Stores **only linkage + tile UI state** (sessions/tiles registries, audio links, ephemeral UI). Task data stays in the agent-context tasks slice, note data in `notes`, transcript data in `transcriptStudio`. Selectors are per-key memoized (`redux/selectors.ts`); thunks (`redux/thunks.ts`) are the only writers.

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
4. **Desktop-first.** The gallery math assumes a wide viewport.

## Doctrine

- **Build the platform, not the artifact.** The gallery engine and `TaskCommentPopover` were extracted as reusable primitives, not buried here. Before adding a tile capability, check whether the substrate feature already exposes it.
- New routes/panels/overlays/components → add to the `/war-room/admin` map config.
- After substantive changes, update this doc + the Change Log.

## Known deferral

The deeper **transcription working-state Redux migration** (Wave 0) — lifting `useCleanupSession`'s local edit/run state into `transcriptStudio` so a minimal Audio tile and its expand overlay share **live in-progress clean edits** — is deferred. Today the *committed* transcript is already shared via DB + the studio slice; only simultaneous live clean-editing across both views is unsynced. Tracked for when shared live editing is needed.

## Verify

Dev-login → `/war-room/all`. Create a room; add tiles (grid re-flows at 1/2/3/8/12); pin/hide + restore tray; Task (name/subtask/attachment/comment, persists), Notes (type → autosave → reload), Audio (New Session → studio_sessions row; record needs a real mic), Context (set session org/scope → tiles inherit → reload persists; never mutates global). Expand opens each tab's full UI.

## Change Log

- 2026-06-14 — Waves 1–5: schema + slice + landing + `/all`; gallery engine + tile system + pin/hide; Task/Notes/Audio/Combined tabs (all functional); session + per-tile context-awareness; expand overlays; this doc + `/war-room/admin` map.
