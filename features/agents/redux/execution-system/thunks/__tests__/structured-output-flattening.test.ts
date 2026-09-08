/**
 * THE FLATTENING SCREAM — the judgment that makes a headless `expect: "text"`
 * run on a SHAPED job loud instead of silent (Arman, 2026-09-08: "the system
 * is not screaming at them when they write such shit code, but it should").
 *
 * Proven failing-then-passing: before `structured-output-flattening.ts`
 * existed, `runHeadlessAgentJson` resolved `agent_mandate_specification` as a
 * string with no capture at all. These pin the two signals and the exact
 * cases that must stay quiet (prose jobs, undeclared jobs, json runs).
 */
import {
  harvestedKindOf,
  isStructuredOutputKind,
  judgeDeclaredFlattening,
  judgeHarvestedFlattening,
} from "../structured-output-flattening";

describe("isStructuredOutputKind", () => {
  it("treats undeclared and prose kinds as prose", () => {
    expect(isStructuredOutputKind(null)).toBe(false);
    expect(isStructuredOutputKind(undefined)).toBe(false);
    expect(isStructuredOutputKind("")).toBe(false);
    expect(isStructuredOutputKind("  ")).toBe(false);
    expect(isStructuredOutputKind("text")).toBe(false);
  });

  it("treats every registered kind — and the generic json promise — as a shape", () => {
    expect(isStructuredOutputKind("agent_mandate_specification")).toBe(true);
    expect(isStructuredOutputKind("presentation_deck")).toBe(true);
    expect(isStructuredOutputKind("json")).toBe(true);
  });
});

describe("judgeDeclaredFlattening (signal 1 — the mandate declares a shape)", () => {
  it("screams when a text run targets a mandate declaring a structured kind", () => {
    const verdict = judgeDeclaredFlattening({
      expect: "text",
      mandateKey: "mandate.goal_writer",
      outputKind: "agent_mandate_specification",
      surfaceKey: "mandate:mandate.goal_writer",
    });
    expect(verdict?.signal).toBe("declared");
    expect(verdict?.kind).toBe("agent_mandate_specification");
    expect(verdict?.message).toContain("mandate.goal_writer");
    expect(verdict?.message).toContain('expect:"text"');
    expect(verdict?.message).toContain("Remedy");
  });

  it("stays quiet for json runs, prose jobs, undeclared jobs and agent-id runs", () => {
    const base = {
      mandateKey: "x.y",
      surfaceKey: "s",
    } as const;
    expect(
      judgeDeclaredFlattening({ ...base, expect: "json", outputKind: "presentation_deck" }),
    ).toBeNull();
    expect(
      judgeDeclaredFlattening({ ...base, expect: "text", outputKind: "text" }),
    ).toBeNull();
    expect(
      judgeDeclaredFlattening({ ...base, expect: "text", outputKind: null }),
    ).toBeNull();
    expect(
      judgeDeclaredFlattening({
        expect: "text",
        mandateKey: undefined,
        outputKind: "presentation_deck",
        surfaceKey: "s",
      }),
    ).toBeNull();
  });
});

describe("judgeHarvestedFlattening (signal 2 — the answer IS a shape)", () => {
  it("reads the __kind off a harvested object", () => {
    expect(harvestedKindOf({ __kind: "agent_goal", role: "x" })).toBe("agent_goal");
    expect(harvestedKindOf({ role: "x" })).toBeNull();
    expect(harvestedKindOf([{ __kind: "a" }])).toBeNull();
    expect(harvestedKindOf("agent_goal")).toBeNull();
    expect(harvestedKindOf({ __kind: "" })).toBeNull();
  });

  it("screams when a text run harvested a __kind object", () => {
    const verdict = judgeHarvestedFlattening({
      expect: "text",
      harvested: { __kind: "agent_mandate_specification", charge: "..." },
      agentRef: "mandate.goal_writer",
      surfaceKey: "mandate:mandate.goal_writer",
    });
    expect(verdict?.signal).toBe("harvested");
    expect(verdict?.kind).toBe("agent_mandate_specification");
    expect(verdict?.message).toContain("Remedy");
  });

  it("stays quiet for prose answers and for json runs", () => {
    expect(
      judgeHarvestedFlattening({
        expect: "text",
        harvested: null,
        agentRef: "a",
        surfaceKey: "s",
      }),
    ).toBeNull();
    expect(
      judgeHarvestedFlattening({
        expect: "text",
        harvested: { title: "no marker" },
        agentRef: "a",
        surfaceKey: "s",
      }),
    ).toBeNull();
    expect(
      judgeHarvestedFlattening({
        expect: "json",
        harvested: { __kind: "presentation_deck" },
        agentRef: "a",
        surfaceKey: "s",
      }),
    ).toBeNull();
  });
});
