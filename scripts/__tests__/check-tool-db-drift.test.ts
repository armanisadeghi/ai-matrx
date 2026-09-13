/**
 * The tool-drift gate's own RED/GREEN self-test for the checks added on
 * 2026-09-12: string/number bounds and array-item shape, recursively.
 *
 * A guard you cannot demonstrate FAILING is not a guard. Every case drives
 * `compareTool` — the same function the CLI runs against `tool.definition` —
 * with the REAL `userArgsSchema` Zod on the code side and a hand-built DB row
 * on the other, so the fixture can only ever stand in for the DB, never for
 * the code under test.
 *
 * The incident it witnesses: the model called `user` in batched form with a
 * 16-char `header`; the dispatcher's `z.string().max(12)` inside
 * `questions.items` rejected it AFTER the server had suspended the run. The
 * DB row declared `questions.items` as a bare `{"type":"object"}`, and the
 * old gate never descended into `items` nor compared `maxLength`, so the
 * constraint was invisible to the model and the gate stayed green.
 */
import { z } from "zod";

import { compareTool, type FieldSchema } from "@/scripts/check-tool-db-drift";
import { userArgsSchema } from "@/features/agents/ui-first-tools/tools/schemas";

/** Exactly what Zod serializes today — the DB row that matches code 1:1. */
function fullUserRow(): Record<string, FieldSchema> {
  const js = z.toJSONSchema(userArgsSchema, { unrepresentable: "any" }) as {
    properties: Record<string, FieldSchema>;
  };
  // Deep-clone so a test can mutate its copy freely.
  return JSON.parse(JSON.stringify(js.properties)) as Record<string, FieldSchema>;
}

const run = (parameters: Record<string, FieldSchema>) =>
  compareTool("user", userArgsSchema, { name: "user", parameters });

describe("check:tool-db-drift — GREEN: a DB row that mirrors the Zod exactly has no drift", () => {
  it("reports nothing for the full serialization", () => {
    expect(run(fullUserRow())).toEqual([]);
  });

  it("accepts nested required either as a JSON-Schema array or per-field `required: true`", () => {
    const row = fullUserRow();
    const items = row.questions!.items!;
    delete items.required;
    items.properties!.type!.required = true;
    expect(run(row)).toEqual([]);
  });
});

describe("check:tool-db-drift — RED: the 2026-09-12 `user.questions` incident", () => {
  it("flags a bare {type:object} items opposite a typed object item in code", () => {
    const row = fullUserRow();
    row.questions!.items = { type: "object" };
    const issues = run(row);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/^questions\.items: items shape only in code/);
    expect(issues[0]).toContain("header");
  });

  it("flags a missing items altogether", () => {
    const row = fullUserRow();
    delete row.questions!.items;
    expect(run(row).some((i) => i.startsWith("questions.items: items shape only in code"))).toBe(true);
  });

  it("flags header.maxLength absent INSIDE items even when the top-level header carries it", () => {
    const row = fullUserRow();
    delete row.questions!.items!.properties!.header!.maxLength;
    expect(run(row)).toEqual(["questions.items.header: maxLength only in code (12)"]);
  });

  it("flags header.maxLength differing inside items", () => {
    const row = fullUserRow();
    row.questions!.items!.properties!.header!.maxLength = 20;
    expect(run(row)).toEqual(["questions.items.header: maxLength differs (code=12, db=20)"]);
  });

  it("flags nested required / enum / field-set drift by the same rules as the top level", () => {
    const row = fullUserRow();
    const items = row.questions!.items!;
    items.required = [];
    delete items.properties!.level!.enum;
    delete items.properties!.allow_other;
    const issues = run(row);
    expect(issues).toContain("questions.items.fields only in code: allow_other");
    expect(issues).toContain("questions.items.required only in code: type");
    expect(issues.some((i) => i.startsWith("questions.items.level: code constrains to enum"))).toBe(true);
  });
});

describe("check:tool-db-drift — RED: bounds on top-level fields", () => {
  it("flags a string maxLength only in code", () => {
    const row = fullUserRow();
    delete row.header!.maxLength;
    expect(run(row)).toEqual(["header: maxLength only in code (12)"]);
  });

  it("flags a string maxLength only in the DB", () => {
    const row = fullUserRow();
    row.question!.maxLength = 500;
    expect(run(row)).toEqual(["question: maxLength only in DB (500)"]);
  });

  it("flags number minimum/maximum drift", () => {
    const row = fullUserRow();
    row.timeout_seconds!.maximum = 600;
    delete row.timeout_seconds!.minimum;
    expect(run(row)).toEqual([
      "timeout_seconds: minimum only in code (1)",
      "timeout_seconds: maximum differs (code=900, db=600)",
    ]);
  });

  it("flags a scalar array item's bounds and type", () => {
    const row = fullUserRow();
    delete row.actions!.items!.minLength;
    expect(run(row)).toEqual(["actions.items: minLength only in code (1)"]);
    const row2 = fullUserRow();
    row2.actions!.items!.type = "integer";
    expect(run(row2)).toEqual(["actions.items: type differs (code=string, db=integer)"]);
  });
});

describe("check:tool-db-drift — the pre-existing top-level rules still hold", () => {
  it("flags fields only in DB and a description-only difference is NOT drift", () => {
    const row = fullUserRow();
    row.extra = { type: "string", description: "stray" };
    row.header!.description = "descriptions are never compared";
    expect(run(row)).toEqual(["fields only in DB: extra"]);
  });
});
