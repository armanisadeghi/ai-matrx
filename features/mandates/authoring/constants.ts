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

import { dbAuthoredMandateKey } from "@/features/mandates/mandate-key";

/**
 * Both keys are DB-authored, not declared in aidream, so the generated union
 * cannot carry them and `scripts/mandate-keys-allowlist.json` records why for
 * each. `dbAuthoredMandateKey` is the ONE typed door for exactly that case —
 * the constants stay real keys the carriers accept, and nothing here is typed
 * `string` (V-L6a, 2026-09-17).
 */

/** Rewrites a draft goal into the tight, condensed form (GOAL section). */
export const GOAL_WRITER_MANDATE_KEY =
  dbAuthoredMandateKey("mandate.goal_writer");

/** Converts descriptive draft inputs into a formal structure (INPUT section). */
export const KIND_CONVERTER_MANDATE_KEY =
  dbAuthoredMandateKey("mandates.kind_converter");
