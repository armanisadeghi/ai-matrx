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

import { CHOICE_COLORS, describeVocabulary as packageVocabulary, TEMPLATE_VIEW_KINDS } from "@ai-matrx/records/templates";

import { bindReuses, checkDescribeTemplate, coerceDescribeAnswer, describeDeclaration, describeSpec, describeVariables } from "../describeTemplate";
import firstAnswer from "./fixtures/first-live-answer-cedar-ridge.json";
import goldReduced from "./fixtures/gold-reduced-to-describe.json";

describe("the describe box installs only what passes the store's check", () => {
  it("refuses the first live answer in one line, naming the store's own first problem", () => {
    const answer = coerceDescribeAnswer(firstAnswer);
    const checked = checkDescribeTemplate(answer.template);
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
    const checked = checkDescribeTemplate({ ...t, __kind: "describe_template_result" });
    expect(checked.ok).toBe(true);
  });

  it("fills what the mandate leaves out for speed exactly as if it had written it", () => {
    // SPEED (CHAIR-DESCRIBE-4): the mandate omits the keys that are always the same; the check and the
    // install must see the very spec they would have seen had it written them out.
    const t = JSON.parse(JSON.stringify(goldReduced)) as Record<string, unknown>;
    delete t.dimensions;
    delete t.sharedBlocks;
    t.relationships = (t.relationships as Array<{ toTable: string }>).filter((r) => r.toTable !== "team_member");
    for (const table of t.tables as Array<{ fields: Array<{ relationTarget?: string; key: string }>; childDates?: unknown; statusImplies?: unknown }>) {
      table.fields = table.fields.filter((f) => f.relationTarget !== "team_member");
      delete table.childDates;
      delete table.statusImplies;
    }
    const full = describeSpec(t);
    const lean = JSON.parse(JSON.stringify(t)) as Record<string, unknown>;
    for (const k of ["specVersion", "version", "audience", "cleanupTag"]) if (k !== "cleanupTag" || lean.cleanupTag === `describe:${String(lean.id)}`) delete lean[k];
    let dropped = 0;
    for (const table of lean.tables as Array<Record<string, unknown>>) {
      for (const [k, v] of Object.entries({ type: "entity", display: "grid", weight: "light", ordered: false })) if (table[k] === v) (delete table[k], dropped++);
      if (table.labelPlural === table.name) (delete table.labelPlural, dropped++);
      if (Array.isArray(table.rows) && !table.rows.length) delete table.rows;
      for (const f of table.fields as Array<Record<string, unknown>>) {
        const contact = f.parityType === "phone" || f.parityType === "email";
        if (f.sensitivity === (contact ? "confidential" : "internal") && f.contextPolicy === (contact ? "exclude" : "include")) (delete f.sensitivity, delete f.contextPolicy, dropped++);
        if (contact && f.format === f.parityType) delete f.format;
      }
    }
    expect(dropped).toBeGreaterThan(5);
    expect(describeSpec(lean)).toEqual(full);
    expect(checkDescribeTemplate(lean).ok).toBe(true);
  });

  it("fixes what the package can fix by itself and shows an error only for what remains", () => {
    // A choice field written with no colours is not a defect the person should see: the package's
    // automatic fixes colour it, say so in one line, and the fixed spec is what is checked and installed.
    const t = JSON.parse(JSON.stringify(goldReduced)) as Record<string, unknown>;
    delete t.dimensions;
    delete t.sharedBlocks;
    t.relationships = (t.relationships as Array<{ toTable: string }>).filter((r) => r.toTable !== "team_member");
    for (const table of t.tables as Array<{ fields: Array<{ relationTarget?: string; choiceColors?: unknown }>; childDates?: unknown; statusImplies?: unknown }>) {
      table.fields = table.fields.filter((f) => f.relationTarget !== "team_member");
      for (const f of table.fields) delete f.choiceColors;
      delete table.childDates;
      delete table.statusImplies;
    }
    const checked = checkDescribeTemplate(t);
    expect(checked.autoFixes.length).toBeGreaterThan(0);
    expect(checked.ok).toBe(true);
    const field = checked.spec.tables.flatMap((x) => x.fields).find((f) => f.key === "how_found")! as unknown as { choiceColors?: Record<string, string> };
    expect(Object.keys(field.choiceColors ?? {}).length).toBeGreaterThan(0);
  });

  it("fills an omitted sensitivity up to the store's floor — an address is confidential, a person's birth date restricted", () => {
    // The live run of 2026-10-05 ("track my crews' jobs from quote to paid") left "Job site address" without
    // a sensitivity; the ordinary default would have been refused for it.
    const spec = describeSpec({
      id: "crew-jobs",
      tables: [
        { token: "job", name: "Jobs", labelSingular: "Job", subject: "thing", titleField: "title", fields: [
          { key: "title", label: "Job", parityType: "text" },
          { key: "job_site_address", label: "Job site address", parityType: "text" },
          { key: "client_phone", label: "Client phone", parityType: "phone" },
        ] },
        { token: "patient", name: "Patients", labelSingular: "Patient", subject: "person", titleField: "name", fields: [
          { key: "name", label: "Name", parityType: "text", sensitivity: "confidential", contextPolicy: "summarize" },
          { key: "date_of_birth", label: "Date of birth", parityType: "datetime" },
        ] },
      ],
    });
    const f = (t: number, k: string) => spec.tables[t]!.fields.find((x) => x.key === k)! as unknown as Record<string, unknown>;
    expect([f(0, "title").sensitivity, f(0, "title").contextPolicy]).toEqual(["internal", "include"]);
    expect([f(0, "job_site_address").sensitivity, f(0, "job_site_address").contextPolicy]).toEqual(["confidential", "exclude"]);
    expect([f(0, "client_phone").sensitivity, f(0, "client_phone").format]).toEqual(["confidential", "phone"]);
    expect([f(1, "date_of_birth").sensitivity, f(1, "date_of_birth").contextPolicy]).toEqual(["restricted", "exclude"]);
    expect([f(1, "name").sensitivity, f(1, "name").contextPolicy]).toEqual(["confidential", "summarize"]);
  });

  it("declares a checked spec with its own catalogue id and an install plan the door can run", () => {
    const spec = describeSpec(goldReduced as unknown as Record<string, unknown>);
    const d = describeDeclaration(spec, "00000000-0000-4000-8000-000000000001", "K3X9");
    expect(d.catalogueId).toBe("DESCRIBE-K3X9");
    expect(d.organizationId).toBe("00000000-0000-4000-8000-000000000001");
    const plan = d.installPlan as { ids?: Record<string, string>; steps: Array<{ door: string }> };
    expect(plan.steps.every((s) => typeof (s as { label?: string }).label === "string")).toBe(true);
    expect(plan.steps.some((s) => s.door === "table_from_example")).toBe(true);
    expect(plan.steps.some((s) => s.door === "booking_declare")).toBe(true);
    expect(plan.steps.some((s) => s.door === "form_declare")).toBe(true);
  });

  it("hands the mandate the package's own closed lists", () => {
    const v = describeVariables("a patient intake form that books the first visit", { name: "Cedar Ridge Physical Therapy", industry: null, time_zone: "America/Los_Angeles", working_hours: null }, [], new Date("2026-10-05T18:00:00Z"));
    const vocab = JSON.parse(v.vocabulary) as Record<string, unknown>;
    expect(vocab.choice_colors).toEqual([...CHOICE_COLORS]);
    expect(vocab.template_view_kinds).toEqual([...TEMPLATE_VIEW_KINDS]);
    expect(vocab).toEqual(JSON.parse(JSON.stringify(packageVocabulary())));
    expect(v.today).toBe("2026-10-05");
    expect(JSON.parse(v.existing_tables)).toEqual([]);
  });

  it("installs into the organization's own Patients table, as a one-off on no shelf", () => {
    const spec = describeSpec(goldReduced as unknown as Record<string, unknown>);
    const token = spec.tables[0]!.token;
    const patients = { id: "7a3c1e90-2b4d-4f6a-8c1e-5d9b0a7f3e21", name: "Patients", fields: [{ key: spec.tables[0]!.fields[0]!.key, label: "Name", kind: "text" }] };
    const bound = bindReuses(spec, [{ token, existing_table_id: patients.id }, { token: "nope", existing_table_id: "00000000-0000-4000-8000-00000000dead" }], [patients]);
    expect((bound.tables[0] as { bindsTo?: unknown }).bindsTo).toEqual({ tableId: patients.id, fields: [patients.fields[0]!.key] });
    const d = describeDeclaration(bound, "00000000-0000-4000-8000-000000000001", "K3X9");
    expect(d.ephemeral).toBe(true);
  });

  it("says in one line when the answer holds no template", () => {
    expect(() => coerceDescribeAnswer({ notes: [] })).toThrow("The answer held no template.");
  });
});
