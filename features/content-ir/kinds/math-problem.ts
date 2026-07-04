/**
 * math_problem kind → MathProblemBlock / MathProblem bridge.
 *
 * Successor to the legacy `{ math_problem: { ... } }` root-key detection.
 * The kind's authored shape is FLAT (the inner object's fields, plus child
 * kinds for the arrays-of-objects):
 *
 *   { __kind:"math_problem", title, problem_statement: { text, equation,
 *     instruction }, solutions: [ { __kind:"math_solution", task, steps: [
 *       { __kind:"math_solution_step", title, equation, ... } ],
 *       solutionAnswer, ... } ], hint?, resources?, ... }
 *
 * MathProblemArtifact consumes the WRAPPED payload (`payload.math_problem`
 * spread in canvas mode; `problemData={payload}` inline), so the bridge
 * re-wraps the reconstructed zero-loss value under the legacy root key.
 * No legacy parser exists for this type — the artifact uses a plain JSON
 * parse — so the wrap is the whole bridge.
 */

import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";

export const mathProblemServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "math_problem",
  (value) => {
    if (!isRecord(value.problem_statement) || !Array.isArray(value.solutions)) {
      return undefined;
    }
    return { math_problem: value };
  },
);
