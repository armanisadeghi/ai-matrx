// features/war-room/constants.ts

/** studio_sessions.source value for transcript sessions owned by a War Room thread. */
export const WAR_ROOM_AUDIO_SOURCE = "war_room";

export const DEFAULT_SESSION_TITLE = "New War Room";

/**
 * Reserved section label on `/war-room/all` for threads with no room membership.
 * Not a DB row — orphan = no `thread → war_room` edge.
 */
export const UNASSIGNED_SECTION_LABEL = "Unassigned threads";

// ── War Room agent personas (the 3-tier "brain") — AGENT SLOTS ───────
//
// Each tier's default persona is an AGENT SLOT, not a hardcoded id (SoR
// /Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md; client
// half `features/agents/slots/`). The slot's system default is the builtin
// War Room persona — an agent that knows its tier role, the read-only board
// context it receives, and that it can list/read the user's notes, tasks,
// projects and transcripts via the `data` tool. Admins repin the slot at
// /administration/agents/slots; a user overrides it for themselves at
// /agents/slots or from the SlotAgentPicker in the tier's header.
//
// THE PERSISTED-ID DOCTRINE (why this migration needed care):
//   1. A slot resolves what a NEW conversation is CREATED with. It never
//      rewrites an id already persisted.
//   2. A persisted agent id ALWAYS wins: a `conversation → room/thread` edge's
//      `metadata.agentId`, and the master tier's localStorage roster
//      (`war-room:master-conversation:<userId>:roster`, keyed by agent id) are
//      historical records of which agent a conversation was born with. Binding
//      an existing conversation reads that stored id and never consults the
//      slot — so every chat created under the old hardcoded ids keeps working
//      untouched, and a newly-resolved slot cannot orphan an existing edge.
//   3. Resolution failure is LOUD, never a fallback to a hardcoded id: the
//      affordance that would MINT a conversation is disabled and the message
//      surfaces (reportWarRoomError); existing conversations are unaffected
//      because they never needed the slot.
export const WAR_ROOM_THREAD_AGENT_SLOT = "war_room.thread";
export const WAR_ROOM_ROOM_AGENT_SLOT = "war_room.room";
export const WAR_ROOM_MASTER_AGENT_SLOT = "war_room.master";

// ── Gallery layout tuning (consumed by the generic gallery engine) ───
export const GALLERY_GAP_PX = 12;
export const GALLERY_MIN_THREAD = { width: 300, height: 220 };
export const GALLERY_TARGET_ASPECT = 4 / 3;
