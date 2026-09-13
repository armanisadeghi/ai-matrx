import type { NoteReviewedSaveResult, NoteReviewedSentFields } from "./thunks";

type Saved = Extract<NoteReviewedSaveResult, { status: "physical-saved" }>;
type ContextSettled = Extract<NoteReviewedSaveResult, { status: "context-settled" }>;
type PartialResult = Extract<NoteReviewedSaveResult, { status: "partial" }>;

/** Compile-time contract checks; this function is never called. */
export function reviewedSaveResultTypeChecks(): void {
  // @ts-expect-error A captured successful operation always has an actor.
  const actor: Saved["actorId"] = null;
  // @ts-expect-error A captured successful operation always has an operation ID.
  const operation: Saved["operationId"] = null;
  // @ts-expect-error A physical-saved result cannot contain a failed context field.
  const failures: Saved["receipt"]["failedFields"] = ["project_id"];
  // @ts-expect-error Context-only settlement cannot claim a physical attempt.
  const physical: ContextSettled["attemptedFields"]["physical"] = { content: "draft" };
  // @ts-expect-error Context-only settlement acknowledges a nonempty context attempt.
  const context: ContextSettled["attemptedFields"]["context"] = {};
  // @ts-expect-error A partial result must name at least one failed context field.
  const partialFailures: PartialResult["receipt"]["failedFields"] = [];
  // @ts-expect-error Folder display settlement requires an attempted folder ID.
  const folder: NoteReviewedSentFields = { physical: {}, context: {}, folderName: "Draft" };
  void [actor, operation, failures, physical, context, partialFailures, folder];
}
