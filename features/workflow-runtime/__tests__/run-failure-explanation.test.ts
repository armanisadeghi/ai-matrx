/**
 * `explainRunFailure` — resolution from STRUCTURE.
 *
 * The cases below use the real shapes: the structured failure the engine
 * writes (`matrx_graph.failure.RunFailure`) and verbatim legacy messages from
 * the 2026-08-20 census of live `workflow.run.error` rows.
 *
 * What these tests defend is the contract in features/workflow-runtime/
 * FEATURE.md: a failure must say WHAT WAS BEING RUN, WHAT WENT WRONG in the
 * reader's language, and WHAT TO DO NEXT — with the technical line riding
 * along, never as the headline and never dropped.
 */

import { explainRunFailure } from "../run-failure-explanation";

describe("the structured path", () => {
  it("generates the sentence from step_label + field, with no per-workflow pattern", () => {
    // The target sentence from the brief. Nothing in the module names "Study
    // Pack" or "pasted_text" — both come off the row.
    const result = explainRunFailure(
      {
        cause: "missing_input",
        message: "This step needs “pasted text”, and it was empty.",
        step_id: "n-ingest",
        step_label: "Study Pack",
        field: "pasted_text",
        expected: "a value",
        got: "nothing",
        technical:
          "ValidationError: 1 validation error for IngestInput\npasted_text\n  Field required",
      },
      "Your Masterwork",
    );

    expect(result.headline).toBe("Study Pack needs “pasted text” — that box was empty.");
    expect(result.cause).toBe("missing_input");
    expect(result.unrecognized).toBe(false);
    // Technical rides along, never as the headline.
    expect(result.technical).toContain("ValidationError");
    expect(result.headline).not.toContain("ValidationError");
  });

  it("keeps missing_input and invalid_input as different sentences", () => {
    const invalid = explainRunFailure(
      {
        cause: "invalid_input",
        step_label: "Pick the audience",
        field: "host_count",
        expected: "a whole number",
        technical: "ValidationError: int_parsing",
      },
      "Your Masterwork",
    );
    expect(invalid.headline).toContain("Pick the audience");
    expect(invalid.headline).toContain("host count");
    expect(invalid.headline).toContain("a whole number");
    expect(invalid.headline).not.toContain("empty");
  });

  it("never renders a node id at the reader", () => {
    // The server omits step_label rather than falling back to the node id, so
    // the copy must read fine without it.
    const result = explainRunFailure(
      { cause: "missing_input", step_id: "n-l4fuKvk13v", field: "topic" },
      "Your Understudy",
    );
    expect(result.headline).not.toContain("n-l4fuKvk13v");
    expect(result.headline).toContain("Your Understudy");
  });

  it("routes a cause with a door to that door", () => {
    const result = explainRunFailure({ cause: "consent_required" }, "Your Masterwork");
    expect(result.action).toEqual({
      label: "Open the Family page",
      href: "/education/family",
    });
  });

  it("says a stranded run is OURS, never the reader's failure", () => {
    // Requirement: the UI must say the truth — our system dropped it, here's
    // your run back — and never render it as "your run failed".
    const result = explainRunFailure(
      {
        cause: "run_stranded",
        message:
          "This run was dropped by our system before it could finish — nothing you did caused it.",
        technical: "Force-failed by user — run was stranded in 'running' state.",
      },
      "Your Masterwork",
    );
    expect(result.headline).toContain("We dropped this run");
    expect(result.headline).not.toMatch(/your .*run failed/i);
    expect(result.nextStep).toContain("Nothing was charged");
    // The operational detail is kept, but it is not what the reader is told.
    expect(result.technical).toContain("Force-failed");
    expect(result.headline).not.toContain("Force-failed");
  });

  it("marks the server's own engine_error fallback as unrecognized", () => {
    const result = explainRunFailure(
      { cause: "engine_error", technical: "ZeroDivisionError: division by zero" },
      "Your Masterwork",
    );
    expect(result.unrecognized).toBe(true);
    expect(result.technical).toContain("ZeroDivisionError");
  });

  it("falls back to the server's sentence for a cause this bundle doesn't know", () => {
    // A server deployed ahead of this client. Its `message` is already human —
    // using it beats pretending we understood nothing.
    const result = explainRunFailure(
      {
        cause: "some_future_cause",
        message: "The scheduler ran out of lanes.",
        technical: "LaneExhaustedError: 0 free",
      },
      "Your Masterwork",
    );
    expect(result.headline).toBe("The scheduler ran out of lanes.");
    expect(result.unrecognized).toBe(true);
    expect(result.cause).toBe("some_future_cause");
  });
});

describe("the legacy path — rows written before the server derived structure", () => {
  it("explains a verbatim legacy message through the SAME copy map", () => {
    const structured = explainRunFailure({ cause: "no_organization" }, "Your Understudy");
    const legacy = explainRunFailure(
      "ValueError: this step runs an agent, and an agent run belongs to an organization",
      "Your Understudy",
    );
    // One cause, one sentence — a legacy row and a new row must not diverge.
    expect(legacy.headline).toBe(structured.headline);
    expect(legacy.nextStep).toBe(structured.nextStep);
  });

  it("reports no cause for a pattern-inferred explanation", () => {
    // Inferred from prose, not recorded. Counting it as a known cause would
    // overstate coverage in the metric.
    const legacy = explainRunFailure("ValueError: ... belongs to an organization", "It");
    expect(legacy.cause).toBeNull();
    expect(legacy.unrecognized).toBe(false);
  });

  it("still renders no raw Python as the headline when nothing matches", () => {
    const result = explainRunFailure("ZeroDivisionError: integer division by zero", "It");
    expect(result.unrecognized).toBe(true);
    expect(result.headline).not.toContain("ZeroDivisionError");
    expect(result.technical).toContain("ZeroDivisionError");
  });
});

describe("the honest empty case", () => {
  it("says so when the run recorded no reason at all", () => {
    for (const input of [null, undefined, "", {}]) {
      const result = explainRunFailure(input, "Your Masterwork");
      expect(result.headline).toContain("didn't record a reason");
      expect(result.unrecognized).toBe(true);
      expect(result.technical).toBeNull();
    }
  });
});

describe("the contract, for every input shape", () => {
  it("always returns a headline and a next step", () => {
    const inputs = [
      null,
      "",
      "boom",
      {},
      { message: "boom" },
      { cause: "missing_input" },
      { cause: "run_stranded" },
      { cause: "unknown_to_this_bundle" },
    ];
    for (const input of inputs) {
      const result = explainRunFailure(input, "Your Masterwork");
      expect(result.headline.trim().length).toBeGreaterThan(0);
      expect(result.nextStep.trim().length).toBeGreaterThan(0);
    }
  });

  it("never puts the technical line in the headline", () => {
    const result = explainRunFailure(
      {
        cause: "persistence_failed",
        step_label: "Save the pack",
        technical: "IntegrityError: duplicate key value violates unique constraint",
      },
      "Your Masterwork",
    );
    expect(result.headline).not.toContain("IntegrityError");
    expect(result.technical).toContain("IntegrityError");
  });
});
