/**
 * What the editor does when its host hands it a NEW `value` (verify-RC-B4 R6-4).
 *
 * The break this guards: under a slow server the host's own save echo arrived
 * while the person was still typing — the host re-sent `value` (the text of the
 * save that just landed), the editor treated it as "a new document", remounted
 * and silently dropped every keystroke typed after Save was pressed. The next
 * save then persisted a copy without that typing.
 *
 * Rules, in order:
 *  - the same value the host last sent → nothing;
 *  - the value is a save the editor made (in flight or just landed) or already
 *    equals the draft → it becomes the stored text; the draft is untouched;
 *  - the draft has unsaved edits → the draft is KEPT, the new value becomes the
 *    stored text the next save diffs against, and the person is told;
 *  - otherwise (nothing unsaved) → the new document opens.
 */
export type HostValueAction = "ignore" | "adopt-stored" | "keep-draft" | "reset";

export function reconcileHostValue(input: {
  value: string;
  /** The value the host sent last time. */
  lastValue: string;
  /** What the editor believes is stored. */
  stored: string;
  /** The person's current text (flushed). */
  draft: string;
  /** Texts this editor has sent to save and not yet seen settle (or just saw settle). */
  ownSaves: ReadonlySet<string>;
}): HostValueAction {
  const { value, lastValue, stored, draft, ownSaves } = input;
  if (value === lastValue) return "ignore";
  if (ownSaves.has(value) || value === draft) return "adopt-stored";
  if (draft !== stored) return "keep-draft";
  return "reset";
}
