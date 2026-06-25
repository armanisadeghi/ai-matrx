// features/war-room/constants.ts

/** studio_sessions.source value for transcript sessions owned by a War Room tile. */
export const WAR_ROOM_AUDIO_SOURCE = "war_room";

export const DEFAULT_SESSION_TITLE = "New War Room";

/**
 * Reserved title of the per-user "Unassigned threads" HOLDING ROOM. A thread
 * removed from a room lands here (its session_id repoints to this room) until
 * moved into another — a render-path-safe holding area that works with the
 * session_id-keyed gallery, no NULL session_id, no schema change. Identified by
 * this exact title (the war-room base tables are currently views from an
 * in-flight changeover; a title marker is robust to view regeneration where a
 * new column would not be). One get-or-create'd per user.
 */
export const UNASSIGNED_ROOM_TITLE = "Unassigned threads";

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
export const GALLERY_MIN_TILE = { width: 300, height: 220 };
export const GALLERY_TARGET_ASPECT = 4 / 3;
