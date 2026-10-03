/**
 * The screen edits a draft; the server's compiler (aidream `workflow_builder/compiler.py`) refuses
 * keys a step does not take (`extra="forbid"`) and a `to` on anything but "becomes". So what is
 * SAVED is the draft without its empty slots and without the trigger arm it is not using.
 */
import { emptySpec, freshAction, specForSave } from "../builderSpec";
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

describe("the table menu's extras", () => {
  it("reach the one action list with their own run", () => {
    const run = jest.fn();
    const [entry] = extrasAsActionHost([{ key: "workflows", label: "Workflows", onSelect: run }]).extend();
    expect(entry).toMatchObject({ id: "workflows", label: "Workflows", group: "built-on" });
    entry!.run();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
