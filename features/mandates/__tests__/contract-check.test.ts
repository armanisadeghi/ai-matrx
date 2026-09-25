/**
 * THE PERSISTED CONTRACT MISMATCH (Arman, 2026-09-25 — validation offers,
 * never blocks). The server saves a mismatched Holder and writes its verdict
 * on the row; these prove every screen reads the same red from that row.
 */
import {
  bindingContractCheck,
  declaredOutputKind,
  defaultHolderContractCheck,
  kindMismatchProblem,
  parseContractCheck,
  unmetContractChecks,
} from "@/features/mandates/contract-check";
import { parseBindingWriteReport } from "@/features/mandates/overrides";

const UNMET = {
  state: "unmet",
  problems: [
    "its structured output declares kind 'quiz_set', but this job answers in 'page_summary'",
  ],
  expected_output_kind: "page_summary",
  required_output_keys: [],
  holder_type: "agent",
  holder_name: "Quiz Maker",
  holder_output_kind: "quiz_set",
  holder_output_keys: ["__kind", "questions"],
  set_aside_at_run: false,
  summary:
    "This job expects output kind 'page_summary'; Quiz Maker emits kind 'quiz_set'.",
  checked_at: "2026-09-25T14:00:00+00:00",
};

describe("contract check — read side", () => {
  it("reads the server's write report", () => {
    const report = parseBindingWriteReport({ notes: [], contract_check: UNMET });
    expect(report.contractCheck?.state).toBe("unmet");
    expect(report.contractCheck?.expectedOutputKind).toBe("page_summary");
    expect(report.contractCheck?.holderOutputKind).toBe("quiz_set");
    expect(report.contractCheck?.summary).toContain("Quiz Maker emits kind 'quiz_set'");
  });

  it("reads the verdict persisted on a binding row and on the default", () => {
    expect(bindingContractCheck({ metadata: { contract_check: UNMET } })?.state).toBe(
      "unmet",
    );
    expect(
      defaultHolderContractCheck({
        metadata: { default_holder_contract_check: UNMET },
      })?.holderName,
    ).toBe("Quiz Maker");
    expect(bindingContractCheck({ metadata: {} })).toBeNull();
    expect(parseContractCheck({ state: "maybe" })).toBeNull();
  });

  it("lists every red Holder on a mandate, set-aside first", () => {
    const setAside = { ...UNMET, set_aside_at_run: true, holder_name: "Keyless" };
    const found = unmetContractChecks(
      { metadata: { default_holder_contract_check: UNMET } },
      [
        { principal_type: "org", metadata: { contract_check: setAside } },
        { principal_type: "user", metadata: { contract_check: { ...UNMET, state: "met" } } },
      ],
    );
    expect(found.map((f) => f.check.holderName)).toEqual(["Keyless", "Quiz Maker"]);
    expect(found[0].where).toBe("An organization's answer");
  });

  it("names a declared __kind that differs from the job's kind", () => {
    const schema = {
      type: "object",
      properties: { __kind: { const: "quiz_set" }, questions: { type: "array" } },
    };
    expect(declaredOutputKind(schema)).toBe("quiz_set");
    expect(declaredOutputKind({ schema })).toBe("quiz_set");
    expect(kindMismatchProblem("page_summary", "quiz_set")).toContain("'quiz_set'");
    expect(kindMismatchProblem("page_summary", "page_summary")).toBeNull();
    expect(kindMismatchProblem("page_summary", null)).toBeNull();
  });
});
