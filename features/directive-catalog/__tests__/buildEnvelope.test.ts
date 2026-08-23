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

    expect(buildDirectiveEnvelope("reference", "agent", fields)).toEqual({
      matrx_version: 1,
      kind: "reference",
      type: "agent",
      items: [{ id: "<agent.id>" }],
    });
  });

  it("updates placeholders when the selected noun changes", () => {
    const taskFields = referenceFieldsForSpecs(AGENT_FIELDS, {}, "task");

    expect(buildDirectiveEnvelope("view", "task", taskFields)).toMatchObject({
      type: "task",
      items: [{ id: "<task.id>" }],
    });
  });

  it("projects away stale fields from the previously selected noun", () => {
    const fields = referenceFieldsForSpecs(
      [{ key: "file_id", label: "File ID", uuid: true }],
      { id: "stale-agent-id", file_id: "current-file-id" },
    );

    expect(fields).toEqual({ file_id: "current-file-id" });
  });
});
