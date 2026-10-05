/**
 * Live walk 2026-10-04: appending " Celebrate with the team." to a one-paragraph
 * answer produced the chip label "To plan a small…defining y…" (the start of
 * the paragraph, from a whole-line -/+ pair). The label must name the change.
 */
import { remarkChangeSummary } from "../remark-diff";
import { remarkChipTitle, type EditRemark } from "../remarks";

const ANSWER =
  "To plan a small product launch, start by clearly defining your target audience, core value proposition, and measurable success metrics. Next, build a focused timeline that coordinates product readiness, simple marketing assets, and direct outreach channels such as email or social media. Finally, execute the launch with dedicated customer support in place, actively gathering user feedback to guide your immediate post-launch improvements.";

const edit = (before: string, after: string): EditRemark => ({
  kind: "edit",
  target: { conversationId: "c", messageId: "m" },
  before,
  after,
  origin: "text",
  projection: null,
  quote: null,
});

describe("edit chip label", () => {
  it("an appended sentence is the label", () => {
    expect(remarkChipTitle(edit(ANSWER, `${ANSWER} Celebrate with the team.`))).toBe(
      "+ Celebrate with the team.",
    );
  });
  it("a replaced phrase names both sides", () => {
    expect(remarkSummaryOf("measurable success metrics", "three clear goals")).toBe(
      "- measurable success metrics → + three clear goals",
    );
  });
  it("a removed sentence names what went", () => {
    const after = ANSWER.replace(" Next, build a focused timeline that coordinates product readiness, simple marketing assets, and direct outreach channels such as email or social media.", "");
    expect(remarkChangeSummary(ANSWER, after)).toMatch(/^- Next, build a focused timeline/);
  });
  it("no change, no label", () => {
    expect(remarkChangeSummary(ANSWER, ANSWER)).toBe("");
  });
});

function remarkSummaryOf(from: string, to: string) {
  return remarkChangeSummary(ANSWER, ANSWER.replace(from, to));
}
