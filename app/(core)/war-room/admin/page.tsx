// app/(core)/war-room/admin/page.tsx
//
// Per-feature admin map for the War Room. Renders via the platform primitive
// <FeatureAdminPage> (super-admin gated, utilitarian). War Room sprawls across
// the room shell, the gallery engine, the five tile tabs, the context pickers,
// and three substrate features — this is its connective index. When you add a
// War Room route / component / slice / overlay, update this file.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const WAR_ROOM_ADMIN_MAP: FeatureAdminMap = {
  name: "War Room",
  slug: "war-room",
  description:
    "Session-based multitasking command center. A user opens saved War Rooms, each a cockpit of threads: a Stage mode (a live watchlist rail + one driven thread) and a Grid mode (the self-arranging bento gallery, all at once), toggled in the header. Every thread bundles a Task + Notes + Audio transcript + Files/Documents behind five tabs, is context-aware (org/scope inherited from the session, overridable per tile), and can be pinned, parked (hidden), or projected. Header controls: Stage⇄Grid, the instrument projector (set every thread to one view), a Comfortable/Compact density dial, and a live active/parked/pinned meter. A thin consumer of tasks, notes, transcription, files/documents, and scopes.",
  docs: [{ label: "War Room FEATURE.md", href: "/features/war-room/FEATURE.md" }],
  routeScanPath: "app/(core)/war-room",

  routes: [
    {
      url: "/war-room",
      label: "Marketing landing",
      description:
        "Public ModuleLanding pitch. Authenticated users are redirected to /war-room/all.",
      filePath: "features/auth/components/module-landing/landings/WarRoomLanding.tsx",
      status: "Live",
    },
    {
      url: "/war-room/all",
      label: "My War Rooms",
      description: "Browse / create / delete saved rooms. The list 'savior' page.",
      filePath: "features/war-room/components/all/WarRoomAllView.tsx",
      status: "Live",
    },
    {
      url: "/war-room/[id]",
      label: "The room (cockpit)",
      description:
        "Mission-control header (title + live meter + Stage⇄Grid + instrument projector + density dial + session context) over Stage view (rail + driven thread) or Grid view (bento gallery). Hydrates the session, tiles, audio links, and linked tasks.",
      filePath: "features/war-room/components/room/WarRoomShell.tsx",
      status: "Live",
    },
    {
      url: "/war-room/admin",
      label: "This admin map",
      description: "Super-admin index of every War Room resource.",
      filePath: "app/(core)/war-room/admin/page.tsx",
      status: "Live",
    },
  ],

  components: [
    {
      name: "computeGalleryLayout + useGalleryLayout",
      filePath: "lib/layout/galleryLayout.ts",
      description:
        "Generic gallery-grid engine (video-call gallery math + bento at low counts). Extracted as a reusable primitive — any tiled workspace can use it. React binding in hooks/useGalleryLayout.ts.",
      tier: "candidate",
    },
    {
      name: "WarRoomShell + roomViewContext",
      filePath: "features/war-room/components/room/WarRoomShell.tsx",
      description:
        "The cockpit frame + header (Stage⇄Grid, projector, density dial, live meter). roomViewContext.tsx holds the ephemeral view state (mode / projectedTab / density / staged thread) — never Redux, never persisted.",
      tier: "candidate",
    },
    {
      name: "StageView + StageTile + RailTile",
      filePath: "features/war-room/components/room/StageView.tsx",
      description:
        "Stage mode: a live watchlist rail (RailTile rows with PulseGlyph + status word) beside the hero focus pane (StageTile, full working state). Click a rail row to snap it onto the Stage. Parked threads fold into a collapsible rail section.",
      tier: "internal",
    },
    {
      name: "WarRoomGallery (Grid mode)",
      filePath: "features/war-room/components/room/WarRoomGallery.tsx",
      description:
        "Grid mode: orders tiles (pinned-first), appends the always-present new tile, positions via the layout engine with the density floors, docks parked threads in the bottom tray.",
      tier: "internal",
    },
    {
      name: "WarRoomTile",
      filePath: "features/war-room/components/tile/WarRoomTile.tsx",
      description:
        "The operable Grid tile: kind accent rail + live metric chips + segmented tab switcher + projector support; double-click promotes to the Stage. Shares the canonical tab bodies via TileTabContent.",
      tier: "internal",
    },
    {
      name: "Tile presentation primitives",
      filePath: "features/war-room/components/tile/TileTabBar.tsx",
      description:
        "TileTabBar (segmented, kind-colored switcher), TileTabContent (4 bodies + combined view), TileMetricChips (live readings), PulseGlyph (is-alive glyph), TileOptionsMenu (pin/stage/expand/hide/remove), tileKind (semantic accent map).",
      tier: "internal",
    },
    {
      name: "Tile hooks (pulse / metrics / actions)",
      filePath: "features/war-room/hooks/useTilePulse.ts",
      description:
        "useTilePulse (live status word + headline + preview), useTileMetrics (chip readings), useTileActions (rename/pin/hide/expand/delete resolver). Compose the real tasks/notes/transcript/warRoom slices read-only — written once, consumed by Stage + Grid + parked chips.",
      tier: "candidate",
    },
    {
      name: "Tile tabs (Task / Notes / Audio / Files)",
      filePath: "features/war-room/components/tile/TileTaskTab.tsx",
      description:
        "TileTaskTab (name/subtasks/attachments/comments), TileNotesTab (NoteEditorCore + autosave), TileAudioTab (embedded CleanupPad over transcript-studio), TileAttachmentsTab (Files: upload/pick via @/features/files + InlineMediaRef; Documents: createDocument/listAccessibleDocuments → /documents/[id]) — all backed by ctx_war_room_tile_* link tables.",
      tier: "internal",
    },
    {
      name: "WarRoomContextPicker + TileContextOverride + SessionContextButton",
      filePath: "features/war-room/components/shared/WarRoomContextPicker.tsx",
      description:
        "Controlled org+scope picker (composes EntityTargetPicker + EntityScopeTagger) and its session/tile hosts. Writes only to ctx_war_room_* rows — never global context.",
      tier: "internal",
    },
    {
      name: "TaskCommentPopover",
      filePath: "features/tasks/components/TaskCommentPopover.tsx",
      description:
        "Reusable task-comment surface (button → popover thread + composer) over ctx_task_comments. Built for War Room; the full task editor can adopt it.",
      tier: "internal",
    },
    {
      name: "HiddenTilesTray + ParkedThreadChip + NewTile",
      filePath: "features/war-room/components/room/HiddenTilesTray.tsx",
      description:
        "Grid-mode parked-threads dock. ParkedThreadChip carries a live status trio and restores-and-stages on click (hidden ≠ gone). NewTile is the always-present add affordance (card + rail shapes) that auto-stages the fresh thread.",
      tier: "internal",
    },
  ],

  reduxSlices: [
    {
      name: "warRoom",
      filePath: "features/war-room/redux/slice.ts",
      description:
        "Sessions + tiles registries, audio links, note links, attachment links (files + documents), and per-tile UI (active tab, pin, hide). Linkage only — substrate data lives in tasks/notes/transcriptStudio/files/data-tables.",
    },
  ],

  relatedFeatures: [
    {
      name: "Tasks",
      adminUrl: "/tasks/admin",
      description:
        "The Task tab links a ctx_tasks row per tile (createTileTask) and reuses the task thunks, EditableTaskTitle, TaskAttachments, and the new TaskCommentPopover.",
    },
    {
      name: "Notes",
      adminUrl: "/notes/admin",
      description:
        "The Notes tab backs each tile with a notes row + the notes autosave middleware. note.task_id is kept in sync with the tile's task.",
    },
    {
      name: "Transcripts / Studio",
      adminUrl: "/transcripts/admin",
      description:
        "The Audio tab creates studio_sessions (source='war_room') linked via ctx_war_room_tile_audio_sessions; expand opens the full transcription studio for the same session.",
    },
    {
      name: "Files / Documents",
      description:
        "The Files tab links cld_files (upload via folderForWarRoomTile or pick existing) and udt_documents (createDocument / listAccessibleDocuments → /documents/[id]) via the polymorphic ctx_war_room_tile_attachments table. Reuses @/features/files (requestUpload/openFilePicker/InlineMediaRef) + data-tables document-service — no upload/pick/doc-edit reimplemented.",
    },
    {
      name: "Scopes",
      adminUrl: "/scopes/admin",
      description:
        "Context-awareness composes EntityTargetPicker + EntityScopeTagger (controlled). War Room never writes appContextSlice or ctx_scope_assignments.",
    },
  ],
};

export default function WarRoomAdminPage() {
  return <FeatureAdminPage map={WAR_ROOM_ADMIN_MAP} />;
}
