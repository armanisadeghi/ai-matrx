/**
 * THE AUDITION TELLS THE TRUTH WHEN IT FAILS, AND SHOWS ITS WORK WHEN IT DOESN'T.
 *
 * Wall W37 (Expert Book Challenge, 2026-09-12): clicking Compare with "Also
 * test against vanilla AI" on the Watson Parenting Adviser put the sentence
 * "Sorry. An error occurred." on the screen. The server's actual refusal was
 * honest, specific and actionable — `audition_vanilla_model_unresolved`, with a
 * remedy in its own words — and none of it reached the person. Two client-side
 * halves of that:
 *
 *   (a) THE REASON IS DROPPED. `durableRunErrorMessage` read only the headline
 *       and threw away `details`, where aidream pipelines put the specific
 *       thing that went wrong. Now the reason rides with the sentence, on the
 *       live path and the durable-row path alike.
 *   (b) THE FAILURE HAD NO REMEDY. The dialog printed a bare red line — no
 *       "this did not finish", no retry, and nothing keeping the person's
 *       pasted texts reachable. It goes through `DurableRunFailure`, the one
 *       shared way a durable run's failure reaches a person (bb476fa6db).
 *
 * And the third fault: a three-way verdict reported two headline numbers and a
 * single-leg list of rules. The hand-run benchmark this Audition automates
 * (common-docs/projects/teach-parenting-pair/BENCHMARK-SIMPLE-PATH.md) judged
 * BOTH legs rule by rule and reported where each rule went. The verdict panel
 * does that now.
 *
 * Proven red first: with `withDetail` removed from `durableRunErrorMessage` the
 * reason test fails on the missing reason; with the old bare `<p>` back the
 * failure test fails on the missing "This one did not finish." and Try-again;
 * with the old single-leg `<ul>` back the per-rule test fails on the missing
 * vanilla column.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  durableRunErrorDetail,
  durableRunErrorMessage,
} from "@/lib/durable-run/useDurableRun";
import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import { parseVerdict } from "./auditionVerdict";
import { RuleFidelityTable } from "./RuleFidelityTable";
import type { RulebookRule } from "../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The refusal the Audition actually emitted, as the durable row stores it.
const VANILLA_REFUSAL = {
  type: "audition_vanilla_model_unresolved",
  message:
    "Your Masterwork is built, but none of its steps names an agent with a model.",
  user_message:
    "Your Masterwork is built, but none of its steps names an agent with a model.",
  details: { reason: "no_craftsman_model" },
};

describe("a failed Audition carries its reason to the client", () => {
  it("keeps the server's sentence AND the reason behind it", () => {
    const message = durableRunErrorMessage(VANILLA_REFUSAL);
    expect(message).toContain("none of its steps names an agent with a model");
    expect(message).toContain("no_craftsman_model");
    expect(durableRunErrorDetail(VANILLA_REFUSAL)).toBe("no_craftsman_model");
  });

  it("never repeats a reason the sentence already contains", () => {
    expect(
      durableRunErrorMessage({
        message: "The judge timed out after 120s.",
        details: { reason: "The judge timed out after 120s." },
      }),
    ).toBe("The judge timed out after 120s.");
  });

  it("has nothing to add when the server named no reason", () => {
    expect(
      durableRunErrorMessage({ user_message: "This Rulebook has no rules yet." }),
    ).toBe("This Rulebook has no rules yet.");
    expect(durableRunErrorDetail({ user_message: "x" })).toBeNull();
  });
});

describe("the failure stays on screen with a way out", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("shows the server's own reason and a retry", () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(
        <DurableRunFailure
          error={durableRunErrorMessage(VANILLA_REFUSAL)}
          retry={retry}
          running={false}
        />,
      );
    });
    expect(host.textContent).toContain("This one did not finish.");
    expect(host.textContent).toContain(
      "none of its steps names an agent with a model",
    );
    const button = host.querySelector("button");
    expect(button?.textContent).toBe("Try it again");
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("is the channel the Audition dialog actually uses", () => {
    // The component above can be perfect while the dialog still prints its own
    // red line — which is exactly what W37 was. So this reads the dialog's
    // source: it must hand its failure to the shared component, and must not
    // grow a private one back.
    const source = readFileSync(
      join(__dirname, "AuditionDialog.tsx"),
      "utf8",
    );
    expect(source).toContain("<DurableRunFailure");
    expect(source).toContain("error={run.error}");
    expect(source).toContain("retry={run.retry}");
    expect(source).not.toMatch(/text-destructive">\{run\.error\}/);
  });

  it("renders nothing at all when there is no failure", () => {
    act(() => {
      root.render(
        <DurableRunFailure error={null} retry={null} running={false} />,
      );
    });
    expect(host.textContent).toBe("");
  });
});

describe("the verdict shows both legs, rule by rule", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  // Run cef6ae07's Rulebook, three of its real rule ids.
  const rulesById = new Map(
    (
      [
        { id: "rage-stimulus-is-hampering", name: "Rage comes from hampering" },
        { id: "bedtime-and-bath-schedule", name: "Bedtime and bath schedule" },
        {
          id: "let-child-conquer-difficulties",
          name: "Let the child conquer difficulties",
        },
      ] as RulebookRule[]
    ).map((rule) => [rule.id, rule] as const),
  );

  const THREE_WAY = parseVerdict({
    type: "masterwork_audition_verdict",
    rulebook_id: "86ea4c2b-cdd1-4e33-a13d-dea76ebb2789",
    verdict: "reference_better",
    summary: "The original did a primary investigation.",
    quality_score: 38.9,
    vanilla_compared: true,
    vanilla_score: 30,
    vanilla_note:
      'Vanilla AI here is the model 2 of "Watson Parenting Adviser"\'s 3 steps run on, with no Rulebook and no steps.',
    findings: [
      { rule_id: "rage-stimulus-is-hampering", winner: "candidate", note: "names the mechanism" },
      { rule_id: "bedtime-and-bath-schedule", winner: "candidate", note: "uses the book's hours" },
      { rule_id: "let-child-conquer-difficulties", winner: "tie", note: "" },
    ],
    vanilla_findings: [
      { rule_id: "rage-stimulus-is-hampering", winner: "reference", note: "invents a mechanism" },
      { rule_id: "bedtime-and-bath-schedule", winner: "reference", note: "invents the hours" },
      { rule_id: "let-child-conquer-difficulties", winner: "tie", note: "" },
    ],
    beat_vanilla_rules: 2,
    lost_to_vanilla_rules: 0,
    vanilla_rules_compared: 3,
  })!;

  it("puts the plain model's standing beside the Masterwork's, per rule", () => {
    act(() => {
      root.render(
        <RuleFidelityTable
          verdict={THREE_WAY}
          rulebookId="86ea4c2b-cdd1-4e33-a13d-dea76ebb2789"
          rulesById={rulesById}
        />,
      );
    });
    const headers = Array.from(host.querySelectorAll("th")).map(
      (th) => th.textContent,
    );
    expect(headers).toEqual([
      "Rule",
      "Yours vs the original",
      "Vanilla AI vs the original",
    ]);
    const rows = host.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    // The rule the benchmark turned on: the Masterwork names the real
    // mechanism, the plain model invents one.
    const first = rows[0].textContent ?? "";
    expect(first).toContain("Rage comes from hampering");
    expect(first).toContain("names the mechanism");
    expect(first).toContain("invents a mechanism");
  });

  it("drops the vanilla column entirely on a two-way run", () => {
    const twoWay = parseVerdict({
      type: "masterwork_audition_verdict",
      verdict: "parity",
      summary: "",
      findings: [{ rule_id: "rage-stimulus-is-hampering", winner: "tie", note: "" }],
    })!;
    act(() => {
      root.render(
        <RuleFidelityTable
          verdict={twoWay}
          rulebookId="86ea4c2b-cdd1-4e33-a13d-dea76ebb2789"
          rulesById={rulesById}
        />,
      );
    });
    expect(host.querySelectorAll("th")).toHaveLength(2);
    expect(host.textContent).not.toContain("Vanilla AI");
  });

  it("says so when one leg was never judged on a rule", () => {
    const lopsided = parseVerdict({
      type: "masterwork_audition_verdict",
      verdict: "parity",
      summary: "",
      vanilla_compared: true,
      findings: [{ rule_id: "rage-stimulus-is-hampering", winner: "candidate", note: "" }],
      vanilla_findings: [
        { rule_id: "bedtime-and-bath-schedule", winner: "reference", note: "" },
      ],
    })!;
    act(() => {
      root.render(
        <RuleFidelityTable
          verdict={lopsided}
          rulebookId="86ea4c2b-cdd1-4e33-a13d-dea76ebb2789"
          rulesById={rulesById}
        />,
      );
    });
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(host.textContent).toContain("not judged on this rule");
  });
});
