// Lane HR-360 (2026-10-08) — an .ics event can carry a reminder (VALARM) N minutes before it
// starts; the 360 review uses it for its reminder-lead-days knob. Red before: no VALARM ever.
import { icsContent } from "./eventLinks";

const event = {
  uid: "review-360-94eb733b",
  title: "Complete your review",
  start: "2026-10-22T17:00:00.000Z",
  end: "2026-10-22T17:30:00.000Z",
};

it("writes a display alarm the given minutes before the start", () => {
  const ics = icsContent({ ...event, alarmMinutesBefore: 3 * 24 * 60 });
  expect(ics).toContain("BEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Complete your review\r\nTRIGGER:-PT4320M\r\nEND:VALARM");
});

it("writes no alarm when none is asked for", () => {
  expect(icsContent(event)).not.toContain("VALARM");
});
