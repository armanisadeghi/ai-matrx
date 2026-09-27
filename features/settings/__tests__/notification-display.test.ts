import {
  notificationArea,
  notificationAreaLabel,
  personFacingEventDescription,
} from "../notification-display";

// Settings › Notifications printed the catalog's engineering specs to people
// ("Mandatory notice (SPEC-NOTIFICATIONS ⚖)…", "The frozen audience snapshot",
// seen live 2026-09-27). Spec text must never reach the screen.
describe("what a person reads about a notification", () => {
  it.each([
    "Fires when an announcement reaches published. Audience: The frozen audience snapshot.",
    "Fires when a corrective action awaits employee acknowledgment. Audience: The employee. Mandatory notice (SPEC-NOTIFICATIONS ⚖): a recipient may change which channel carries it, never reduce it to none.",
    "One text your Personal Staff — or you, through the `send_text` tool — sends to your own phone.",
    "NOT SUPPRESSIBLE. A refusal is as much the subject's business as a grant.",
    "Fires when a case is escalated. 🚨 The audience is computed AFTER hr.incident_excluded.",
  ])("hides spec text: %s", (text) => {
    expect(personFacingEventDescription(text)).toBeNull();
  });

  it("keeps a description written for a person", () => {
    expect(personFacingEventDescription("A meeting you are in starts soon.")).toBe(
      "A meeting you are in starts soon.",
    );
  });

  it("groups by the first key segment with a human heading", () => {
    expect(notificationArea("hr.leave.case_pto_exhausted")).toBe("hr");
    expect(notificationAreaLabel("esign")).toBe("Signatures");
    expect(notificationAreaLabel("new_area")).toBe("New area");
  });
});
