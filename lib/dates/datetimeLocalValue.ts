// lib/dates/datetimeLocalValue.ts — a stored value as an <input type="datetime-local"> can show it.
//
// datetime-local takes exactly "YYYY-MM-DDTHH:mm"; anything else draws an EMPTY box, which reads as
// "the value is gone" (lane HANDOVER, 2026-09-27: a patient's "1984-03-12" vanished when its item
// became Date & time). A date-only value is that day at midnight; an ISO timestamp is cut to minutes.
export function datetimeLocalValue(raw: string): string {
  const v = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00`;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v)) return v.slice(0, 16).replace(" ", "T");
  return v;
}
