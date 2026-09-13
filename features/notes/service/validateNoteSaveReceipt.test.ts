import { validateNoteSaveReceipt } from "./validateNoteSaveReceipt";

const base = { noteId: "n", organizationId: "o", version: 7 };
const receipt = (overrides: Record<string, unknown> = {}) => ({ databaseWrite: "saved", note: { id: "n", organization_id: "o", version: 8, content: "body", label: "label", folder_id: null, tags: ["a"], visibility: "personal" }, succeededFields: [], failedFields: [], safeCauses: {}, ...overrides });

describe("validateNoteSaveReceipt", () => {
  it("binds every submitted physical field", () => {
    expect(validateNoteSaveReceipt({ base, receipt: receipt({ note: { ...receipt().note, tags: ["a", "b"] } }), submittedPhysical: { content: "body", label: "label", folder_id: null, tags: ["a", "b"], visibility: "personal" }, requirePhysicalWrite: true }).databaseWrite).toBe("saved");
    expect(() => validateNoteSaveReceipt({ base, receipt: receipt({ note: { ...receipt().note, content: "wrong" } }), submittedPhysical: { content: "body" } })).toThrow(/does not match/i);
  });
  it("requires an exact requested context partition", () => {
    expect(validateNoteSaveReceipt({ base, receipt: receipt({ databaseWrite: "unchanged", note: { ...receipt().note, version: 7 }, succeededFields: ["project_id"], failedFields: ["task_id"], safeCauses: { task_id: "denied" } }), submittedPhysical: {}, contextFields: ["project_id", "task_id"] }).databaseWrite).toBe("unchanged");
    expect(() => validateNoteSaveReceipt({ base, receipt: receipt({ succeededFields: ["project_id"], failedFields: [] }), submittedPhysical: {}, contextFields: ["task_id"] })).toThrow(/context partition/i);
  });
  it.each(["project", null])("binds successful context to its exact submitted value %p", (submitted) => {
    const acknowledged = receipt({ note: { ...receipt().note, project_id: submitted }, succeededFields: ["project_id"] });
    expect(validateNoteSaveReceipt({ base, receipt: acknowledged, submittedPhysical: {}, submittedContext: { project_id: submitted } }).note.project_id).toBe(submitted);
    const mismatched = receipt({ note: { ...receipt().note, project_id: submitted === null ? "other" : null }, succeededFields: ["project_id"] });
    expect(() => validateNoteSaveReceipt({ base, receipt: mismatched, submittedPhysical: {}, submittedContext: { project_id: submitted } })).toThrow(/submitted context values/);
    expect(() => validateNoteSaveReceipt({ base, receipt: acknowledged, submittedPhysical: {}, submittedContext: {} })).toThrow(/submitted context partition/);
  });
  it("refuses unchanged physical writes, malformed receipt shapes, and wrong identity", () => {
    expect(() => validateNoteSaveReceipt({ base, receipt: receipt({ databaseWrite: "unchanged", note: { ...receipt().note, version: 7 } }), submittedPhysical: { content: "body" }, requirePhysicalWrite: true })).toThrow(/revision/i);
    const sparse: string[] = []; sparse.length = 1;
    expect(() => validateNoteSaveReceipt({ base, receipt: receipt({ succeededFields: sparse }), submittedPhysical: {} })).toThrow(/invalid context/i);
    expect(() => validateNoteSaveReceipt({ base, receipt: receipt({ note: { ...receipt().note, id: "other" } }), submittedPhysical: {} })).toThrow(/does not match/i);
  });
});
