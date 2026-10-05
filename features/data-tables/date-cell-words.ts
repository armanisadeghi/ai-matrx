/**
 * A DATE OR A DATE-AND-TIME A PERSON TYPED INTO THE SHEET, READ ONCE AND STORED THE WAY EVERY GRID
 * STORES IT (grids review 3, 2026-09-30).
 *
 * MEASURED on the Sheet: a date & time typed there was saved as `2026-10-03T12:00` — a wall-clock
 * time with no zone — while the record grids saved the same keystrokes as `2026-10-03T19:00:00.000Z`.
 * One column, two shapes: a reader in another zone moved the first by hours, and a sort or a filter
 * compared words with instants. And `1200PM` typed into a date & time cell saved nothing and said
 * nothing: a key typed before the editor mounted skipped the calendar's reader altogether.
 *
 * THE RULE (the record grids' own, `@ai-matrx/records` `coerceTypedAnswer`): a Date column keeps the
 * DAY that was written (`yyyy-MM-dd`); a Date & time column keeps an ABSOLUTE INSTANT, read in the
 * viewer's own zone (`readTypedDate(…).instant`, an ISO string ending in `Z`). Every Sheet door —
 * the cell's calendar, a key typed before the calendar opened, the row form, a paste, a column's
 * default — reads here, so there is one conversion.
 *
 * A time alone (`1200PM`, `2:30 pm`) typed over a date & time cell that already holds a day keeps
 * that day and takes the new time, as Airtable does. With no day to keep it is refused, with the way
 * to write it — nothing is guessed.
 */
import { readTypedDate, readTypedTime } from "@ai-matrx/records";

export type DateCellKind = "date" | "datetime";

export type DateCellWords =
  | { ok: true; /** What the store keeps: `yyyy-MM-dd`, or an ISO instant, or null for blank. */ stored: string | null }
  | { ok: false; why: string };

const pad = (n: number) => String(n).padStart(2, "0");

/** A local calendar moment as the words the one reader reads (`2026-10-03 14:30`). */
function localWords(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * What a picked or computed moment is stored as — through the SAME reader a typed one goes through,
 * so a calendar pick and typed words can never land in two shapes.
 */
export function storedFromDate(date: Date, kind: DateCellKind): string {
  if (kind === "date") return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const read = readTypedDate(localWords(date), { withTime: true });
  // A Date object's own local fields always read; the fallback is the same instant, said directly.
  return read.ok && read.instant ? read.instant : date.toISOString();
}

/** A stored value as a local moment. Date-only strings are local calendar days, never UTC midnight. */
export function dateFromStored(value: unknown, kind: DateCellKind): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value);
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.slice(0, kind === "date" ? 10 : text.length));
  if (dayOnly) return new Date(Number(dayOnly[1]), Number(dayOnly[2]) - 1, Number(dayOnly[3]));
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Read typed words for a date / date-and-time cell. `current` is what the cell holds now — the day a
 * time typed alone is placed on.
 */
export function readDateCellWords(raw: string, kind: DateCellKind, current?: unknown): DateCellWords {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text === "") return { ok: true, stored: null };
  const read = readTypedDate(text, { withTime: kind === "datetime" });
  if (read.ok) return { ok: true, stored: kind === "datetime" ? read.instant : read.day };
  if (kind === "datetime") {
    const time = readTypedTime(text);
    if (time.ok) {
      const day = dateFromStored(current, kind);
      if (!day) {
        return {
          ok: false,
          why: `“${raw.trim()}” is a time of day, and this cell has no day yet to put it on. Write the day too, like 10/03/2026 ${raw.trim()}.`,
        };
      }
      const [h, m, s] = time.value.split(":").map(Number);
      const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h ?? 0, m ?? 0, s ?? 0);
      return { ok: true, stored: storedFromDate(at, kind) };
    }
  }
  return { ok: false, why: read.why };
}
