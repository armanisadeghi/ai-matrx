// Wave 3 logic: goal alignment and progress display, peer visibility labelling, template round trip.
import { alignmentRows, parentChoices, parseGoal, progressLabel, type Goal } from "../goals";
import { launchRefusalMessage, peerRefusalMessage, refusalMessage } from "../messages";
import { canNominatePeers, peerLabel, pendingNominations, submittedPeerResponses } from "../peers";
import { buildTemplatePayload, draftFromSnapshot, starterDraft } from "../templateBuilder";
import { parseReviewDetail, parseTemplate, type ResponseView } from "../types";
import { goalPayload } from "../service";

const g = (id: string, parent: string | null, extra: Partial<Goal> = {}): Goal => ({
  goalId: id, employmentId: "e1", ownerName: "Elena Marquez", title: id, description: null, measure: null, targetValue: null,
  currentValue: null, unit: null, startOn: null, dueOn: null, status: "on_track", progress: 0, parentGoalId: parent, cycleId: null, childCount: 0, ...extra,
});

describe("goal alignment", () => {
  it("lists each goal directly under the goal it supports, later due dates last", () => {
    const rows = alignmentRows([g("child-b", "root", { dueOn: "2026-12-01" }), g("root", null), g("child-a", "root", { dueOn: "2026-10-01" }), g("grand", "child-a")]);
    expect(rows.map((r) => `${r.depth}:${r.goal.goalId}`)).toEqual(["0:root", "1:child-a", "2:grand", "1:child-b"]);
  });
  it("shows a goal whose parent is not in view as a top-level goal, never drops it", () => {
    expect(alignmentRows([g("orphan", "someone-elses")]).map((r) => r.depth)).toEqual([0]);
  });
  it("shows every goal even when stored data loops", () => {
    const rows = alignmentRows([g("a", "b"), g("b", "a")]);
    expect(rows.map((r) => r.goal.goalId).sort()).toEqual(["a", "b"]);
  });
  it("offers no goal that is itself or below it as a parent", () => {
    const goals = [g("root", null), g("mid", "root"), g("leaf", "mid"), g("other", null)];
    expect(parentChoices(goals, "mid").map((x) => x.goalId).sort()).toEqual(["other", "root"]);
    expect(parentChoices(goals, null)).toHaveLength(4);
  });
  it("says the alignment loop in words", () => {
    expect(refusalMessage({ reason: "validation", field: "parent_goal_id", detail: "alignment_loop" })).toMatch(/support itself/);
  });
});

describe("goal progress display", () => {
  it("shows value against target with the unit, and clamps percent", () => {
    expect(progressLabel({ progress: 62, currentValue: 31, targetValue: 50, unit: "deals" })).toBe("62% (31 of 50 deals)");
    expect(progressLabel({ progress: 140, currentValue: null, targetValue: null, unit: null })).toBe("100%");
    expect(progressLabel({ progress: 12.5, currentValue: 1, targetValue: 8, unit: null })).toBe("12.5% (1 of 8)");
  });
  it("reads door numbers that arrive as strings", () => {
    const goal = parseGoal({ goal_id: "x", target_value: "50", current_value: "31", progress: "62.0", status: "at_risk" })!;
    expect([goal.targetValue, goal.currentValue, goal.progress, goal.status]).toEqual([50, 31, 62, "at_risk"]);
  });
  it("sends blanks as empty strings so the door clears them, and numbers as numbers", () => {
    const p = goalPayload({ goalId: "g1", employmentId: "e1", title: " T ", description: "", measure: "", targetValue: "50", currentValue: "", unit: "", startOn: "", dueOn: "2026-12-31", status: "at_risk", parentGoalId: null });
    expect(p).toMatchObject({ goal_id: "g1", title: "T", target_value: 50, current_value: null, parent_goal_id: "", due_on: "2026-12-31" });
    expect(p).not.toHaveProperty("employment_id");
  });
});

const peerResp = (over: Partial<ResponseView>): ResponseView => ({ role: "peer", status: "submitted", submittedAt: null, visible: true, isMine: false, version: 1, answers: { __kind: "performance_review_answers", lists: {}, ratings: {}, texts: {} }, respondentName: null, ...over });

