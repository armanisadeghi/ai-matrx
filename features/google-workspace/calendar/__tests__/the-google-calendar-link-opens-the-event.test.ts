/**
 * 🚨 N15 (VERIFY-U-W1-U-W2) — "OPEN IN GOOGLE CALENDAR" IS THE EVENT'S VIEW, AND
 * THE PAYLOAD SURVIVES ENCODING.
 *
 * Two faults in one three-line function, and the function's own comment named
 * both of the things the code did not do:
 *
 *  1. it built `/r/eventedit/<payload>` — Google's EDIT form — for a record whose
 *     own section says every write is impossible here. The right destination is
 *     the event VIEW, `?eid=<payload>`, which is the documented spelling the
 *     comment already claimed;
 *  2. it used plain base64, so any payload whose encoding contains `+` or `/`
 *     produced a URL Google cannot decode: in a query string `+` IS a space, and
 *     `/` ends a path segment. base64url (`-`, `_`, no padding) is the encoding
 *     that spelling requires.
 *
 * Both are asserted on ids chosen to produce those characters, because eight
 * realistic ids happened not to (the verifier's own probe found zero of eight) —
 * which is exactly how this shipped.
 */

import { googleCalendarHref } from "../record";
import { calendarEventRow } from "./fixtures";

function payloadOf(href: string): string {
  const match = /\?eid=([^&]+)$/.exec(href);
  if (!match) throw new Error(`no eid= payload in ${href}`);
  return match[1];
}

function decode(payload: string): string {
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

test("the link is the event's VIEW, never Google's edit form", () => {
  const href = googleCalendarHref(calendarEventRow());
  expect(href).not.toBeNull();
  expect(href).toContain("https://calendar.google.com/calendar/u/0/r/event?eid=");
  expect(href).not.toContain("eventedit");
});

test("the payload is the documented pair, and `primary` is left to Google to resolve", () => {
  // `primary` is not a calendar id Google would accept in the payload; the
  // connected account's own calendar is what it resolves without one.
  expect(decode(payloadOf(googleCalendarHref(calendarEventRow())!))).toBe("google-event-1");
  const shared = calendarEventRow({
    external_id: "google-event-2",
    calendar_id: "team@clinic.com",
  });
  expect(decode(payloadOf(googleCalendarHref(shared)!))).toBe("google-event-2 team@clinic.com");
});

test("an id whose base64 carries `+` or `/` is base64url — the URL is not corrupted", () => {
  // Chosen for their encodings, not their looks: "abc??>" base64-encodes with a
  // `+` and "evt_ÿþ" with a `/`.
  for (const externalId of ["abc??>", "evt_ÿþ", "ev??0"]) {
    const href = googleCalendarHref(
      calendarEventRow({ external_id: externalId, calendar_id: "cal>?1" }),
    );
    const payload = payloadOf(href!);
    expect(payload).not.toContain("+");
    expect(payload).not.toContain("/");
    expect(payload).not.toContain("=");
    // And it still round-trips to the exact pair Google is being asked about.
    expect(decode(payload)).toBe(`${externalId} cal>?1`);
  }
});

test("an event with no Google id gets no door at all, rather than a broken one", () => {
  expect(googleCalendarHref(calendarEventRow({ external_id: "" }))).toBeNull();
});
