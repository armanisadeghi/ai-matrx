/**
 * The one line an empty run tells the person to do.
 *
 * A SCREEN NEVER POINTS AT SOMETHING THAT ISN'T THERE (jobs-bar-2026-09-16,
 * item 4) — and never at the wrong thing. "Type a message below to start."
 * was printed for form-driven agents too (the feedback-triage agents,
 * 2026-09-23), whose run is filling a form, not writing a message. When the
 * agent's variables define a form, the line says so; otherwise the composer is
 * the only thing that is always there.
 */
export const FILL_FORM_INSTRUCTION = "Fill in the fields below and run.";
export const TYPE_MESSAGE_INSTRUCTION = "Type a message below to start.";

export function emptyStateInstruction({
  formFieldCount,
  hasDescription,
}: {
  formFieldCount: number;
  hasDescription: boolean;
}): string | null {
  if (formFieldCount > 0) return FILL_FORM_INSTRUCTION;
  return hasDescription ? null : TYPE_MESSAGE_INSTRUCTION;
}
