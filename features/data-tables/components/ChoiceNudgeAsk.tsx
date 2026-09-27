/**
 * THE ENUM NUDGE'S QUESTION ON A GRID CELL (lane CHOICE-COLUMN-EDIT, 2026-09-27).
 *
 * A person typed a word that is none of the column's choices. Nothing is saved yet; the cell asks:
 *
 *     Add "Gemini" to the choices for Account Type?     [Add] [Keep as typed] [Cancel]
 *
 * Add makes it one of the column's choices everywhere and the cell takes it, in one save. Keep as
 * typed saves it in this cell only (an "other" value) and is offered ONLY where the column takes
 * other values. Cancel puts the cell back. Where the organization's knob (`custom/choice_nudge`)
 * says never_add and the column takes no other values, the cell says so and offers Cancel only.
 *
 * Drawn inside the cell's one notice popover (EditableCell's `CellRefusalPopover`), so it is
 * anchored to the cell, portalled out of the table, and never on a timer.
 */
"use client";

import type { GridMove } from "@ai-matrx/design-system/data-table/grid-selection";

export type PendingChoiceAsk = {
  /** The typed words that are none of the column's choices. */
  words: string[];
  /** The column takes other values, so "Keep as typed" may be offered. */
  canKeep: boolean;
  /** Adding is offered (false only when the knob says never_add). */
  canAdd: boolean;
  /** What the editor was committing, as it was handed over. */
  value: unknown;
  move?: GridMove;
};

export function quotedWords(words: readonly string[]): string {
  const q = words.map((w) => `"${w}"`);
  if (q.length <= 1) return q.join("");
  return `${q.slice(0, -1).join(", ")} and ${q[q.length - 1]}`;
}

export function ChoiceNudgeAsk({
  ask,
  columnName,
  onAnswer,
}: {
  ask: PendingChoiceAsk;
  columnName: string;
  onAnswer: (answer: "add" | "keep" | "cancel") => void;
}) {
  const words = quotedWords(ask.words);
  const button = "rounded border px-2 py-0.5 text-xs hover:bg-muted";
  return (
    <div data-matrx-choice-nudge="" className="max-w-[20rem] space-y-1.5 text-left">
      <p className="text-sm text-foreground">
        {ask.canAdd
          ? `Add ${words} to the choices for ${columnName}?`
          : `${words} ${ask.words.length === 1 ? "is" : "are"} not one of the choices for ${columnName}.`}
      </p>
      {!ask.canAdd ? (
        <p className="text-xs text-muted-foreground">
          This organization does not add choices from a cell, and {columnName} takes only its own choices. Pick one of them, or
          add it in the column&rsquo;s settings.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1">
        {ask.canAdd ? (
          <button type="button" className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`} onClick={() => onAnswer("add")}>
            Add
          </button>
        ) : null}
        {ask.canKeep ? (
          <button type="button" className={button} onClick={() => onAnswer("keep")}>
            Keep as typed
          </button>
        ) : null}
        <button type="button" className={button} onClick={() => onAnswer("cancel")}>
          Cancel
        </button>
      </div>
    </div>
  );
}
