/**
 * The exact instant as ISO-8601 WITH the local UTC offset, e.g.
 * `2026-09-28T10:04:05.678-07:00`. `toISOString()` names the same instant but in
 * UTC (`Z`), which throws away the person's local day — an agent told "now" must
 * know both the instant and the offset it is read in.
 */
export function isoInstantWithOffset(date: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(Math.trunc(Math.abs(n))).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(offsetMinutes / 60)}:${pad(offsetMinutes % 60)}`
  );
}
