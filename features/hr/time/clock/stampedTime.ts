/**
 * features/hr/time/clock/stampedTime.ts — rendering an instant in the zone it was STAMPED in.
 *
 * 🚨 SPEC-TIME §9 rule 1, binding: **every timestamp renders in the punch's stamped `tz`, not the
 * viewer's browser timezone.** When the two differ the zone abbreviation is shown beside the time
 * (`5:58 AM PDT`). *A manager in New York reviewing a California punch must see California time, or
 * they will approve the wrong day.*
 *
 * 🚨 NO ARITHMETIC HAPPENS IN THIS FILE. `Intl` does all of the zone work. Nothing here subtracts,
 * adds or compares two instants — a client that does date math to render time is how a
 * spring-forward night shift renders as 8 hours when it was 7 (§9 rule 2, L3-74).
 */

/** `5:58 AM` in the stamped zone. */
export function formatStampedTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** `Tue, Mar 17` in the stamped zone. */
export function formatStampedDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** The zone's short name at that instant — `PDT`, not `PST`, in July. */
export function stampedZoneAbbreviation(iso: string, tz: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

/** The viewer's own IANA zone, or `UTC` where the runtime will not say. */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/**
 * `5:58 AM PDT` when the stamped zone differs from the viewer's, `5:58 AM` when it does not.
 * The abbreviation is not decoration — it is the only thing telling a remote reviewer that the
 * number on screen is not their own wall clock.
 */
export function formatStampedTimeWithZone(iso: string, tz: string): string {
  const time = formatStampedTime(iso, tz);
  if (tz === viewerTimeZone()) return time;
  return `${time} ${stampedZoneAbbreviation(iso, tz)}`;
}

/**
 * The sentence a surface shows when the punch's zone is not the reader's — stated in words rather
 * than left to an abbreviation nobody reads.
 */
export function crossZoneNotice(tz: string): string | null {
  const viewer = viewerTimeZone();
  if (tz === viewer) return null;
  return `Times below are in ${tz.replace(/_/g, " ")}, where this work is recorded — not your own time zone.`;
}
