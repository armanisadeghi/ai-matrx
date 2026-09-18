// Agent Change Impact — I9's HARD CONDITIONS for an automatic green advance,
// one test per condition, each flipping the verdict from eligible to not.
// The knob (`agent_impact.auto_advance_green`) is NOT among them: it decides
// whether an eligible row is acted on, never whether it is eligible.

jest.mock("@/lib/knobs/featureKnobs", () => ({
  knobInt: jest.fn(async () => 72),
}));

const resolveSessionKnobMock = jest.fn();
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  resolveSessionKnob: (key: string) => resolveSessionKnobMock(key),
}));

import {
  ADMIN_WRITE_CONTEXT,
  AUTO_ADVANCE_GREEN_KNOB,
  TOO_YOUNG_RULE_ID,
  autoAdvanceCandidates,
  autoAdvanceVerdictOf,
  changeFindingsOf,
  hasDescendantAtHigherGrade,
  readAutoAdvanceGreen,
  tooYoungReasonOf,
  type ImpactVerdict,
} from "../impact";

function verdict(overrides: Partial<ImpactVerdict> = {}): ImpactVerdict {
  const base: ImpactVerdict = {
    holder_kind: "mandate_default",
    row_id: "row-1",
    mandate_key: "probe.alpha",
    principal: { kind: "org", organization_id: "org-1", subject_user_id: null },
    agent_id: "agent-1",
    agent_name: "Quick Test Agent",
    lineage_path: [{ agent_id: "agent-1", agent_name: "Quick Test Agent", relation: "self" }],
    pinned_version_id: "v29",
    pinned_version_number: 29,
    latest_version_id: "v31",
    latest_version_number: 31,
    grade: "green",
    blocker: null,
    findings: [{ rule_id: "prompt.changed", grade: "green", message: "the instructions were edited" }],
    settings_drift: { keys: [], capability: [], capability_checked: true },
    changed_columns: ["messages"],
    apply_token: {
      holder_kind: "mandate_default",
      row_id: "row-1",
      expected_pinned_version_id: "v29",
      target_version_id: "v31",
    },
    auto_advance_eligible: true,
  };
  return { ...base, ...overrides };
}

const TOO_YOUNG = {
  rule_id: TOO_YOUNG_RULE_ID,
  grade: "identical" as const,
  message: "v31 is 3 h old; this organization waits 24 h before a version auto-advances — a person may still advance it now",
};