describe("peer visibility rendering", () => {
  it("names a peer only when the door sent the name; otherwise an anonymous numbered label", () => {
    expect(peerLabel(peerResp({ respondentName: "Marcus Webb" }), 0)).toBe("Marcus Webb");
    expect(peerLabel(peerResp({}), 1)).toBe("Peer 2");
  });
  it("lists only submitted peer responses the door made visible", () => {
    const rs = [peerResp({}), peerResp({ visible: false, answers: null }), peerResp({ status: "draft" }), { ...peerResp({}), role: "self" as const }];
    expect(submittedPeerResponses(rs)).toHaveLength(1);
  });
  it("offers peer requests to employee and manager only, only when on, open and not yet shared", () => {
    const open = { cycleStatus: "open", status: "in_progress" } as const;
    expect(canNominatePeers({ seat: "employee", peersEnabled: true, review: open })).toBe(true);
    expect(canNominatePeers({ seat: "manager", peersEnabled: true, review: open })).toBe(true);
    expect(canNominatePeers({ seat: "hr", peersEnabled: true, review: open })).toBe(false);
    expect(canNominatePeers({ seat: "peer", peersEnabled: true, review: open })).toBe(false);
    expect(canNominatePeers({ seat: "employee", peersEnabled: false, review: open })).toBe(false);
    expect(canNominatePeers({ seat: "employee", peersEnabled: true, review: { cycleStatus: "closed", status: "in_progress" } })).toBe(false);
    expect(canNominatePeers({ seat: "manager", peersEnabled: true, review: { cycleStatus: "open", status: "shared" } })).toBe(false);
  });
  it("finds the nominations awaiting the manager", () => {
    const n = [{ nominationId: "1", status: "pending" }, { nominationId: "2", status: "approved" }] as never;
    expect(pendingNominations(n)).toHaveLength(1);
  });
  it("says each refused nomination by name, in words", () => {
    expect(peerRefusalMessage("Marcus Webb", "peer_has_no_login")).toBe("Marcus Webb has no sign-in yet, so they cannot be asked.");
    expect(peerRefusalMessage("Tom", "is_a_party")).toMatch(/already part of this review/);
    expect(peerRefusalMessage(null, "something_new")).toContain("something_new");
    expect(launchRefusalMessage("Priya", "no_manager")).toMatch(/no manager/);
  });
  it("the review detail carries peer names only when sent and the anonymous flag defaults to on", () => {
    const d = parseReviewDetail({
      ok: true, review: { review_id: "r1", peer_feedback_shared_at: null, peer_anonymous: true }, template: {}, goals: [{ goal_id: "g1", title: "Close in four days", progress: 40, answer_key: "goals.g1" }],
      peer_nominations: [{ nomination_id: "n1", peer_name: "Marcus Webb", status: "approved", response_status: "submitted" }],
      responses: [{ role: "peer", status: "submitted", visible: true, is_mine: false, answers: {} }],
    })!;
    expect(d.responses[0]!.respondentName).toBeNull();
    expect(d.peerAnonymous).toBe(true);
    expect(d.goals[0]).toMatchObject({ goalId: "g1", answerKey: "goals.g1", progress: 40 });
    expect(d.peerNominations[0]!.responseStatus).toBe("submitted");
  });
});

describe("template round trip", () => {
  it("an existing template loads into the editor and saves back identical, keys kept", () => {
    const original = starterDraft();
    original.name = "Annual review";
    original.sections[0]!.questions.push({ id: "x", type: "goal_review", label: "Goals review", required: false, minItems: 0, maxItems: 0, items: [] });
    const first = buildTemplatePayload(original, "org") as { sections: unknown; rating_scale: unknown };
    const snap = parseTemplate({ name: "Annual review", sections: first.sections, rating_scale: first.rating_scale });
    const loaded = draftFromSnapshot(snap, { templateId: "t1", name: "Annual review", description: null, isDefault: false });
    const second = buildTemplatePayload(loaded, "org") as { sections: unknown; rating_scale: unknown };
    expect(second.sections).toEqual(first.sections);
    expect(second.rating_scale).toEqual(first.rating_scale);
    expect(JSON.stringify(first.sections)).toContain("goal_review");
  });
  it("renaming a question on a loaded template keeps its key, so old answers still match", () => {
    const base = buildTemplatePayload({ ...starterDraft(), name: "T" }, "o") as { sections: Array<{ questions: Array<{ key: string }> }> };
    const snap = parseTemplate({ sections: base.sections, rating_scale: buildTemplatePayload(starterDraft(), "o").rating_scale });
    const loaded = draftFromSnapshot(snap, { templateId: "t", name: "T", description: null, isDefault: false });
    const oldKey = loaded.sections[0]!.questions[0]!.key;
    loaded.sections[0]!.questions[0]!.label = "Biggest wins this period";
    const out = buildTemplatePayload(loaded, "o") as { sections: Array<{ questions: Array<{ key: string; label: string }> }> };
    expect(out.sections[0]!.questions[0]).toMatchObject({ key: oldKey, label: "Biggest wins this period" });
  });
});

import { buildReportMarkdown, buildReportModel } from "../standardReport";
describe("report with peers and goals", () => {
  it("labels an anonymous peer as a peer and includes the goal ratings", () => {
    const detail = parseReviewDetail({
      ok: true, review: { review_id: "r1", employee_name: "Elena Marquez", manager_name: "Daniel Okafor", cycle_status: "open" },
      template: { sections: [{ key: "goals", title: "Goals", questions: [{ key: "goals", type: "goal_review", label: "Goals review" }] }] },
      goals: [{ goal_id: "g1", title: "Close in four days", answer_key: "goals.g1" }],
      responses: [{ role: "peer", status: "submitted", visible: true, is_mine: false, answers: { ratings: { "goals.g1": 4 }, texts: { "goals.g1": "Delivered early" } } }],
    })!;
    const md = buildReportMarkdown(buildReportModel(detail));
    expect(md).toContain("Peer feedback from a peer");
    expect(md).toContain("Close in four days: 4 (Delivered early)");
  });
});
