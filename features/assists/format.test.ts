import { humanAssistRow, projectAssistRow } from "./format";
import type { Assist } from "./types";

const ASSIST = {
  id: "assist-1",
  userId: "user-1",
  entityType: "page",
  entityId: "page-1",
  surfaceName: "Page editor",
  sourceKind: "deterministic",
  sourceKey: "seo.title_check",
  title: "Add a page title",
  body: "This page has no title.",
  reasoning: "Titles help visitors understand the page.",
  confidence: 0.2,
  action: {
    kind: "navigate",
    href: "/pages/page-1",
    label: "Open page",
    confirm: "Takes you to the page editor. Nothing is changed or run.",
  },
  status: "pending",
  priority: 10,
  dedupeKey: "page-1:title",
  createdAt: "2026-08-19T07:00:00.000Z",
  decidedAt: null,
  suppressedUntil: null,
  expiresAt: null,
  result: null,
  evidence: {
    kind: "page",
    label: "Example page",
  },
  firstSeenAt: "2026-08-19T07:00:00.000Z",
  occurrences: 2,
  resolvedAt: null,
  decisionNote: "Check with the editor first.",
  isStarred: true,
  viewedAt: null,
} satisfies Assist;

describe("Assist copy format", () => {
  it("captures the live states and action text rendered by the manager card", () => {
    const human = humanAssistRow(ASSIST);
    const projected = projectAssistRow(ASSIST);

    expect(human).toContain("Flagged");
    expect(human).toContain("Not yet seen");
    expect(human).toContain("Warning: low confidence");
    expect(human).toContain("Your note: Check with the editor first.");
    expect(human).toContain("Action: Open page");
    expect(human).not.toContain("Expires");
    expect(projected).not.toHaveProperty("expires");
    expect(projected).toMatchObject({
      flagged: true,
      seen_state: "Not yet seen",
      warning: "low confidence",
      card_warning: "low confidence, worth a second look",
      decision_note: "Check with the editor first.",
      action: {
        button_label: "Open page",
        explainer: "Takes you to the page editor. Nothing is changed or run.",
      },
    });
  });
});
