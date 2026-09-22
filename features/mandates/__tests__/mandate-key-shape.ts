// features/mandates/__tests__/mandate-key-shape.ts
//
// THE SHAPE OF THE THING THAT MUST NEVER BE ON SCREEN — shared by every guard
// in this class so they all agree on what "a dotted mandate key" looks like.
//
// A mandate key is `<namespace>.<name>`: lower snake_case both sides, e.g.
// `masterwork.understudy`, `seo.keyword_classifier`, `agent_apps.auto_create`.
// The pattern deliberately requires snake/lower on BOTH sides so ordinary
// English with a full stop ("the job. Understudy runs it") and file names
// ("report.pdf", two-letter extensions) do not read as keys.

/** Matches a `namespace.name` token in the shape a mandate key takes. */
export const MANDATE_KEY_SHAPE = /\b[a-z][a-z0-9_]{2,}\.[a-z][a-z0-9_]{2,}\b/;

/** True when `text` contains something shaped like a mandate key. */
export function containsMandateKeyShape(text: string): boolean {
  return new RegExp(MANDATE_KEY_SHAPE.source, "g").test(text);
}

/** Every mandate-key-shaped token in `text`, in order. */
export function mandateKeyShapesIn(text: string): string[] {
  return text.match(new RegExp(MANDATE_KEY_SHAPE.source, "g")) ?? [];
}
