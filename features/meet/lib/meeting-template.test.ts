import {
  applyTemplate,
  parseTemplateList,
  resolveTitle,
  withTemplate,
  withoutTemplate,
  type MeetingTemplate,
} from "@/features/meet/lib/meeting-template";
import { emptyDraft } from "@/features/meet/lib/meeting-draft";

const SALES: MeetingTemplate = {
  id: "tpl_sales",
  name: "Sales discovery call",
  title: "Discovery — {date}",
  durationMinutes: 45,
  agenda: "1. Their goals\n2. Budget and timing",
  recurrenceRule: null,
  settings: { aiEnabled: true, recordingPolicy: "always-on" },
  guests: [{ userId: null, email: "sam@us.com", name: "Sam", cohost: true }],
  afterWorkflows: ["wf-crm-update"],
  savedAt: "2026-09-27T00:00:00Z",
};

describe("meeting templates", () => {
  it("keeps only real templates from a stored list", () => {
    const list = parseTemplateList([
      SALES,
      { id: "x" },
      "junk",
      {
        ...SALES,
        id: "tpl_b",
        name: "Bad",
        settings: { recordingPolicy: "sometimes" },
        guests: [{ name: "nobody" }],
      },
    ]);
    expect(list.map((t) => t.id)).toEqual(["tpl_sales", "tpl_b"]);
    expect(list[1]!.settings).toEqual({});
    expect(list[1]!.guests).toEqual([]);
    expect(parseTemplateList(null)).toEqual([]);
  });

  it("pours a template into the form, keeping the form's own time", () => {
    const draft = emptyDraft(
      "America/Los_Angeles",
      new Date("2026-09-28T15:00:00Z"),
    );
    const next = applyTemplate(draft, SALES);
    expect(next.date).toBe(draft.date);
    expect(next.time).toBe(draft.time);
    expect(next.title).toBe("Discovery — Sep 28");
    expect(next.durationMinutes).toBe(45);
    expect(next.settings.recordingPolicy).toBe("always-on");
    expect(next.settings.lobbyEnabled).toBe(draft.settings.lobbyEnabled);
    expect(next.invitees).toEqual([
      expect.objectContaining({
        email: "sam@us.com",
        cohost: true,
        inviteeId: null,
      }),
    ]);
  });

  it("resolves {date} and leaves plain titles alone", () => {
    expect(resolveTitle("Weekly sync", "2026-10-01")).toBe("Weekly sync");
    expect(resolveTitle("Standup {date}", "2026-10-01")).toBe("Standup Oct 1");
  });

  it("saving under an existing name replaces it; removing takes it out", () => {
    const renamed = { ...SALES, id: "tpl_new", title: "Discovery" };
    const list = withTemplate([SALES], renamed);
    expect(list.map((t) => t.id)).toEqual(["tpl_new"]);
    expect(withoutTemplate(list, "tpl_new")).toEqual([]);
  });
});
