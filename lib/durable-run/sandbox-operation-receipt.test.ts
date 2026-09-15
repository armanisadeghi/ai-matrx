import { readSandboxOperationReceipts, writeSandboxOperationReceipt, type ReceiptStorage } from "./sandbox-operation-receipt";

const actor = "11111111-1111-4111-8111-111111111111";
const receipt = { schema_version: 1 as const, row_id: "22222222-2222-4222-8222-222222222222", operation_id: "33333333-3333-4333-8333-333333333333", kind: "delete" as const, observation: "prepared" as const };
function storage(): ReceiptStorage {
  const values = new Map<string, string>();
  return { get length() { return values.size; }, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), key: (index) => [...values.keys()][index] ?? null };
}
describe("sandbox operation receipt storage", () => {
  it("reads only the current actor namespace after write/readback", () => {
    const local = storage();
    expect(writeSandboxOperationReceipt(local, actor, receipt)).toBe(true);
    expect(readSandboxOperationReceipts(local, actor)).toEqual([receipt]);
    expect(readSandboxOperationReceipts(local, "44444444-4444-4444-8444-444444444444")).toEqual([]);
  });
});
