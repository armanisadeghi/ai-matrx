import { classifyDurableSandboxLifecycleResponse } from "./lifecycle-operation";

const identity = { row_id: "11111111-1111-4111-8111-111111111111", sandbox_id: "runtime-a", operation_id: "22222222-2222-4222-8222-222222222222", kind: "stop" as const };
const response = (status: number, payload: object) => ({ ok: status >= 200 && status < 300, status, json: async () => ({ graceful: true, ...payload }) });

describe("durable sandbox lifecycle classifier", () => {
  it("does not call the backend accepted receipt success", async () => {
    await expect(classifyDurableSandboxLifecycleResponse(response(202, { ...identity, row_id: identity.row_id.replaceAll("-", ""), operation_id: identity.operation_id.replaceAll("-", ""), state: "accepted" }), identity, false)).resolves.toMatchObject({ state: "pending" });
  });
  it("keeps an accepted status read pending when the backend returns HTTP 200", async () => {
    await expect(classifyDurableSandboxLifecycleResponse(response(200, { ...identity, row_id: identity.row_id.replaceAll("-", ""), operation_id: identity.operation_id.replaceAll("-", ""), state: "running" }), identity, true)).resolves.toMatchObject({ state: "pending" });
  });
  it("rejects a mismatched receipt as unknown", async () => {
    await expect(classifyDurableSandboxLifecycleResponse(response(200, { ...identity, operation_id: "33333333333343338333333333333333", state: "succeeded" }), identity, false)).resolves.toMatchObject({ state: "unknown" });
  });
  it("does not regress an accepted receipt on conflict", async () => {
    await expect(classifyDurableSandboxLifecycleResponse(response(409, { error: "Sandbox lifecycle operation was refused" }), identity, true)).resolves.toMatchObject({ state: "unknown" });
  });
});
