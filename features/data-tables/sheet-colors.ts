/**
 * THE SHEET PAINTS WITH THE ONE LOOKUP (lane UI-FIX-18, VERIFIER-18 H3).
 *
 * MEASURED 2026-09-24 on production: the Rooms table colored by Status with one rule
 * (*Status is On Hold → Red*) read *Complete* red on the Sheet — the same red as the alarm —
 * and amber on the default grid and every card; Quoting, Planning and In Progress were tinted
 * on the Sheet and plain on the grid. The Sheet's color-by lookup was this app's own
 * (`colorForChoice`: the option's place in the palette); the grid, kanban, calendar and gallery
 * paint with `@ai-matrx/records-ui`'s `colorFromTheValue`.
 *
 * For a RECORD-STORE table the Sheet now paints with records-ui's lookup, and rule precedence
 * is the design system's `resolveRowColor` / `resolveCellColor` — the function records-ui's
 * grid calls. The older store (tables not on the record store) keeps its own option colors.
 *
 * The decorations themselves (Field ids → keys, rule ids) are translated by records-ui's
 * `resolveTableStyle` in `record-store.ts` — the one translation the grid and every card read
 * (lane POST-PUBLISH-FE deleted the Sheet's own copy, `olderStyle`).
 */
import { colorFromTheValue } from "@ai-matrx/records-ui";
import {
  STYLE_COLORS,
  colorForChoice,
  type ChoiceColorLookup,
  type StyleColor,
} from "@ai-matrx/design-system/data-table/table-style";

/** One spelling of a choice, however it was written ("Pending verification" = `pending_verification`). */
function choiceWord(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * THE COLOUR THE COLUMN KEEPS FOR THIS VALUE (DATA-V2-BASICS-2 C1). Coloured by Status, a moved
 * table's "Verified" row (a green chip) was tinted pink: the Sheet hashed the word although every
 * option keeps its owner's colour. The same rule as records-ui's grid (`choiceLooks.ts`
 * `storedChoiceColorLookup`): the option's own colour first, matched by word or label; the hash
 * only for a value whose option keeps none.
 */
function storedChoiceColor(
  choices: readonly { value: string; label?: string; color?: string }[] | undefined,
  value: unknown,
): StyleColor | undefined {
  if (!choices || value === null || value === undefined || value === "") return undefined;
  const word = choiceWord(value);
  if (word === "") return undefined;
  for (const choice of choices) {
    const color = choice.color;
    if (!color || !(STYLE_COLORS as readonly string[]).includes(color)) continue;
    if (choiceWord(choice.value) === word || (choice.label && choiceWord(choice.label) === word)) return color as StyleColor;
  }
  return undefined;
}

/** The color-by lookup the Sheet paints with. */
export function sheetChoiceColorLookup(
  onTheRecordStore: boolean,
  choicesFor: (fieldName: string) => readonly { value: string; label?: string; color?: string }[] | undefined,
): ChoiceColorLookup {
  if (onTheRecordStore) {
    return (fieldName, value) => storedChoiceColor(choicesFor(fieldName), value) ?? colorFromTheValue(fieldName, value);
  }
  return (fieldName, value) => colorForChoice(choicesFor(fieldName), value);
}
