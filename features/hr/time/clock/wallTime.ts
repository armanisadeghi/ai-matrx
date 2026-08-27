/**
 * features/hr/time/clock/wallTime.ts — turning a wall-clock date and time into an instant, in a
 * named zone.
 *
 * 🚨 **THE ZONE IS THE EMPLOYMENT'S, NEVER THE BROWSER'S.** A manager in New York back-dating a
 * punch for a California employee types *"Tuesday, 8:00 AM"* and means California's Tuesday 8am.
 * Building that instant from the operator's own zone lands it at 5:00 AM local — three hours out,
 * and on the wrong `local_work_date` either side of midnight. `hr.punch_record` resolves
 * `{{JURIS}}` from the instant it is given (`hr._punch_resolve_juris(employment, p_occurred_at)`),
 * so the instant we send *is* the date the punch files under. Getting this wrong does not error; it
 * silently pays someone for the wrong day.
 *
 * 🚨 **NO ARITHMETIC HAPPENS HERE, DELIBERATELY.** There is no `.getTime()` subtraction, no offset
 * maths, no DST branching of our own. `Intl` is asked for the zone's offset *at that moment* and the
 * offset is pasted into an ISO string the runtime parses. That matters twice over: it keeps this
 * file honest against the lane's no-client-arithmetic law (L3-74), and hand-rolled offset maths is
 * exactly how a spring-forward hour gets mis-assigned.
 *
 * The one subtlety, handled explicitly: the offset must be sampled *at the target instant*, which
 * we do not know until we have applied an offset. So the offset is sampled once against a naive
 * guess, applied, then re-sampled — and if the second sample differs (the guess straddled a DST
 * boundary) the second one wins. Two samples settle every real zone transition.
 */

/** The zone's UTC offset at a given instant, as `+HH:MM` / `-HH:MM` — the shape ISO 8601 parses. */
function zoneOffsetAt(instant: Date, timeZone: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(instant)
    .find((part) => part.type === "timeZoneName")?.value;

  // `longOffset` yields "GMT-07:00", and plain "GMT" at exactly zero.
  const offset = (name ?? "GMT").replace("GMT", "").trim();
  return offset === "" ? "+00:00" : offset;
}

/**
 * `2026-08-20` + `08:00` + `America/Los_Angeles` → the ISO instant that wall time names.
 *
 * Returns `null` when the pieces do not form a real moment, rather than a silently wrong one — a
 * caller must not be able to file a punch against `Invalid Date`.
 */
export function localWallTimeToInstant(
  localDate: string,
  localTime: string,
  timeZone: string,
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}$/.test(localTime)) return null;

  const naive = new Date(`${localDate}T${localTime}:00Z`);
  if (Number.isNaN(naive.valueOf())) return null;

  const firstOffset = zoneOffsetAt(naive, timeZone);
  const firstTry = new Date(`${localDate}T${localTime}:00${firstOffset}`);
  if (Number.isNaN(firstTry.valueOf())) return null;

  // Re-sample at the instant we actually landed on. Differs only across a DST transition.
  const settledOffset = zoneOffsetAt(firstTry, timeZone);
  if (settledOffset === firstOffset) return firstTry.toISOString();

  const settled = new Date(`${localDate}T${localTime}:00${settledOffset}`);
  return Number.isNaN(settled.valueOf()) ? firstTry.toISOString() : settled.toISOString();
}

/** `2026-08-20` — today's date **in the given zone**, for defaulting the picker. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `14:05` — the current wall time **in the given zone**, for defaulting the picker. */
export function timeNowInZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  // `en-GB` can render midnight as "24"; normalise so the input is always valid.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${hour}:${get("minute")}`;
}
