/**
 * THE ONE placeholder for a variable input.
 *
 * Until 2026-09-16 every variable textarea in the platform rendered
 * `Enter ${label.toLowerCase()}... (hover for voice input)`, which produced two
 * defects on every AI surface a non-technical Expert actually meets — the
 * Masterwork run box, the Encore run page, the Understudy card:
 *
 *  1. The label is ALREADY rendered directly above the field, so the
 *     placeholder just said it again — and said it ungrammatically whenever the
 *     label was a question. The live Understudy card read:
 *       label:       "What do you need done? (the job, the audience, the goal)"
 *       placeholder: "Enter what do you need done? (the job, the audience, the goal)..."
 *
 *  2. "(hover for voice input)" is a LIE on touch. `ProTextarea` pins its voice
 *     controls permanently visible under `pointer-coarse` — there is no hover to
 *     do. A screen is absent or honest, never instructing a gesture the device
 *     does not have.
 *
 * So: the placeholder invites an answer and never restates the label. It does
 * not try to be clever about whether a label is visible either: `hideLabel` on
 * `VariableInputComponent` means "the HOST draws the label", not "nothing
 * identifies this box", and a first pass at this put the field's Title-Cased
 * name back into the placeholder under its own visible label on the Encore run
 * page. One sentence, everywhere.
 */
export function variableInputPlaceholder(): string {
  return "Type your answer";
}
