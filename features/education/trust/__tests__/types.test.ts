/**
 * The P0 TrustEnvelope contract coercers — the boundary every consumer relies
 * on to turn untyped agent JSON into the typed envelope / verdict without ever
 * throwing. These are the deterministic guarantees behind the live-agent evals
 * (which prove the AGENTS behave; these prove the CONTRACT holds regardless of
 * what shape the agent emits).
 */

import {
  coerceTrustEnvelope,
  coerceGradeVerdict,
  coerceVerifyResult,
  isRefusal,
  isGrounded,
} from "../types";

describe("coerceTrustEnvelope", () => {
  it("returns null when there is no envelope at all", () => {
    expect(coerceTrustEnvelope({ front: "Q", back: "A" })).toBeNull();
    expect(coerceTrustEnvelope(null)).toBeNull();
    expect(coerceTrustEnvelope("nope")).toBeNull();
  });

  it("reads the envelope from an inline `trust` field on a card", () => {
    const env = coerceTrustEnvelope({
      front: "Q",
      trust: {
        citations: [{ sourceId: "c1", sourceKind: "chunk", excerpt: "x" }],
        confidence: "grounded",
        groundedIn: "Deck",
      },
    });
    expect(env?.confidence).toBe("grounded");
    expect(env?.groundedIn).toBe("Deck");
    expect(env?.citations).toHaveLength(1);
    expect(env?.citations[0].sourceId).toBe("c1");
  });

  it("tolerates snake_case + aliased citation keys", () => {
    const env = coerceTrustEnvelope({
      citations: [{ source_id: "c2", source_kind: "section", passage: "p" }],
      confidence: "inferred",
      grounded_in: "Notes",
    });
    expect(env?.confidence).toBe("inferred");
    expect(env?.groundedIn).toBe("Notes");
    expect(env?.citations[0]).toEqual({
      sourceId: "c2",
      sourceKind: "section",
      locator: undefined,
      excerpt: "p",
      title: undefined,
    });
  });

  it("drops malformed citations (no sourceId) and defaults an unknown sourceKind to chunk", () => {
    const env = coerceTrustEnvelope({
      citations: [{ locator: "p1" }, { sourceId: "ok", sourceKind: "nonsense" }],
      confidence: "grounded",
    });
    expect(env?.citations).toHaveLength(1);
    expect(env?.citations[0].sourceKind).toBe("chunk");
  });

  it("infers confidence when only citations are present", () => {
    const env = coerceTrustEnvelope({
      citations: [{ sourceId: "c" }],
    });
    expect(env?.confidence).toBe("grounded");
  });

  it("classifies a refusal", () => {
    const env = coerceTrustEnvelope({ citations: [], confidence: "not_in_material" });
    expect(env).not.toBeNull();
    expect(isRefusal(env)).toBe(true);
    expect(isGrounded(env)).toBe(false);
  });

  it("isGrounded requires grounded confidence AND at least one citation", () => {
    expect(isGrounded({ citations: [], confidence: "grounded" })).toBe(false);
    expect(
      isGrounded({ citations: [{ sourceId: "c", sourceKind: "chunk" }], confidence: "grounded" }),
    ).toBe(true);
  });
});

describe("coerceGradeVerdict (grade-on-meaning)", () => {
  it("returns null when there is no verdict signal", () => {
    expect(coerceGradeVerdict({ foo: 1 })).toBeNull();
  });

  it("narrows a correct paraphrase verdict", () => {
    const v = coerceGradeVerdict({
      correct: true,
      partial: false,
      misconception: null,
      explanation: "Same idea, different words.",
    });
    expect(v).toEqual({
      correct: true,
      partial: false,
      misconception: null,
      explanation: "Same idea, different words.",
    });
  });

  it("never reports partial and correct at once", () => {
    const v = coerceGradeVerdict({ correct: true, partial: true, explanation: "" });
    expect(v?.correct).toBe(true);
    expect(v?.partial).toBe(false);
  });

  it("captures a named misconception and falls back to feedback for explanation", () => {
    const v = coerceGradeVerdict({
      correct: false,
      partial: false,
      misconception: "Confuses absorbed with reflected light",
      feedback: "Green light is reflected, not absorbed.",
    });
    expect(v?.misconception).toBe("Confuses absorbed with reflected light");
    expect(v?.explanation).toBe("Green light is reflected, not absorbed.");
  });
});

describe("coerceVerifyResult", () => {
  it("returns a drift verdict with a suggested fix", () => {
    const r = coerceVerifyResult({
      status: "drifted",
      explanation: "The source says blue and red.",
      suggested_fix: "Blue and red wavelengths.",
    });
    expect(r).toEqual({
      status: "drifted",
      explanation: "The source says blue and red.",
      suggestedFix: "Blue and red wavelengths.",
    });
  });

  it("defaults an unknown status to unverifiable and nulls an empty fix", () => {
    const r = coerceVerifyResult({ status: "???", explanation: "x", suggested_fix: "" });
    expect(r?.status).toBe("unverifiable");
    expect(r?.suggestedFix).toBeNull();
  });
});
