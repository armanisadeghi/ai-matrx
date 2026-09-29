import { linkSentence, scheduleLabel } from "./meeting-status-copy";

const series = {
  cancelledAt: null,
  lobbyEnabled: true,
  recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
};

describe("meeting status copy", () => {
  it("a cancelled meeting promises no next time and no way in (verifier, 2026-09-29)", () => {
    const cancelled = { ...series, cancelledAt: "2026-09-29T20:00:00.000Z" };
    expect(scheduleLabel(cancelled, false)).toBe("Was scheduled for: ");
    expect(scheduleLabel(cancelled, true)).toBe("Was scheduled for: ");
    const sentence = linkSentence(cancelled);
    expect(sentence).not.toMatch(/can ask to join|can join\.|every occurrence/);
    expect(sentence).toContain("nobody can join a cancelled meeting");
  });

  it("a live series keeps Next and the lobby sentence", () => {
    expect(scheduleLabel(series, false)).toBe("Next: ");
    expect(scheduleLabel(series, true)).toBe("This occurrence: ");
    expect(linkSentence(series)).toBe(
      "Anyone with the link can ask to join; invited people come straight in. The same link works for every occurrence.",
    );
    expect(scheduleLabel({ ...series, recurrenceRule: null }, false)).toBeNull();
    expect(linkSentence({ ...series, lobbyEnabled: false, recurrenceRule: null })).toBe(
      "Anyone with the link can join.",
    );
  });
});
