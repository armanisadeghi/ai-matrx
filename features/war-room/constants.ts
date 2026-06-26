// features/war-room/constants.ts

/** studio_sessions.source value for transcript sessions owned by a War Room thread. */
export const WAR_ROOM_AUDIO_SOURCE = "war_room";

export const DEFAULT_SESSION_TITLE = "New War Room";

/**
 * Reserved section label on `/war-room/all` for threads with no room membership.
 * Not a DB row — orphan = no `thread → war_room` edge.
 */
export const UNASSIGNED_SECTION_LABEL = "Unassigned threads";

// ── War Room agent personas (the 3-tier "brain") ─────────────────────
// Builtin, public `agx_agent` rows authored for War Room. Each persona knows
// its tier role, the read-only board context it receives, and — critically —
// that it can list/read the user's notes, tasks, projects, transcripts, etc.
// via the `data` tool (the personas carry data/data_action/workbook/document +
// context/context_patch in their saved tool set). These are the DEFAULTS each
// tier mints with; the user can switch to any other agent via the tier's
// agent picker (the choice is persisted per tier). Replacing the former
// `AUDIO_ASSISTANT_AGENT_ID` borrow, which had no War Room persona and never
// reached for the user's data.
export const WAR_ROOM_THREAD_AGENT_ID = "3153a326-5e0c-4c31-841d-52e8c5e9c39c";
export const WAR_ROOM_ROOM_AGENT_ID = "7239e128-2a07-4d68-8292-0f530be6f754";
export const WAR_ROOM_MASTER_AGENT_ID = "639af529-62cc-4c8e-a169-6c9bd5215ae7";

// ── Gallery layout tuning (consumed by the generic gallery engine) ───
export const GALLERY_GAP_PX = 12;
export const GALLERY_MIN_THREAD = { width: 300, height: 220 };
export const GALLERY_TARGET_ASPECT = 4 / 3;
