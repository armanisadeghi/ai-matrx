import {
  endFromDuration,
  googleCalendarUrl,
  icsContent,
  icsFileName,
  outlookCalendarUrl,
  outlookWebSupports,
  toCalendarUtc,
  type CalendarEvent,
} from "./eventLinks";

const event: CalendarEvent = {
  uid: "meet-7b1c@aimatrx.com",
  title: "Weekly client check-in",
  start: "2026-09-28T17:00:00.000Z",
  end: "2026-09-28T17:30:00.000Z",
  description:
    "Join: https://www.aimatrx.com/meet/952-6de0-d34\nNo account needed, just your name; bring notes.",
  location: "https://www.aimatrx.com/meet/952-6de0-d34",
  url: "https://www.aimatrx.com/meet/952-6de0-d34",
};

describe("calendar event links", () => {
  it("writes times in compact UTC", () => {
    expect(toCalendarUtc("2026-09-28T10:00:00-07:00")).toBe("20260928T170000Z");
    expect(() => toCalendarUtc("not a date")).toThrow(/not a valid date/);
  });

  it("derives an end from a duration, defaulting to 30 minutes", () => {
    expect(endFromDuration(event.start, 45)).toBe("2026-09-28T17:45:00.000Z");
    expect(endFromDuration(event.start, null)).toBe("2026-09-28T17:30:00.000Z");
  });

  it("builds a Google Calendar template link carrying title, times, details and location", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Weekly client check-in");
    expect(url.searchParams.get("dates")).toBe(
      "20260928T170000Z/20260928T173000Z",
    );
    expect(url.searchParams.get("details")).toContain("No account needed");
    expect(url.searchParams.get("location")).toBe(event.location);
  });

  it("builds an Outlook compose link", () => {
    const url = new URL(outlookCalendarUrl(event));
    expect(url.hostname).toBe("outlook.live.com");
    expect(url.searchParams.get("subject")).toBe("Weekly client check-in");
    expect(url.searchParams.get("startdt")).toBe(event.start);
    expect(url.searchParams.get("enddt")).toBe(event.end);
  });

  it("writes a valid, escaped, folded .ics", () => {
    const ics = icsContent(event, new Date("2026-09-27T12:00:00.000Z"));
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(ics).toContain("DTSTART:20260928T170000Z\r\n");
    expect(ics).toContain("DTEND:20260928T173000Z\r\n");
    expect(ics).toContain("DTSTAMP:20260927T120000Z\r\n");
    expect(ics).toContain("SUMMARY:Weekly client check-in\r\n");
    // Newline, comma and semicolon are escaped per RFC 5545.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(
      "DESCRIPTION:Join: https://www.aimatrx.com/meet/952-6de0-d34\\nNo account needed\\, just your name\\; bring notes.",
    );
    // No physical line exceeds 75 octets.
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("names the file after the event", () => {
    expect(icsFileName("Weekly client check-in")).toBe(
      "weekly-client-check-in.ics",
    );
    expect(icsFileName("!!!")).toBe("event.ics");
  });
});

describe("a repeating event", () => {
  const series: CalendarEvent = {
    ...event,
    start: "2026-10-06T17:00:00.000Z",
    end: "2026-10-06T17:30:00.000Z",
    rrule: "FREQ=WEEKLY;BYDAY=TU;UNTIL=20261222",
    timeZone: "America/Los_Angeles",
  };

  it("hands Google the rule and the zone it expands in", () => {
    const url = new URL(googleCalendarUrl(series));
    expect(url.searchParams.get("recur")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261222T235959Z",
    );
    expect(url.searchParams.get("ctz")).toBe("America/Los_Angeles");
  });

  it("writes the .ics in the meeting's zone with the RRULE, so 10:00 survives DST", () => {
    const ics = icsContent(series, new Date("2026-09-27T12:00:00.000Z"));
    expect(ics).toContain(
      "DTSTART;TZID=America/Los_Angeles:20261006T100000\r\n",
    );
    expect(ics).toContain("DTEND;TZID=America/Los_Angeles:20261006T103000\r\n");
    expect(ics).toContain(
      "RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261222T235959Z\r\n",
    );
    expect(ics).not.toContain("DTSTART:2026");
  });

  it("tells the panel Outlook on the web cannot carry a series", () => {
    expect(outlookWebSupports(series)).toBe(false);
    expect(outlookWebSupports(event)).toBe(true);
  });

  it("keeps a one-off event in UTC with no rule", () => {
    const ics = icsContent(event, new Date("2026-09-27T12:00:00.000Z"));
    expect(ics).toContain("DTSTART:20260928T170000Z");
    expect(ics).not.toContain("RRULE");
    expect(
      new URL(googleCalendarUrl(event)).searchParams.get("recur"),
    ).toBeNull();
  });
});