describe("autoAdvanceVerdictOf — every hard condition flips the verdict", () => {
  it("a green pin, settings clean and measured, no worse duplicate, old enough, server-eligible → eligible", () => {
    expect(autoAdvanceVerdictOf(verdict(), [verdict()])).toEqual({ eligible: true });
  });

  it("identical is eligible too", () => {
    const v = verdict({ grade: "identical" });
    expect(autoAdvanceVerdictOf(v, [v]).eligible).toBe(true);
  });

  it("orange is not — only green or identical moves by itself", () => {
    const v = verdict({ grade: "orange" });
    const out = autoAdvanceVerdictOf(v, [v]);
    expect(out.eligible).toBe(false);
    expect(out).toMatchObject({ why: expect.stringContaining("Orange") });
  });

  it("red is not", () => {
    const v = verdict({ grade: "red" });
    expect(autoAdvanceVerdictOf(v, [v]).eligible).toBe(false);
  });

  it("a blocker is not (unreachable, set aside, tracks latest…)", () => {
    const v = verdict({ blocker: "set_aside", set_aside_reason: "archived" });
    expect(autoAdvanceVerdictOf(v, [v])).toMatchObject({ eligible: false, why: expect.stringContaining("Set aside") });
  });

  it("someone else's personal pin is not — never on their behalf", () => {
    const v = verdict({ principal: { kind: "user", organization_id: "org-1", subject_user_id: "u-2" } });
    expect(autoAdvanceVerdictOf(v, [v], ADMIN_WRITE_CONTEXT)).toMatchObject({
      eligible: false,
      why: expect.stringContaining("theirs to advance"),
    });
  });

  it("an unmeasured capability check is not — unknown is never clean", () => {
    const v = verdict({ settings_drift: { keys: [], capability: [], capability_checked: false } });
    expect(autoAdvanceVerdictOf(v, [v])).toMatchObject({ eligible: false, why: expect.stringContaining("unmeasured") });
  });

  it("one unexpected settings finding is not; an EXPECTED one (a declared drop) still is", () => {
    const unexpected = verdict({
      settings_drift: {
        keys: [],
        capability: [{ key: "temperature", action: "dropped", reason: "temperature is not supported here", expected: false }],
        capability_checked: true,
      },
    });
    expect(autoAdvanceVerdictOf(unexpected, [unexpected])).toMatchObject({
      eligible: false,
      why: expect.stringContaining("temperature is not supported here"),
    });
    const expected = verdict({
      settings_drift: {
        keys: [],
        capability: [{ key: "top_k", action: "omitted", reason: "declared", expected: true }],
        capability_checked: true,
      },
    });
    expect(autoAdvanceVerdictOf(expected, [expected]).eligible).toBe(true);
  });

  it("a duplicate of the agent that a job runs at a higher grade is not", () => {
    const own = verdict();
    const duplicate = verdict({
      row_id: "row-2",
      agent_id: "agent-2",
      agent_name: "Quick Test Agent (copy)",
      grade: "red",
      lineage_path: [
        { agent_id: "agent-1", agent_name: "Quick Test Agent", relation: "self" },
        { agent_id: "agent-2", agent_name: "Quick Test Agent (copy)", relation: "duplicated_from" },
      ],
      apply_token: { holder_kind: "mandate_default", row_id: "row-2", expected_pinned_version_id: "v1", target_version_id: "v2" },
    });
    expect(hasDescendantAtHigherGrade(own, [own, duplicate])).toBe(true);
    expect(autoAdvanceVerdictOf(own, [own, duplicate])).toMatchObject({
      eligible: false,
      why: expect.stringContaining("duplicate"),
    });
    // A duplicate at a LOWER or equal grade changes nothing.
    const calm = { ...duplicate, grade: "green" as const };
    expect(autoAdvanceVerdictOf(own, [own, calm]).eligible).toBe(true);
  });

  it("a target younger than the organization's minimum version age is not — and the reason is the server's sentence", () => {
    const v = verdict({ findings: [...(verdict().findings ?? []), TOO_YOUNG] });
    expect(tooYoungReasonOf(v)).toBe(TOO_YOUNG.message);
    expect(autoAdvanceVerdictOf(v, [v])).toEqual({ eligible: false, why: TOO_YOUNG.message });
    // The age reason is not a "what changed" finding.
    expect(changeFindingsOf(v).map((f) => f.rule_id)).toEqual(["prompt.changed"]);
  });

  it("the server's own auto_advance_eligible=false is respected even when every client-visible condition passes", () => {
    const v = verdict({ auto_advance_eligible: false });
    expect(autoAdvanceVerdictOf(v, [v])).toMatchObject({ eligible: false, why: expect.stringContaining("server") });
  });

  it("already current is not — nothing to advance", () => {
    const v = verdict({ pinned_version_id: "v31", pinned_version_number: 31 });
    expect(autoAdvanceVerdictOf(v, [v])).toMatchObject({ eligible: false, why: "Already on the newest saved version." });
  });

  it("autoAdvanceCandidates keeps exactly the eligible rows", () => {
    // The red row sits on an UNRELATED agent: a red sibling rung on the same
    // agent (or chain) disqualifies the green one — the server's own walk.
    const all = [
      verdict(),
      verdict({
        row_id: "row-2",
        agent_id: "agent-9",
        grade: "red",
        lineage_path: [{ agent_id: "agent-9", agent_name: "Other", relation: "self" }],
      }),
      verdict({ row_id: "row-3", findings: [TOO_YOUNG] }),
    ];
    expect(autoAdvanceCandidates(all).map((v) => v.row_id)).toEqual(["row-1"]);
  });

  it("a red rung on the SAME agent disqualifies its green sibling — the same chain, worse shape", () => {
    const green = verdict();
    const red = verdict({ row_id: "row-2", grade: "red" });
    expect(autoAdvanceVerdictOf(green, [green, red]).eligible).toBe(false);
  });
});

describe("readAutoAdvanceGreen — the knob, through the settings ladder", () => {
  beforeEach(() => resolveSessionKnobMock.mockReset());

  it("reads agent_impact.auto_advance_green and answers off by default", async () => {
    resolveSessionKnobMock.mockResolvedValue(false);
    await expect(readAutoAdvanceGreen()).resolves.toEqual({ state: "known", value: false });
    expect(resolveSessionKnobMock).toHaveBeenCalledWith(AUTO_ADVANCE_GREEN_KNOB);
  });

  it("true and 'true' both mean on", async () => {
    resolveSessionKnobMock.mockResolvedValue("true");
    await expect(readAutoAdvanceGreen()).resolves.toEqual({ state: "known", value: true });
  });

  it("no active organization is UNKNOWN, never off-by-assumption", async () => {
    resolveSessionKnobMock.mockResolvedValue(undefined);
    await expect(readAutoAdvanceGreen()).resolves.toMatchObject({ state: "unknown" });
  });
});
