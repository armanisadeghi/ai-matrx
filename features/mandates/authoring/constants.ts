// features/agents/mandates/authoring/constants.ts
//
// The automation mandates the authoring surfaces run BY KEY — mandates all the
// way down: the button that refines a mandate's goal is itself a mandate, so
// Arman (or anyone) creates/rebinds it with zero code changes. Until the key
// resolves, the affordance renders honestly disabled naming the missing key.
//
// These are placeholder keys — Arman names the real ones when he creates them;
// changing a constant here is the entire wiring.

/** Rewrites a draft goal into the tight, condensed form (GOAL section). */
export const GOAL_WRITER_MANDATE_KEY = "mandates.goal_writer";

/** Converts descriptive draft inputs into a formal structure (INPUT section). */
export const KIND_CONVERTER_MANDATE_KEY = "mandates.kind_converter";
