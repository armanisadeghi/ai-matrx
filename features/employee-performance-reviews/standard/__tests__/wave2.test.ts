// Wave 2 pure logic: the template builder emits the __kind objects the door validates, the calibration
// distribution is honest, and the report/calendar contain only what the caller may see.
import { distributionBars, managerBars } from "../calibration";
import { reviewDueEvents } from "../calendarEvents";
import { templateProblemMessage } from "../messages";
import { buildReportHtml, buildReportMarkdown, buildReportModel } from "../standardReport";
import { buildMetadataPayload, buildTemplatePayload, KIND, starterDraft } from "../templateBuilder";
import { parseReviewDetail } from "../types";

describe("template builder", () => {
  it("writes every object with the __kind the door checks, and keys derived from labels", () => {
    const d = starterDraft();
    d.name = "Annual review";
    const p = buildTemplatePayload(d, "org-1") as { sections: Array<Record<string, unknown>>; rating_scale: Record<string, unknown> };
    expect(p.sections.length).toBe(5);
    for (const s of p.sections) {
      expect(s.__kind).toBe(KIND.section);
      expect(s.key).toMatch(/^[a-z0-9_]+$/);
      for (const q of s.questions as Array<Record<string, unknown>>) {
        expect(q.__kind).toBe(KIND.question);
        if (q.type === "rating") for (const i of q.items as Array<Record<string, unknown>>) expect(i.__kind).toBe(KIND.item);
        if (q.type === "narrative_list") expect(q).toMatchObject({ min_items: 2, max_items: 5 });
      }
    }
    expect(p.rating_scale.__kind).toBe(KIND.scale);
    expect((p.rating_scale.points as Array<Record<string, unknown>>).every((x) => x.__kind === KIND.point && typeof x.value === "number")).toBe(true);
  });

  it("keeps question keys unique when two labels would collide", () => {
    const d = starterDraft();
    d.sections[1]!.questions[0]!.label = "Accomplishments";
    const p = buildTemplatePayload(d, "o") as { sections: Array<{ questions: Array<{ key: string }> }> };
    const keys = p.sections.flatMap((s) => s.questions.map((q) => q.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("a metadata save carries no sections, so the door keeps them", () => {
    const p = buildMetadataPayload({ templateId: "t1", name: " New name ", description: "", isDefault: true });
    expect(p).toEqual({ template_id: "t1", name: "New name", description: "", is_default: true });
  });

  it("every template problem is a sentence, never a code", () => {
    expect(templateProblemMessage("scale_needs_two_points")).toMatch(/at least two points/);
    expect(templateProblemMessage("brand_new_problem")).toContain("brand_new_problem");
  });
});

const scale = [
  { value: 1, key: "unsatisfactory", label: "Unsatisfactory" },
  { value: 2, key: "needs_improvement", label: "Needs Improvement" },
  { value: 3, key: "successful", label: "Successful" },
];

describe("calibration distribution", () => {
  it("orders bars by the scale, then not-rated, then unknown keys, and shares add to one", () => {
    const bars = distributionBars({ successful: 6, unsatisfactory: 2, unrated: 2, legacy: 2 }, scale);
    expect(bars.map((b) => b.key)).toEqual(["unsatisfactory", "needs_improvement", "successful", "unrated", "legacy"]);
    expect(bars.map((b) => b.count)).toEqual([2, 0, 6, 2, 2]);
    expect(bars.reduce((n, b) => n + b.share, 0)).toBeCloseTo(1);
    expect(bars.find((b) => b.key === "successful")!.share).toBeCloseTo(0.5);
  });
  it("an empty cycle has zero shares, not NaN", () => {
    expect(distributionBars({}, scale).every((b) => b.share === 0 && b.count === 0)).toBe(true);
  });
  it("shares each manager's team against that team, busiest first", () => {
    const t = managerBars(
      [
        { managerName: "Ana", managerEmploymentId: "a", count: 1, byRating: { successful: 1 } },
        { managerName: "Ben", managerEmploymentId: "b", count: 4, byRating: { successful: 2, unsatisfactory: 2 } },
      ],
      scale,
    );
    expect(t.map((x) => x.managerName)).toEqual(["Ben", "Ana"]);
    expect(t[0]!.bars.find((b) => b.key === "unsatisfactory")!.share).toBeCloseTo(0.5);
    expect(t[1]!.bars.find((b) => b.key === "successful")!.share).toBe(1);
  });
});

const detailJson = (managerVisible: boolean) => ({
  ok: true,
  review: {
    review_id: "r1", employee_name: "Elena Marquez", manager_name: "Daniel Okafor", cycle_name: "H2 2026", cycle_status: "open",
    period_start: "2026-07-01", period_end: "2026-12-31", self_due_on: "2026-10-23", manager_due_on: "2026-10-30", share_due_on: "2026-11-06",
    status: managerVisible ? "shared" : "both_submitted", overall_rating: managerVisible ? "exceeds" : null,
    can: { save_self: false, save_manager: false, share: false, acknowledge: managerVisible },
  },
  template: {
    rating_scale: { points: [{ value: 4, key: "exceeds", label: "Exceeds Expectations" }] },
    sections: [{ key: "strengths", title: "Strengths", questions: [{ key: "strengths", type: "narrative_list", label: "Strengths", required: true }] }],
  },
  responses: [
    { role: "self", status: "submitted", visible: true, is_mine: true, version: 2, answers: { lists: { strengths: ["Calm follow-through under deadline"] } } },
    managerVisible
      ? { role: "manager", status: "submitted", visible: true, is_mine: false, version: 2, answers: { lists: { strengths: ["Explains reconciliations clearly"] } } }
      : { role: "manager", status: "submitted", visible: false, is_mine: false },
  ],
});

describe("report", () => {
  it("leaves out a half the door did not show, and the rating it did not send", () => {
    const detail = parseReviewDetail(detailJson(false))!;
    const m = buildReportModel(detail);
    expect(m.tracks.map((t) => t.role)).toEqual(["self"]);
    const md = buildReportMarkdown(m);
    const html = buildReportHtml(m);
    expect(md).toContain("Calm follow-through");
    expect(md).not.toContain("Explains reconciliations");
    expect(html).not.toContain("Explains reconciliations");
    expect(md).not.toContain("Overall rating");
  });
  it("includes the shared manager review and the overall rating once the door shows them", () => {
    const m = buildReportModel(parseReviewDetail(detailJson(true))!);
    expect(m.tracks.map((t) => t.role)).toEqual(["self", "manager"]);
    expect(buildReportMarkdown(m)).toContain("**Overall rating:** Exceeds Expectations");
    expect(buildReportHtml(m).match(/data-review-report-page=/g)).toHaveLength(2);
  });
  it("escapes what people wrote", () => {
    const j = detailJson(false);
    (j.responses[0] as { answers: { lists: { strengths: string[] } } }).answers.lists.strengths = ["<b>bold</b> & more"];
    const html = buildReportHtml(buildReportModel(parseReviewDetail(j)!));
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; more");
    expect(html).not.toContain("<b>bold</b>");
  });
});

describe("calendar events", () => {
  it("offers only the due date the caller owns", () => {
    const base = parseReviewDetail({ ...detailJson(false), review: { ...detailJson(false).review, status: "in_progress", can: { save_self: true } } })!.review;
    const evs = reviewDueEvents(base);
    expect(evs.map((e) => e.key)).toEqual(["self"]);
    expect(evs[0]!.event.uid).toContain("r1-self");
    expect(new Date(evs[0]!.event.end).getTime()).toBeGreaterThan(new Date(evs[0]!.event.start).getTime());
  });
  it("offers nothing on a closed cycle", () => {
    const r = parseReviewDetail({ ...detailJson(false), review: { ...detailJson(false).review, cycle_status: "closed", can: { save_self: true } } })!.review;
    expect(reviewDueEvents(r)).toEqual([]);
  });
});

import { refusalMessage } from "../messages";
describe("wave 2 refusals are said in words", () => {
  it("calibration_required and comment_not_enabled", () => {
    expect(refusalMessage({ reason: "calibration_required" })).toMatch(/calibrat/i);
    expect(refusalMessage({ reason: "comment_not_enabled" })).toMatch(/comment/i);
    expect(refusalMessage({ reason: "template_invalid" })).not.toMatch(/template_invalid/);
  });
});
