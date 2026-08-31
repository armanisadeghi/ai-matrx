// features/mandates/authoring/constants.ts
//
// The automation mandates the authoring surfaces run BY KEY — mandates all the
// way down: the button that refines a mandate's goal is itself a mandate, so
// Arman (or anyone) creates/rebinds it with zero code changes. Until the key
// resolves, the affordance renders honestly disabled naming the missing key.
//
// Arman created the goal writer himself on 2026-08-31 (mandate.goal_writer —
// singular, his key, live, bound, fully mapped); the plural placeholder row is
// soft-deleted. Changing a constant here is the entire wiring.

/** Rewrites a draft goal into the tight, condensed form (GOAL section). */
export const GOAL_WRITER_MANDATE_KEY = "mandate.goal_writer";

/** Converts descriptive draft inputs into a formal structure (INPUT section). */
export const KIND_CONVERTER_MANDATE_KEY = "mandates.kind_converter";
