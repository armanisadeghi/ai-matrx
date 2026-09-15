import { submitSandboxLifecycleOperation } from "./lifecycle-controller";
import type { ReceiptStorage } from "@/lib/durable-run/sandbox-operation-receipt";

const receipt = { schema_version: 1 as const, row_id: "11111111-1111-4111-8111-111111111111", operation_id: "22222222-2222-4222-8222-222222222222", kind: "stop" as const, observation: "prepared" as const };
const storage: ReceiptStorage = { length: 0, key: () => null, getItem: () => null, setItem: jest.fn(), removeItem: jest.fn() };
describe("sandbox lifecycle controller", () => {
  it("does not apply an admission response after its actor generation changes", async () => {
    const result = await submitSandboxLifecycleOperation({ actorId: "33333333-3333-4333-8333-333333333333", actorGeneration: 1, isCurrentActorGeneration: () => false, storage, receipt, sandboxId: "runtime-a", adapter: { admit: async () => new Response(JSON.stringify({ row_id: receipt.row_id, sandbox_id: "runtime-a", operation_id: receipt.operation_id, kind: "stop", status: "accepted" }), { status: 202 }), status: jest.fn(), recover: jest.fn() } });
    expect(result).toBeNull();
  });
});
