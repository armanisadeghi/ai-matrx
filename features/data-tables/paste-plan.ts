/**
 * WHAT A PASTE WILL WRITE, CELL BY CELL (lane DATA-V2-BASICS-2; BREAKER-2 B2-02, B2-03).
 *
 * MEASURED: a paste of 15 visits was refused WHOLE — nothing saved — for "$30" in Copay, then for "Yes"
 * in Insurance Verified, then for "Neck, Shoulder" in a Multi-choice column; each retry found the next
 * column. Now every pasted cell is read by the column's own reader (`readCellWord`), and the batch never
 * fails whole:
 *   · a cell that reads is written as its column keeps it ("$30" → 30, "Yes" → ticked, "neck, knee" →
 *     the two choices);
 *   · a cell that cannot be read is left empty and named, by row and column, with the reason — the rest
 *     of its row is still pasted;
 *   · words that are none of a choice column's choices are gathered, for the whole paste, into ONE
 *     question (the enum ask): add them all, keep them as typed where the column takes other words, or
 *     leave them out.
 */
import { offListChoiceWords, readCellWord, takesOtherWords, type CellWordColumn } from "./cell-word";

export type PasteColumn = CellWordColumn & { field_name: string };

export type PastePlan = {
  rows: Array<{ row: number; data: Record<string, unknown> }>;
  /** Cells left empty because they could not be read: row is 1-based, as a person counts pasted rows. */
  unreadable: Array<{ row: number; column: string; why: string }>;
  /** The paste's new choice words, per column — the one question. */
  newWords: Array<{ field_name: string; display_name: string; words: string[]; canKeep: boolean }>;
};

export function planPaste(
  rows: ReadonlyArray<{ index: number; cells: Record<string, unknown> }>,
  columns: ReadonlyArray<{ sourceHeader: string; field: PasteColumn }>,
): PastePlan {
  const unreadable: PastePlan["unreadable"] = [];
  const words = new Map<string, { field: PasteColumn; words: Set<string> }>();
  const planned = rows.map(({ index, cells }) => {
    const data: Record<string, unknown> = {};
    for (const { sourceHeader, field } of columns) {
      const read = readCellWord(cells[sourceHeader], field);
      if (!read.ok) {
        unreadable.push({ row: index + 1, column: field.display_name, why: read.why });
        continue;
      }
      if (read.value === null) continue;
      data[field.field_name] = read.value;
      const off = offListChoiceWords(read.value, field);
      if (off.length > 0) {
        const held = words.get(field.field_name) ?? { field, words: new Set<string>() };
        for (const w of off) held.words.add(w);
        words.set(field.field_name, held);
      }
    }
    return { row: index + 1, data };
  });
  return {
    rows: planned,
    unreadable,
    newWords: [...words.values()].map(({ field, words: w }) => ({
      field_name: field.field_name,
      display_name: field.display_name,
      words: [...w],
      canKeep: takesOtherWords(field),
    })),
  };
}

/**
 * The answer to the one question. "add" and "keep" write the words as they are (Add has added them to
 * the choices first); "leave" takes the new words out of their cells — a several-choice cell keeps its
 * known choices, a one-choice cell is left empty.
 */
export function answerNewWords(plan: PastePlan, answer: "add" | "keep" | "leave"): PastePlan["rows"] {
  if (answer !== "leave" || plan.newWords.length === 0) return plan.rows;
  const unknown = new Map(plan.newWords.map((n) => [n.field_name, new Set(n.words)]));
  return plan.rows.map(({ row, data }) => {
    const next: Record<string, unknown> = { ...data };
    for (const [name, words] of unknown) {
      const value = next[name];
      if (Array.isArray(value)) {
        const kept = value.filter((v) => !words.has(String(v)));
        if (kept.length > 0) next[name] = kept;
        else delete next[name];
      } else if (value !== undefined && words.has(String(value))) {
        delete next[name];
      }
    }
    return { row, data: next };
  });
}
