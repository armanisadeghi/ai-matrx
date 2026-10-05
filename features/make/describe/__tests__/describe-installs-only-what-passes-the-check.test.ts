// features/make/describe/__tests__/describe-installs-only-what-passes-the-check.test.ts — lane CHAIR-DESCRIBE.
//
// THE USE CASE. The front desk at Cedar Ridge Physical Therapy types "a patient intake form that books the
// first visit". The mandate answers one template spec; the box checks it with the store's own validator
// (describe profile) BEFORE anything is declared or installed, says the first problem in one line, and
// installs only a spec that passes.
//
// BREAKS THIS CATCHES: a refused spec reaching the install door (a half-build) · a failure said as a dump
// instead of one line · a sound one-off spec refused for gallery-only keys or empty lists the model left
// out · the declaration missing the keys the install door needs (catalogue id, plan) · the vocabulary
// drifting from the package's closed lists.
//
// Fixtures are real: the first live answer of the mandate (2026-10-05, refused by the store for real
// rules) and a published gallery template reduced to what a describe answer carries.

import { CHOICE_COLORS, TEMPLATE_VIEW_KINDS } from "@ai-matrx/records/templates";

import { checkDescribeSpec, coerceDescribeAnswer, describeDeclaration, describeSpec, describeVariables } from "../describeTemplate";
import firstAnswer from "./fixtures/first-live-answer-cedar-ridge.json";
import goldReduced from "./fixtures/gold-reduced-to-describe.json";

describe("the describe box installs only what passes the store's check", () => {
  it("refuses the first live answer in one line, naming the store's own first problem", () => {
    const answer = coerceDescribeAnswer(firstAnswer);
    const checked = checkDescribeSpec(describeSpec(answer.template));
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.line).toBe(`${checked.problems[0]!.says}${checked.problems.length > 1 ? ` (+${checked.problems.length - 1} more)` : ""}`);
    expect(checked.line).not.toMatch(/\n/);
    // What the describe profile does not owe is never what refuses it.
    expect(checked.problems.map((p) => p.says).join("\n")).not.toMatch(/at least three views|at least two extras|catalogue/i);
  });

  it("passes a sound one-off spec with one view, one booking page and the empty lists left out", () => {
    const t = JSON.parse(JSON.stringify(goldReduced)) as Record<string, unknown>;
    delete t.dimensions;
    delete t.sharedBlocks;
    t.relationships = (t.relationships as Array<{ toTable: string }>).filter((r) => r.toTable !== "team_member");
    for (const table of t.tables as Array<{ fields: Array<{ relationTarget?: string; key: string }>; childDates?: unknown; statusImplies?: unknown }>) {
      table.fields = table.fields.filter((f) => f.relationTarget !== "team_member");
      delete table.childDates;
      delete table.statusImplies;
    }
    const checked = checkDescribeSpec(describeSpec({ ...t, __kind: "describe_template_result" }));
    expect(checked).toEqual({ ok: true });
  });

  it("declares a checked spec with its own catalogue id and an install plan the door can run", () => {
    const spec = describeSpec(goldReduced as unknown as Record<string, unknown>);
    const d = describeDeclaration(spec, "00000000-0000-4000-8000-000000000001", "K3X9");
    expect(d.catalogueId).toBe("DESCRIBE-K3X9");
    expect(d.organizationId).toBe("00000000-0000-4000-8000-000000000001");
    const plan = d.installPlan as { steps: Array<{ door: string }> };
    expect(plan.steps.some((s) => s.door === "booking_declare")).toBe(true);
    expect(plan.steps.some((s) => s.door === "form_declare")).toBe(true);
  });

  it("hands the mandate the package's own closed lists", () => {
    const v = describeVariables("a patient intake form that books the first visit", { name: "Cedar Ridge Physical Therapy", industry: null, time_zone: "America/Los_Angeles", working_hours: null }, [], new Date("2026-10-05T18:00:00Z"));
    const vocab = JSON.parse(v.vocabulary) as Record<string, unknown>;
    expect(vocab.choice_colors).toEqual([...CHOICE_COLORS]);
    expect(vocab.template_view_kinds).toEqual([...TEMPLATE_VIEW_KINDS]);
    expect(v.today).toBe("2026-10-05");
    expect(JSON.parse(v.existing_tables)).toEqual([]);
  });

  it("says in one line when the answer holds no template", () => {
    expect(() => coerceDescribeAnswer({ notes: [] })).toThrow("The answer held no template.");
  });
});
