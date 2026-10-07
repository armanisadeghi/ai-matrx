// features/spaces/editor/date-mention.ts — "@today", "@tomorrow", "@yesterday" and "@<date>" (N2): what the
// "@" menu offers under Date for what was typed. A date mention stores `{ kind: "date", iso: "YYYY-MM-DD" }`
// (lib/spaces-blocks SpaceMention) and reads, like Notion, as Today / Tomorrow / Yesterday, else the date.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** A typed date: 2026-10-12, 10/12, 10/12/2026, oct 12, october 12 2026, 12 oct. Null when it is none. */
export function parseTypedDate(raw: string, now: Date): Date | null {
  const q = raw.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!q) return null;
  let m = q.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return valid(+m[1], +m[2] - 1, +m[3]);
  m = q.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) return valid(m[3] ? year(+m[3]) : now.getFullYear(), +m[1] - 1, +m[2]);
  m = q.match(/^([a-z]{3,9})\.? (\d{1,2})(?: (\d{4}))?$/) ?? null;
  if (m && monthOf(m[1]) >= 0) return valid(m[3] ? +m[3] : now.getFullYear(), monthOf(m[1]), +m[2]);
  m = q.match(/^(\d{1,2}) ([a-z]{3,9})\.?(?: (\d{4}))?$/);
  if (m && monthOf(m[2]) >= 0) return valid(m[3] ? +m[3] : now.getFullYear(), monthOf(m[2]), +m[1]);
  return null;
}
const year = (y: number) => (y < 100 ? 2000 + y : y);
const monthOf = (w: string) => MONTHS.findIndex((m) => w.startsWith(m) && m.startsWith(w.slice(0, 3)));
function valid(y: number, mo: number, d: number): Date | null {
  const out = new Date(y, mo, d);
  return out.getFullYear() === y && out.getMonth() === mo && out.getDate() === d ? out : null;
}

/** The Date group of the "@" menu for `query`: label shown, and the day it inserts. */
export function dateChoices(query: string, now: Date): Array<{ title: string; iso: string }> {
  const q = query.trim().toLowerCase();
  const named = [
    { title: "Today", iso: isoDay(now) },
    { title: "Tomorrow", iso: isoDay(addDays(now, 1)) },
    { title: "Yesterday", iso: isoDay(addDays(now, -1)) },
  ];
  const typed = parseTypedDate(q, now);
  if (typed) return [{ title: dateWords(isoDay(typed), now), iso: isoDay(typed) }];
  return named.filter((c) => !q || c.title.toLowerCase().startsWith(q));
}

/** How a date mention reads: Today / Tomorrow / Yesterday, else "October 12, 2026". */
export function dateWords(iso: string, now: Date = new Date()): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = isoDay(d);
  if (day === isoDay(now)) return "Today";
  if (day === isoDay(addDays(now, 1))) return "Tomorrow";
  if (day === isoDay(addDays(now, -1))) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
