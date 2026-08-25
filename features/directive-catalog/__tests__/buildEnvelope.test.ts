import {
  buildDirectiveEnvelope,
  referenceFieldsForSpecs,
  type RefFieldSpec,
} from "../buildEnvelope";

const AGENT_FIELDS: RefFieldSpec[] = [
  { key: "id", label: "Record ID", uuid: true },
];

describe("directive reference examples", () => {
  it("shows a noun-specific identity placeholder before an id is selected", () => {
    const fields = referenceFieldsForSpecs(AGENT_FIELDS, {}, "agent");

    const shell = buildDirectiveEnvelope("reference", "agent", fields);
    expect(shell).toEqual({
      __kind: "directive_v1_reference_agent",
      items: [{ id: "<agent.id>" }],
    });
    // `__kind` FIRST is the contract, not an accident of the literal: the
    // streaming detector types a JSON document by its first key alone.
    expect(Object.keys(shell)).toEqual(["__kind", "items"]);
  });

  it("updates placeholders when the selected noun changes", () => {
    const taskFields = referenceFieldsForSpecs(AGENT_FIELDS, {}, "task");

    expect(buildDirectiveEnvelope("view", "task", taskFields)).toMatchObject({
      __kind: "directive_v1_view_task",
      items: [{ id: "<task.id>" }],
    });
  });

  it("mints the verb as the directive CLASS — a write is one slug, not a colon pair", () => {
    expect(
      buildDirectiveEnvelope("create", "task", { name: "Ship it" }),
    ).toEqual({
      __kind: "directive_v1_create_task",
      items: [{ name: "Ship it" }],
    });
  });

  it("REFUSES to mint a slug the grammar could not parse back", () => {
    // A noun the grammar rejects must fail here, loudly, rather than ship a
    // string nothing downstream can route.
    expect(() => buildDirectiveEnvelope("create", "Task", {})).toThrow(/noun/);
  });

  it("projects away stale fields from the previously selected noun", () => {
    const fields = referenceFieldsForSpecs(
      [{ key: "file_id", label: "File ID", uuid: true }],
      { id: "stale-agent-id", file_id: "current-file-id" },
    );

    expect(fields).toEqual({ file_id: "current-file-id" });
  });
});
