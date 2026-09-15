import { classifyDurableSandboxLifecycleResponse } from "./lifecycle-operation";

const identity = { row_id: "11111111-1111-4111-8111-111111111111", sandbox_id: "runtime-a", operation_id: "22222222-2222-4222-8222-222222222222", kind: "stop" as const };
const response = (status: number, payload: object) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });

describe("durable sandbox lifecycle classifier", () => {
  it("does not call an accepted admission success", async () => {
    await expect(classifyDurableSandboxLifecycleResponse(response(202, { ...identity, status: "accepted" }), identity, false)).resolves.toMatchObject({ state: "pending" });
  });
  it("rejects a mismatched receipt as unknown", async () => {
    await expect(classifyDurableSandboxLifecycleResponse(response(200, { ...identity, operation_id: "33333333-3333-4333-8333-333333333333", status: "succeeded" }), identity, false)).resolves.toMatchObject({ state: "unknown" });
  });
  it("does not regress an accepted receipt on conflict", async () => {
    await expect(classifyDurableSandboxLifecycleResponse(response(409, { ...identity, error: "busy" }), identity, true)).resolves.toMatchObject({ state: "unknown" });
  });
});
