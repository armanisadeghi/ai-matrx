import {
  JOIN_INSTRUCTIONS,
  invitationMailto,
  invitationText,
  meetingCalendarEvent,
  type InvitableMeeting,
} from "./invitation";

const link = "https://www.aimatrx.com/meet/952-6de0-d34";

const scheduled: InvitableMeeting = {
  id: "7b1c3d2e-0000-4000-8000-000000000001" as InvitableMeeting["id"],
  title: "Weekly client check-in",
  kind: "scheduled",
  scheduledFor: "2026-09-28T17:00:00.000Z",
  scheduledDurationMinutes: 45,
  endedAt: null,
};

const options = { locale: "en-US", timeZone: "America/Los_Angeles" };

describe("meeting invitation text", () => {
  it("carries the title, the time with its zone and length, the link and how to join", () => {
    const text = invitationText(scheduled, link, options);
    expect(text).toContain('You\'re invited to "Weekly client check-in".');
    expect(text).toContain("When: Monday, September 28, 2026 at 10:00 AM PDT (45 minutes)");
    expect(text).toContain(`Join: ${link}`);
    expect(text).toContain(JOIN_INSTRUCTIONS);
    expect(text).toContain("No account needed");
    expect(text).not.toContain("recurring");
  });

  it("says a recurring meeting reuses the same link", () => {
    const text = invitationText({ ...scheduled, kind: "recurring" }, link, options);
    expect(text).toContain("This is a recurring meeting. The same link works for every session.");
  });

  it("omits the time for an instant meeting instead of inventing one", () => {
    const text = invitationText(
      { ...scheduled, kind: "instant", scheduledFor: null, scheduledDurationMinutes: null },
      link,
      options,
    );
    expect(text).not.toContain("When:");
    expect(text).toContain(`Join: ${link}`);
  });

  it("prefills an email with the subject and the whole invitation", () => {
    const mailto = invitationMailto(scheduled, link, "", options);
    expect(mailto.startsWith("mailto:?")).toBe(true);
    const params = new URLSearchParams(mailto.slice("mailto:?".length));
    expect(params.get("subject")).toBe("Invitation: Weekly client check-in");
    expect(params.get("body")).toBe(invitationText(scheduled, link, options));
    expect(mailto).not.toContain("+");
  });
});

describe("meeting calendar event", () => {
  it("spans the scheduled time and carries the link", () => {
    const event = meetingCalendarEvent(scheduled, link);
    expect(event).not.toBeNull();
    expect(event?.start).toBe("2026-09-28T17:00:00.000Z");
    expect(event?.end).toBe("2026-09-28T17:45:00.000Z");
    expect(event?.location).toBe(link);
    expect(event?.uid).toBe(`meet-${scheduled.id}@aimatrx.com`);
  });

  it("has no calendar event when there is no time, or the meeting ended", () => {
    expect(meetingCalendarEvent({ ...scheduled, scheduledFor: null }, link)).toBeNull();
    expect(meetingCalendarEvent({ ...scheduled, endedAt: "2026-09-28T18:00:00.000Z" }, link)).toBeNull();
  });
});
