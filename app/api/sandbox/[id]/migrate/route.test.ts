/** @jest-environment node */

import { NextRequest } from "next/server";
import { POST } from "./route";

const lookup = jest.fn();

jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  lookupSandboxAndOrchestrator: (...args: unknown[]) => lookup(...args),
  orchestratorJsonHeaders: () => ({ "X-API-Key": "test-key" }),
}));

const params = { params: Promise.resolve({ id: "row-1" }) };
const busyResult = (reason: string) => ({
  detail: {
    status: "busy_deferred",
    sandbox_id: "sbx-1",
    reason,
  },
});

beforeEach(() => {
  jest.restoreAllMocks();
  lookup.mockResolvedValue({
    ok: true,
    sandboxId: "sbx-1",
    orchestrator: { url: "https://hosted.example.test", apiKey: "hosted-key" },
  });
});

test.each([
  "box has in-flight tool calls; defer migration to an idle gap",
  "box had a recent heartbeat; defer migration until idle",
])("returns a machine-readable busy refusal for %s", async (reason) => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify(busyResult(reason)), { status: 409 }),
    );

  const response = await POST(
    new NextRequest("https://app.example.test/api/sandbox/row-1/migrate", {
      method: "POST",
    }),
    params,
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error:
      "Sandbox is still in use. Wait for an idle gap before retrying. No update was made.",
    status: "busy_deferred",
    details: {
      status: "busy_deferred",
      sandbox_id: "sbx-1",
      reason,
    },
  });
});

test("keeps an unknown upstream failure on the existing error path", async () => {
  const failure = {
    detail: { status: "recovery_required", reason: "journal uncertain" },
  };
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(JSON.stringify(failure), { status: 502 }));

  const response = await POST(
    new NextRequest("https://app.example.test/api/sandbox/row-1/migrate", {
      method: "POST",
    }),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    error: "Sandbox image update failed",
    upstream_status: 502,
    details: failure,
  });
});
