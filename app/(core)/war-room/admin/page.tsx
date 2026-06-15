// app/(core)/war-room/admin/page.tsx
//
// Per-feature admin map for the War Room. Renders via the platform primitive
// <FeatureAdminPage> (super-admin gated, utilitarian). War Room sprawls across
// the room shell, the gallery engine, the four tile tabs, the context pickers,
// and three substrate features — this is its connective index. When you add a
// War Room route / component / slice / overlay, update this file.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const WAR_ROOM_ADMIN_MAP: FeatureAdminMap = {
  name: "War Room",
  slug: "war-room",
  description:
    "Session-based multitasking command center. A user opens saved War Rooms, each a self-arranging gallery of tiles; every tile bundles a Task + Notes + Audio transcript behind four tabs, is context-aware (org/scope inherited from the session, overridable per tile), and can be pinned or hidden. A thin consumer of tasks, notes, transcription, and scopes.",
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
      label: "The room",
      description:
        "Header (title + session context) + the dynamic tile gallery. Hydrates the session, tiles, audio links, and linked tasks.",
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
      name: "WarRoomGallery",
      filePath: "features/war-room/components/room/WarRoomGallery.tsx",
      description:
        "Orders tiles (pinned-first), appends the always-present new tile, and positions everything via the layout engine.",
      tier: "internal",
    },
    {
      name: "WarRoomTile + TileFrame",
      filePath: "features/war-room/components/tile/WarRoomTile.tsx",
      description:
        "The tabbed tile shell (Task/Notes/Audio/All) + the prop-driven pinnable/hideable chrome (TileFrame). Expand opens each tab's full UI.",
      tier: "internal",
    },
    {
      name: "Tile tabs (Task / Notes / Audio)",
      filePath: "features/war-room/components/tile/TileTaskTab.tsx",
      description:
        "TileTaskTab (name/subtasks/attachments/comments), TileNotesTab (ProTextarea + autosave), TileAudioTab (record/save-only/new-session over transcript-studio).",
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
      name: "HiddenTilesTray + NewTile",
      filePath: "features/war-room/components/room/HiddenTilesTray.tsx",
      description:
        "Meet-style tray to restore hidden tiles; the always-present empty tile that promotes to a real one on first capture.",
      tier: "internal",
    },
  ],

  reduxSlices: [
    {
      name: "warRoom",
      filePath: "features/war-room/redux/slice.ts",
      description:
        "Sessions + tiles registries, audio links, per-tile UI (active tab, pin, hide, save state), and ephemeral UI. Linkage only — substrate data lives in tasks/notes/transcriptStudio.",
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
