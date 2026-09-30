/**
 * THE ONE READER OF A WORD A PERSON TYPED OR PASTED INTO A COLUMN (lane DATA-V2-BASICS-2, 2026-09-29;
 * BREAKER-2 B2-02, B2-03, B2-13, and the default of B2-01).
 *
 * MEASURED on the Sheet: a paste of 15 visits was refused WHOLE for "$30" in Copay ("takes a number, and
 * it was given a string"), then for "Yes" in Insurance Verified, then for "Neck, Shoulder" in a
 * Multi-choice column; a Whole number cell saved "7.5" as 7 without a word; the format parsers read "Yes"
 * as false. Every door that turns a person's words into a stored value — the paste, a column's default,
 * a cell — reads them here, per column type:
 *   · numbers: a currency symbol, commas, a percent sign, brackets or a minus for a negative
 *     (`readTypedNumber`); a Whole number is whole, or it is said;
 *   · a tick box: yes / no, true / false, y / n, 1 / 0, on / off, ✓, x;
 *   · a time of day (`readTypedTime`); a date or a date-and-time that a calendar can read;
 *   · a choice: its own words however they are cased or spaced; several choices (and tags) split on
 *     commas, semicolons and new lines;
 *   · everything else: the column's format, then the words as they are.
 * A word that is none of a choice column's choices is kept as typed here — whether to ADD it is the enum
 * ask's question (`offListChoiceWords`), never this reader's.
 */
import { readTypedNumber, readTypedTime } from "@ai-matrx/records";
import { parseFieldInput, resolveFieldFormat } from "@ai-matrx/design-system/field-formats";
import type { FieldChoice, FieldFormatConfig } from "@ai-matrx/design-system/field-formats";
import { inlineChoices, isChoiceFormat } from "@/lib/field-formats/choices";
import { splitListWords } from "@/lib/field-formats/list-words";

export type CellWordColumn = {
  display_name: string;
  data_type: string;
  metadata?: unknown;
};

export type CellWord = { ok: true; value: unknown } | { ok: false; why: string };

const NUMBER_FORMATS = new Set(["number", "decimal", "currency", "percent", "progress", "duration", "integer", "rating", "file_size"]);
const WHOLE_FORMATS = new Set(["integer", "rating", "file_size"]);
const YES = new Set(["yes", "y", "true", "t", "1", "on", "x", "✓", "✔", "checked", "ticked"]);
const NO = new Set(["no", "n", "false", "f", "0", "off", "unchecked", "unticked", "☐"]);

/** A word as a person reads it: case and runs of spaces do not make two words different. */
export function sameWord(a: string, b: string): boolean {
  return a.trim().replace(/\s+/g, " ").toLocaleLowerCase() === b.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function choiceFor(choices: readonly FieldChoice[], word: string): FieldChoice | undefined {
  return choices.find((c) => sameWord(c.value, word) || (c.label ? sameWord(c.label, word) : false));
}

/** The one reading of a line of words as a list (lib/field-formats/list-words.ts). */
const splitWords = splitListWords;

function formatOf(column: CellWordColumn): FieldFormatConfig {
  return resolveFieldFormat(column.data_type, column.metadata);
}

export function readCellWord(raw: unknown, column: CellWordColumn): CellWord {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw === "string" && raw.trim() === "") return { ok: true, value: null };
  const format = formatOf(column);
  const id = format.id;
  const name = column.display_name;

  // Several choices, and tags: a list, however it arrived.
  if (id === "multi_choice" || id === "tags") {
    const words = Array.isArray(raw) ? raw.map((w) => String(w).trim()).filter(Boolean) : splitWords(String(raw));
    if (id === "tags") return { ok: true, value: words };
    const choices = inlineChoices(format.options);
    return { ok: true, value: words.map((w) => choiceFor(choices, w)?.value ?? w) };
  }
  if (typeof raw !== "string") return { ok: true, value: parseFieldInput(raw, format, column.data_type) };
  const text = raw.trim();

  if (id === "choice") {
    const choice = choiceFor(inlineChoices(format.options), text);
    return { ok: true, value: choice?.value ?? text.replace(/\s+/g, " ") };
  }
  if (id === "boolean" || column.data_type === "boolean") {
    const word = text.toLocaleLowerCase();
    if (YES.has(word)) return { ok: true, value: true };
    if (NO.has(word)) return { ok: true, value: false };
    return { ok: false, why: `${name} is ticked or left unticked, and “${text}” is neither. Write Yes or No.` };
  }
  if (id === "time") {
    const read = readTypedTime(text);
    return read.ok ? { ok: true, value: read.value } : { ok: false, why: `${name} holds a time of day, and ${read.why}` };
  }
  if (NUMBER_FORMATS.has(id) || column.data_type === "number" || column.data_type === "integer") {
    // Words after the digits are not a number ("12abc" is not 12); a percent sign or a currency symbol is.
    const tail = text.replace(/^[^\d]*[\d.,\s]*\d/, "");
    if (/[^\s%$€£¥)]/.test(tail)) {
      return { ok: false, why: `${name} holds a number, and “${text}” is not one. Write digits, like 1,250.50.` };
    }
    const read = readTypedNumber(text);
    if (!read.ok) return { ok: false, why: `${name} holds a number, and ${read.why}` };
    const whole = WHOLE_FORMATS.has(id) || column.data_type === "integer";
    if (whole && !Number.isInteger(read.value)) {
      return { ok: false, why: `${name} holds whole numbers, and “${text}” is not one. Write ${Math.round(read.value)} or change the column to Number.` };
    }
    if (!Number.isSafeInteger(Math.trunc(read.value)) && Math.abs(read.value) >= 1) {
      return { ok: false, why: `“${text}” is too large a number for ${name} to keep exactly.` };
    }
    return { ok: true, value: read.value };
  }
  if (id === "date" || id === "datetime" || column.data_type === "date" || column.data_type === "datetime") {
    const time = Date.parse(text);
    if (Number.isNaN(time)) return { ok: false, why: `${name} holds a date, and “${text}” is not one a calendar can read. Write it like 2026-10-12.` };
    return { ok: true, value: parseFieldInput(text, format, column.data_type) };
  }
  return { ok: true, value: parseFieldInput(text, format, column.data_type) };
}

/** The words of a choice value that are none of the column's choices — what the enum ask asks about. */
export function offListChoiceWords(value: unknown, column: CellWordColumn): string[] {
  const format = formatOf(column);
  if (!isChoiceFormat(format.id) || format.id === "person" || format.options?.structuredList?.listId) return [];
  const choices = inlineChoices(format.options);
  const words = (Array.isArray(value) ? value : [value]).map((v) => (v == null ? "" : String(v).trim())).filter(Boolean);
  return [...new Set(words.filter((w) => !choiceFor(choices, w)))];
}

/** Whether the column keeps a word that is none of its choices (Keep as typed). */
export function takesOtherWords(column: CellWordColumn): boolean {
  return formatOf(column).options?.allowOther !== false;
}
