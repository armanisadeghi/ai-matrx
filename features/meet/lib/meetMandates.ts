// features/meet/lib/meetMandates.ts
//
// THE FOUR JOBS `@ai-matrx/meet` runs inside a meeting, named once.
//
// 🚨 NO AGENT UUIDs IN CODE. `MeetAgents` (package 0.2.0) is host-injected
// identity: every field is a DATABASE row id. An agent's definition lives in
// the database and the codebase is only the connection, so this file names the
// JOB and the platform decides who fulfils it — exactly the shape
// `features/messaging/lib/messagingMandates.ts` already uses for the four
// conversation intelligences.
//
// 🚨 THESE MANDATE DEFINITIONS DO NOT EXIST YET (verified against
// `mandate.definition` on Matrx Main, 2026-09-08: zero `meet.*` rows). They are
// declared server-side in aidream `services/mandates/client_mandates.py`, and
// that declaration belongs to register item **MRI-A5**, which also removes
// `MeetAgents` from the package in 0.3.0 in favour of server-owned mandate keys.
// Until then every key here REFUSES, the identity map stays empty, and the
// package renders no meeting-assistant control at all — an absent affordance,
// never a dead button, and never a hardcoded id standing in.
//
// This module is deliberately leaf and UI-free.

/** The package's `MeetAgents` capability → the platform Mandate that fulfils it. */
export const MEET_MANDATE_KEYS = {
  noteTaker: "meet.note_taker",
  liveIntelligence: "meet.live_intelligence",
  summary: "meet.meeting_summary",
  actionItems: "meet.action_items",
} as const;

export type MeetCapability = keyof typeof MEET_MANDATE_KEYS;

export const MEET_MANDATE_KEY_LIST: readonly string[] = Object.values(
  MEET_MANDATE_KEYS,
);
