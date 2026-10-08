/**
 * HOST RE-EXPORT ONLY — the read gate lives in `@ai-matrx/design-system` (moved whole, chat host-slot
 * batch 2, 2026-10-08). 150+ files import this path; they move to the package in the next codemod.
 */
export {
  ReadGate,
  ReadEmpty,
  ReadStaleNotice,
  readOf,
  readStatusOf,
  type ReadOutcome,
  type ReadStatus,
} from "@ai-matrx/design-system";
