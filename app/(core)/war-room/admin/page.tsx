// app/(core)/war-room/admin/page.tsx
//
// Per-feature admin map for the War Room. Renders via the platform primitive
// <FeatureAdminPage> (super-admin gated, utilitarian). War Room sprawls across
// the room shell, the gallery engine, the six tile tabs, the context pickers,
// and several substrate features — this is its connective index. When you add a
// War Room route / component / slice / overlay, update this file.

import FeatureAdminPage from "@/features/admin/components/FeatureAdminPage";
import type { FeatureAdminMap } from "@/features/admin/types/featureAdminMap";

const WAR_ROOM_ADMIN_MAP: FeatureAdminMap = {
  name: "War Room",
  slug: "war-room",
  description:
    "Session-based multitasking command center. A user opens saved War Rooms, each a cockpit of threads: a Stage mode (a live watchlist rail + one driven thread) and a Grid mode (the self-arranging bento gallery, all at once), toggled in the header. Every thread bundles a Task + Notes + Audio transcript + Files/Documents + an Agent (the real Scribe Agent+ panel) behind six tabs, is context-aware (org/scope inherited from the session, overridable per tile), and can be pinned, parked (hidden), or projected. Header controls: Stage⇄Grid, the instrument projector (set every thread to one view), a Comfortable/Compact density dial, and a live active/parked/pinned meter. A thin consumer of tasks, notes, transcription, files/documents, scribe/agents, and scopes.",
  docs: [
    { label: "War Room FEATURE.md", href: "/features/war-room/FEATURE.md" },
  ],
  routeScanPath: "app/(core)/war-room",

  routes: [
    {
      url: "/war-room",
      label: "Marketing landing",
      description:
        "Public ModuleLanding pitch. Authenticated users are redirected to /war-room/all.",
      filePath:
        "features/auth/components/module-landing/landings/WarRoomLanding.tsx",
      status: "Live",
    },
    {
      url: "/war-room/all",
      label: "My War Rooms",
      description:
        "Browse / create / delete saved rooms. The list 'savior' page. Shell-header HeaderToggle switches Rooms (cards + unassigned threads + search) and Threads (WarRoomThreadsTable — canonical MatrxDataTable over every thread with sort/filter/search and per-row Open); header actions: Master Agent / From project / New War Room.",
      filePath: "features/war-room/components/all/WarRoomAllView.tsx",
      status: "Live",
    },
    {
      url: "/war-room/[id]",
      label: "The room (cockpit)",
      description:
        "Mission-control chrome injected into the SHELL glass via RoomHeader (<PageHeader>): title + live meter + Stage⇄Grid + thread search + ActiveContextLensChip + Room Agent inline; projector, density, room details, resources, project, and delete live in the ONE '…' menu (mobile: back + title + search + context chip inline, plus one '…' bottom sheet). Over Stage view (rail + driven thread) or Grid view (bento gallery). Hydrates the session, tiles, audio links, and linked tasks. The 'Room Agent' button opens the TIER-2 per-room agent (RoomAgentPanel) in an inline non-modal WindowPanel; the shared MasterWatchLayer is mounted here too so messaging a thread pops a live-watch window in the room.",
      filePath: "features/war-room/components/room/WarRoomShell.tsx",
      status: "Live",
    },
    {
      url: "/war-room/new",
      label: "Create-then-open redirect",
      description:
        "Creates a session via createWarRoomSession and replaces into /war-room/[id]. The shell sidebar's create-war-room action pushes here so navActions carries zero import edge to the war-room engine (D115 class).",
      filePath: "features/war-room/shared/WarRoomNew.tsx",
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
        "The cockpit frame; RoomHeader.tsx injects mission control into the shell glass row (Stage⇄Grid, search, live meter, the '…' overflow with projector/density/details/resources/project/delete). roomViewContext.tsx holds the ephemeral view state (mode / projectedTab / density / staged thread) — never Redux, never persisted.",
      tier: "candidate",
    },
    {
      name: "StageView + StageThread + RailThread",
      filePath: "features/war-room/components/room/StageView.tsx",
      description:
        "Stage mode: a live watchlist rail (RailThread rows with PulseGlyph + status word) beside the hero focus pane (StageThread, full working state). Click a rail row to snap it onto the Stage. Parked threads fold into a collapsible rail section.",
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
      name: "WarRoomThread",
      filePath: "features/war-room/components/thread/WarRoomThread.tsx",
      description:
        "The operable Grid tile: kind accent rail + live metric chips + segmented tab switcher + projector support; double-click promotes to the Stage. Shares the canonical tab bodies via ThreadTabContent.",
      tier: "internal",
    },
    {
      name: "Tile presentation primitives",
      filePath: "features/war-room/components/thread/ThreadTabBar.tsx",
      description:
        "ThreadTabBar (segmented, kind-colored switcher), ThreadTabContent (5 bodies + combined view), ThreadMetricChips (live readings), PulseGlyph (is-alive glyph), ThreadOptionsMenu (pin/stage/expand/hide/remove), threadKind (semantic accent map).",
      tier: "internal",
    },
    {
      name: "Tile hooks (pulse / metrics / actions)",
      filePath: "features/war-room/hooks/useThreadPulse.ts",
      description:
        "useThreadPulse (live status word + headline + preview), useThreadMetrics (chip readings), useThreadActions (rename/pin/hide/expand/delete resolver). Compose the real tasks/notes/transcript/warRoom slices read-only — written once, consumed by Stage + Grid + parked chips.",
      tier: "candidate",
    },
    {
      name: "Thread tabs (Task / Notes / Audio / Resources / Agent + derived entity tabs)",
      filePath: "features/war-room/components/thread/ThreadTaskTab.tsx",
      description:
        "ThreadTaskTab (name/subtasks/attachments/comments; canvas-anchored threads route to Resources), ThreadNotesTab (NoteEditorCore + autosave), ThreadAudioTab (embedded CleanupPad over transcript-studio), ThreadResourcesTab (the canonical AssociationList over useThreadResourcesAdapter — every attached entity type, role-grouped, universal search-attach, pin, detach; upload/pick/new-file/new-doc toolbar) — all platform.associations edges. Notes/Audio/Agent entity lifecycle (name display + inline rename + switch + unlink + '+ New') = the canonical AssociationEntitySelect (features/scopes/components/associations/) over the adapters in features/war-room/hooks/useThreadEntitySelect.ts. The tab set is DERIVED (useThreadTabs): one entity:<token> tab per attached type the core tabs don't cover, rendered as a token-scoped AssociationList.",
      tier: "internal",
    },
    {
      name: "ThreadResourcesButton / ThreadResourcesSheet + RoomResourcesSheet",
      filePath: "features/war-room/components/thread/ThreadResourcesSheet.tsx",
      description:
        "The 1-click resources surfaces: a paperclip+count button on EVERY thread header (grid tile + stage) opening the full resources view in a Sheet/Drawer, and the room-scope sibling RoomResourcesSheet launched from RoomHeader's '…' menu (room-wide attachments every thread's agent sees). Both render the canonical AssociationList (features/scopes/components/associations/).",
      tier: "internal",
    },
    {
      name: "ThreadAgentTab + ThreadAgentPanel (Agent)",
      filePath: "features/war-room/components/thread/ThreadAgentTab.tsx",
      description:
        "The Agent tab: REUSES the real Scribe Agent+ panel unchanged — AssistantAgentBar (pick/switch agent) + WorkingDocumentHeader (user+agent co-edited working document) + ExperimentalAgentScreen (conversation + auto-voice/record/text-input + RecordActionSheet). ThreadAgentTab resolves the tile's studio session (selectActiveAudioSessionId; hydrate-only — session/conversation are provisioned once at thread creation, never auto-created); ThreadAgentPanel is the lazy (next/dynamic ssr:false) composed body, plus a post-turn document re-fetch covering the single-active-session realtime gap. Bound to the SAME studio_sessions row the Audio tab records into, so the tile's recordings are the agent's transcript context.",
      tier: "internal",
    },
    {
      name: "MasterAgentPanel + useMasterAgent (master agent — all rooms)",
      filePath: "features/war-room/components/master/MasterAgentPanel.tsx",
      description:
        "The /war-room/all 'Master Agent' button opens this lazy (next/dynamic ssr:false) panel inside an inline, NON-MODAL, draggable WindowPanel (docked bottom-right) so the rooms list stays interactive. It REUSES the canonical AgentConversationColumn (composer + streaming) unchanged on surfaceKey 'war-room-master'. useMasterAgent is a thin context layer over the shared useDurableAgentConversation primitive — ONE durable conversation per user keyed 'war-room:master-conversation:<userId>' (per-agent roster + active-agent pointer + legacy-key migration). It DEFAULTS to the persona bound to the `war_room.master` AGENT SLOT (resolved via useAgentSlot; system default = a builtin agent.definition carrying data/data_action/workbook/document so it can list/read the user's own notes/tasks/projects/transcripts). The slot governs only what a NEW conversation is minted with — the roster is keyed by agent id, so existing chats resume under the agent they were born with. Shown + swappable per-chat via WarRoomAgentSelector, and the default itself is swappable in place via SlotAgentPicker (no hidden default). It pushes READ-ONLY cross-room context (buildMasterAgentContext) with the no-empty-push guard, re-pushing when the room set changes, and ARMS the master tools (setClientTools(WAR_ROOM_MASTER_TOOL_NAMES), cleared on unmount) so the master can read/message threads + create/rename rooms — see the war-room-master-tools entry.",
      tier: "candidate",
    },
    {
      name: "buildMasterAgentContext (master roster service)",
      filePath: "features/war-room/service/masterAgentContext.ts",
      description:
        "Async, READ-ONLY cross-room context builder for the master agent. Returns master_role (framing) + war_room_overview (a compact ROSTER — every room → its threads with { threadTitle, conversationId|null, status?, taskTitle?, noteSnippet?, hasAudio, fileCount }), NOT full transcripts. Fetches its own data (Redux only holds the active room): the war-room service listSessions/listTiles/list*ForTiles + targeted reads of ctx_tasks (titles), notes (snippets), and studio_sessions.assistant_conversation_id (each thread agent's conversation — queried DIRECTLY because studioService excludes source='war_room'). Owner-scoped via RLS; values carry no mutable/source ⇒ ctx_get only. The thread conversationId is the seam the master tools resolve (the same chain war-room-master-tools/service/threadResolver.ts rebuilds at dispatch time).",
      tier: "candidate",
    },
    {
      name: "RoomAgentPanel + useRoomAgent (room agent — TIER 2, one room)",
      filePath: "features/war-room/components/room/RoomAgentPanel.tsx",
      description:
        "The TIER-2 room agent: the master agent NARROWED to a single room. The room header's 'Room Agent' button (Bot icon) opens this lazy (next/dynamic ssr:false) panel inside an inline, NON-MODAL, draggable WindowPanel (docked bottom-right) so the cockpit stays interactive. REUSES the canonical AgentConversationColumn unchanged on surfaceKey 'war-room-room-agent'. useRoomAgent is a thin context layer over useDurableAgentConversation — ONE durable conversation PER ROOM keyed 'war-room:room-agent:<sessionId>' (per room not per user), so each room has its own agent and switching rooms switches agents. It DEFAULTS to the persona bound to the `war_room.room` AGENT SLOT (system default = a builtin agent.definition carrying data/data_action/workbook/document so it can list/read the user's own resources); an existing chat binds to the agent recorded on its edge, never the slot. The default is swappable in place via SlotAgentPicker. It pushes READ-ONLY single-room context (buildRoomAgentContext(sessionId)) with the no-empty-push guard, re-pushing when THIS room's tile set changes, and ARMS the master tools MINUS war_room_create_room (read_thread + message_thread + rename_room — reads/messages its own threads and renames its room, but does not create rooms), cleared on unmount/room-switch.",
      tier: "candidate",
    },
    {
      name: "buildRoomAgentContext (room roster service — TIER 2)",
      filePath: "features/war-room/service/roomAgentContext.ts",
      description:
        "Async, READ-ONLY single-room context builder — masterAgentContext.ts narrowed to ONE session. Returns room_agent_role (framing: you oversee THIS one room) + war_room_threads (a compact ROSTER of just this room's threads, the SAME per-thread shape MasterThreadEntry { threadTitle, conversationId|null, status?, taskTitle?, noteSnippet?, hasAudio, fileCount } the master uses, so the shared war-room-master-tools resolve a thread identically). Reuses the master builder's exact read path scoped by sessionId: getSession + listTiles + list*ForTiles + targeted reads of ctx_tasks (titles), notes (snippets), studio_sessions.assistant_conversation_id. Owner-scoped via RLS; values carry no mutable/source ⇒ ctx_get only. The single-room roster (not the cross-room one) is what keeps the agent acting within its room.",
      tier: "candidate",
    },
    {
      name: "War Room agent tools (war-room-tools)",
      filePath: "features/agents/war-room-tools/tools/names.ts",
      description:
        "Client-delegated tool family that lets the tile's Agent+ assistant EDIT the tile's entities (it already SEES them via context). Mirrors features/agents/ui-first-tools: 5 write tools (war_room_update_task / war_room_add_subtask / war_room_toggle_subtask / war_room_update_note / war_room_update_thread), each a Zod schema + a handler calling the REAL writers (tasks thunks, notesApi, war-room renameTile). Offered as INLINE tool specs (no server registry change). Armed + tile-bound per conversation by ThreadAgentPanel; routed via an isWarRoomToolName branch in surface-delegated-tool-call.thunk. Every write is HITL-gated by a confirm AskCard (reuses the ui-first pendingAsks surface).",
      tier: "internal",
    },
    {
      name: "War Room MASTER agent tools (war-room-master-tools)",
      filePath: "features/agents/war-room-master-tools/tools/names.ts",
      description:
        "Read-only + orchestration tool family (NOTIFY-AND-WATCH, NOT HITL — deliberately the opposite of war-room-tools): war_room_read_thread (read a thread agent's chain), war_room_read_resource (read ANY attached resource / container manifest), war_room_message_thread (mode 'fresh'/'fork'), war_room_create_room, war_room_rename_room. Reading an attached FILE's extracted text is the SERVER tool file_read (armed on the three War Room agent.definition rows; the client-delegated war_room_read_file + service/fileResolver.ts were deleted, D15 — a client round-trip hard-suspended the loop). service/threadResolver.ts resolves a thread_id (= tile id) → the thread agent's conversationId. Offered as INLINE specs (build-tool-injection isWarRoomMasterToolName branch); routed via an isWarRoomMasterToolName branch in surface-delegated-tool-call.thunk → dispatchWarRoomMasterTool (runs immediately, validates args, resolves target, refuses unknown). The READ-ONLY members (read_thread + read_resource) are ALSO armed on each TILE agent by ThreadAgentPanel (routing keys off the name, not the surface) so a thread agent reads siblings' chains + any attached resource with no approval. The full set is armed on the master conversation by useMasterAgent; the TIER-2 room agent (useRoomAgent) gets it MINUS war_room_create_room.",
      tier: "internal",
    },
    {
      name: "MasterWatchLayer (live-watch windows)",
      filePath: "features/war-room/components/master/MasterWatchLayer.tsx",
      description:
        "Renders one inline, non-modal, draggable WindowPanel per conversation the master OR room agent is messaging (driven by the shared warRoomWatch slice's openConversationIds), body = AgentConversationColumn (hideInput) so the user watches the thread agent stream in real time and can step in. Mounted (lazy, ssr:false) in BOTH WarRoomAllView (master) and WarRoomShell (room agent) — only one is mounted at a time so they never contend; always present so a tool/toast openWatch can pop a window even when the agent panel is closed; guard-hydrates cold conversations via loadConversation (skips a convo already in Redux/streaming so it never clobbers a live stream). Closing a window dispatches closeWatch; leaving the surface dispatches closeAllWatches. Mirrors SubtaskWindow's inline-WindowPanel pattern.",
      tier: "internal",
    },
    {
      name: "RoomRecordingController + roomRecordingBridge (room-level recording ownership)",
      filePath: "features/war-room/components/room/RoomRecordingController.tsx",
      description:
        "D14 fence 1. Invisible controller mounted once in WarRoomShell that OWNS the active recording session for the room's tiles: starts the app-root recorder (GlobalRecordingProvider) with the SESSION-KEYED context {kind:'studio', sessionId} and holds the finalize/persistence callbacks at room scope — so switching a tile's tab (which unmounts the embedded CleanupPad) never tears the recording down, and a remounted pad re-attaches via the recordings slice. service/roomRecordingBridge.ts is the module registry (controller API + per-session pad-view registry + stop-mode latch); state = warRoom.audioRecording (roomRecordingStarted/Finalizing/Cleared; selectRoomAudioRecording / selectRoomRecordingForSession). Finalize routes to the mounted pad's full commit pipeline (CleanupPad's externalRecording prop, adapted by ThreadAudioTab), or to the controller's fallback commit (raw segment + voicePad draft via features/transcription-cleanup/constants.ts keys) when no pad is mounted. The recorder engine's IndexedDB safety net is untouched.",
      tier: "internal",
    },
    {
      name: "Tile flavors + project association",
      filePath: "features/projects/components/ProjectPicker.tsx",
      description:
        "A tile's flavor (thread | task | project) + project_id FK. PROJECT flavor binds a tile to a ctx_projects row; its Task tab is the project's task list (ThreadProjectTaskList). Surfaces: QuickAddThread (flavor segmented picker + shared ProjectPicker), ThreadAnchorBadge (header marker for task/project tiles), RoomProjectPickerBody (RoomHeader '…' menu → controlled popover: tie the WHOLE room to a project / clear), NewRoomFromProjectDialog (/all: header 'From project' action → createRoomFromProject seeds a project room + tile), ProjectConflictDialog (the per-thread vs keep-room prompt). ProjectPicker is the projects feature's flat searchable picker over useUserProjects; War Room uses its cross-org mode. INVARIANT (see invariant 9): a room and its threads never hold conflicting projects; tasks auto-associate via the app-wide ctx_tasks.project_id (createTileTask stamps selectEffectiveThreadProjectId). Foundation: redux/thunks (checkThreadProjectConflict, convertRoomToPerThreadThunk, setTileProjectThunk, absorbRoomIntoProjectThunk, createRoomFromProject) + selectors (selectThreadPickerOption / selectEffectiveThreadProjectId / selectSessionProjectMode). DB: migrations/ctx_war_room_tiles_flavor_project.sql.",
      tier: "candidate",
    },
    {
      name: "WarRoomContextPicker + ThreadContextOverride",
      filePath: "features/war-room/components/shared/WarRoomContextPicker.tsx",
      description:
        "Per-thread context override (ThreadContextOverride → WarRoomContextPicker). Writes only to war-room/thread records — never appContextSlice. Room header uses ActiveContextLensChip (same as /chat) for global working context.",
      tier: "internal",
    },
    {
      name: "TaskCommentPopover",
      filePath: "features/tasks/components/TaskCommentPopover.tsx",
      description:
        "Reusable task-comment surface (button → popover thread + composer) over the canonical comments primitive (platform.comments via commentsService). Built for War Room; the full task editor can adopt it.",
      tier: "internal",
    },
    {
      name: "HiddenThreadsTray + ParkedThreadChip + NewThread",
      filePath: "features/war-room/components/room/HiddenThreadsTray.tsx",
      description:
        "Grid-mode parked-threads dock. ParkedThreadChip carries a live status trio and restores-and-stages on click (hidden ≠ gone). NewThread is the always-present add affordance (card + rail shapes) that auto-stages the fresh thread.",
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
    {
      name: "warRoomWatch",
      filePath: "features/war-room/redux/watchSlice.ts",
      description:
        "Ephemeral UI for the master agent's live-watch layer: openConversationIds + openWatch/closeWatch/closeAllWatches. Driven by the war-room-master-tools messaging tool + the toast 'Watch' action; consumed by MasterWatchLayer. Nothing persisted.",
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
      name: "Scribe Agent+ / Agents",
      adminUrl: "/agents/admin",
      description:
        "The Agent tab REUSES the real Scribe Agent+ components (features/transcript-studio/components/scribe/*) + hooks (useStudioAssistant / useAutoVoiceResponse / useWorkingDocumentDraft), keyed by the tile's studio_sessions id — nothing reimplemented. The assistant conversation, working-document ctx_patch loop, and the agents execution + TTS graph all come from the existing Scribe/agents stack.",
    },
    {
      name: "Files / Documents",
      description:
        "The Files tab links cld_files (upload via folderForWarRoomThread or pick existing) and udt_documents (createDocument / listAccessibleDocuments → /documents/[id]) via the polymorphic ctx_war_room_tile_attachments table. Reuses @/features/files (requestUpload/openFilePicker/InlineMediaRef) + data-tables document-service — no upload/pick/doc-edit reimplemented.",
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
