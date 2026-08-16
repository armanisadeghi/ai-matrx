/**
 * Platform agents that power the Expertise feature.
 *
 * The Expertise Interviewer is the live-conversation lane of the Expert
 * Distillation System: it reads the pack (including the intake answers from
 * the guided start), interviews the expert with concrete choices, and lands
 * every rule-shaped statement as a DRAFT rule via the server-side
 * `expertise_pack` tool. Server half: aidream
 * `services/expertise_ingest/tools.py` (+ FEATURE.md).
 */
export const EXPERTISE_INTERVIEWER_AGENT_ID =
  "4a0b2f8e-18d0-4ade-8b88-7f5610f1d0c8";
