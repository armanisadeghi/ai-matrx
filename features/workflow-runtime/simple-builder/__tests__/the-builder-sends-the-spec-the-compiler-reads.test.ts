/**
 * The screen edits a draft; the server's compiler (aidream `workflow_builder/compiler.py`) refuses
 * keys a step does not take (`extra="forbid"`) and a `to` on anything but "becomes". So what is
 * SAVED is the draft without its empty slots and without the trigger arm it is not using.
 */
import { emptySpec, freshAction, specForSave, TRIGGER_LABEL } from "../builderSpec";
import { workflowSummary } from "../workflowSummary";
import { extrasAsActionHost } from "@/features/unified-data/actions/tableMenuExtensions";

const TABLE = "5b0f7f0e-8a3c-4c1e-9a52-1c2d3e4f5a6b";

describe("the saved spec", () => {
  it("drops empty fields and keeps the becomes rule", () => {
    const spec = emptySpec(TABLE);
    spec.trigger.to = { op: "eq", args: [{ field: "f1" }, { const: "Scheduled" }] };
    spec.actions = [{ ...freshAction("create_record", TABLE), table_id: "visits", values: { patient: "{{trigger.record.name}}" } }, freshAction("notify_person", TABLE)];
    const saved = specForSave(spec);
    expect(saved.trigger).toEqual({ event: "record.matches", table_id: TABLE, to: spec.trigger.to });
    expect(saved.actions[0]).toEqual({ type: "create_record", table_id: "visits", values: { patient: "{{trigger.record.name}}" } });
    expect(saved.actions[1]).toEqual({ type: "notify_person" });
  });

  it("never sends a becomes rule on another event", () => {
    const spec = emptySpec(TABLE);
    spec.trigger = { event: "record.updated", table_id: TABLE, to: { const: true }, field_ids: ["f2"] };
    expect(specForSave(spec).trigger).toEqual({ event: "record.updated", table_id: TABLE, field_ids: ["f2"] });
  });
});

describe("form answered / booking made (AGENTS-ON-DATA item 5)", () => {
  it("the picker offers both, and they save as the compiler's verbs with no becomes rule", () => {
    expect(TRIGGER_LABEL["form.answered"]).toBe("comes in from a form");
    expect(TRIGGER_LABEL["booking.made"]).toBe("comes in from a booking");
    for (const event of ["form.answered", "booking.made"] as const) {
      const spec = emptySpec(TABLE);
      spec.trigger = { event, table_id: TABLE, to: { const: true } };
      expect(specForSave(spec).trigger).toEqual({ event, table_id: TABLE });
    }
  });

  it("the sentence says what starts it", () => {
    const spec = emptySpec(TABLE);
    spec.trigger = { event: "form.answered", table_id: TABLE };
    expect(workflowSummary(spec, { tableName: "Leads", fieldName: () => null, otherTableName: () => null })).toMatch(
      /^When someone answers the form \(a new lead\)/i,
    );
  });
});

describe("fill a column with AI (AGENTS-ON-DATA item 5)", () => {
  it("saves as the compiler's fill_with_ai step and reads as a sentence", () => {
    const spec = emptySpec(TABLE);
    spec.trigger = { event: "form.answered", table_id: TABLE };
    spec.actions = [{ ...freshAction("fill_with_ai", TABLE), field_id: "f-summary" }];
    expect(specForSave(spec).actions[0]).toEqual({ type: "fill_with_ai", field_id: "f-summary" });
    expect(
      workflowSummary(spec, { tableName: "Leads", fieldName: (r) => (r === "f-summary" ? "Summary" : null), otherTableName: () => null }),
    ).toMatch(/fill Summary with AI/);
  });
});

describe("the table menu's extras", () => {
  it("reach the one action list with their own run", () => {
    const run = jest.fn();
    const [entry] = extrasAsActionHost([{ key: "workflows", label: "Workflows", onSelect: run }]).extend();
    expect(entry).toMatchObject({ id: "workflows", label: "Workflows", group: "built-on" });
    entry!.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
