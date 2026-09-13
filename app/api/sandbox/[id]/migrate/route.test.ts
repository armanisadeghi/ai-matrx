/** @jest-environment node */

import { NextRequest } from "next/server";
import { POST } from "./route";

const lookup = jest.fn();

jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  lookupSandboxAndOrchestrator: (...args: unknown[]) => lookup(...args),
  orchestratorJsonHeaders: () => ({ "X-API-Key": "test-key" }),
}));

const sandboxRowId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: sandboxRowId }) };
const operationId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const busyResult = (reason: string, busyOperationId = operationId) => ({
  detail: {
    status: "busy_deferred",
    sandbox_id: "sbx-1",
    operation_id: busyOperationId,
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
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=${operationId}`,
      {
        method: "POST",
      },
    ),
    params,
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({
    error: `Sandbox update deferred: ${reason}. No update was made.`,
    status: "busy_deferred",
    details: {
      status: "busy_deferred",
      sandbox_id: sandboxRowId,
      operation_id: operationId,
      reason,
    },
  });
});

test("does not turn another operation's busy refusal into an informational deferral", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify(
          busyResult(
            "attached sessions remain",
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          ),
        ),
        { status: 409 },
      ),
    );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=${operationId}`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    status: "outcome_unknown",
    operation_id: operationId,
  });
});

test("does not turn an uncorrelated busy refusal into an informational deferral", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        detail: {
          status: "busy_deferred",
          sandbox_id: "sbx-1",
          reason: "attached sessions remain",
        },
      }),
      { status: 409 },
    ),
  );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=${operationId}`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    status: "outcome_unknown",
    operation_id: operationId,
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
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate`,
      {
        method: "POST",
      },
    ),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({
    error: "Sandbox image update failed",
    upstream_status: 502,
    details: failure,
  });
});

test("forwards a confirmed attached-session interruption explicitly", async () => {
  const upstream = jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        sandbox_id: "sbx-1",
        operation_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "migrated",
        execution_state: "done",
        phase: "cleanup_complete",
      }),
      { status: 200 },
    ),
  );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?interrupt_attached_sessions=true&operation_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ sandbox_id: sandboxRowId });
  expect(upstream).toHaveBeenCalledWith(
    expect.stringMatching(
      /^https:\/\/hosted\.example\.test\/sandboxes\/sbx-1\/migrate\?interrupt_attached_sessions=true&operation_id=[0-9a-f]{32}$/,
    ),
    expect.objectContaining({ method: "POST" }),
  );
});

test("on a POST timeout reconnects to the exact live operation instead of reporting failure", async () => {
  jest
    .spyOn(global, "fetch")
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sandbox_id: "sbx-1",
          operation_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          outcome: "in_progress",
          execution_state: "running",
          phase: "target_start_intent",
        }),
        { status: 200 },
      ),
    );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({
    sandbox_id: sandboxRowId,
    outcome: "in_progress",
  });
  expect(fetch).toHaveBeenLastCalledWith(
    "https://hosted.example.test/sandboxes/sbx-1/migration?operation_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    expect.objectContaining({ method: "GET" }),
  );
});

test("on a POST timeout returns exact committed status as success", async () => {
  jest
    .spyOn(global, "fetch")
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sandbox_id: "sbx-1",
          operation_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          outcome: "migrated",
          execution_state: "done",
          phase: "cleanup_complete",
        }),
        { status: 200 },
      ),
    );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    sandbox_id: sandboxRowId,
    outcome: "migrated",
  });
});

test("on a POST timeout preserves a rolled-back result as actionable non-success", async () => {
  jest
    .spyOn(global, "fetch")
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sandbox_id: "sbx-1",
          operation_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          outcome: "rolled_back",
          execution_state: "done",
          phase: "cleanup_complete",
          reason: "retained runtime restored",
        }),
        { status: 200 },
      ),
    );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({
    sandbox_id: sandboxRowId,
    outcome: "rolled_back",
    reason: "retained runtime restored",
  });
});

test.each([
  ["in_progress", "running", "target_start_intent", 202],
  ["migrated", "done", "cleanup_complete", 200],
  ["rolled_back", "done", "cleanup_complete", 409],
] as const)(
  "reconciles upstream 502 to exact %s status",
  async (outcome, execution_state, phase, expectedStatus) => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "upstream interrupted" }), {
          status: 502,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sandbox_id: "sbx-1",
            operation_id: operationId,
            outcome,
            execution_state,
            phase,
          }),
          { status: 200 },
        ),
      );

    const response = await POST(
      new NextRequest(
        `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=${operationId}`,
        { method: "POST" },
      ),
      params,
    );

    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toMatchObject({
      sandbox_id: sandboxRowId,
      outcome,
    });
  },
);

test("makes a 502 reconciliation mismatch loud rather than reusing stale success", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "failure" }), { status: 502 }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sandbox_id: "sbx-1",
          operation_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          outcome: "migrated",
          execution_state: "done",
          phase: "cleanup_complete",
        }),
        { status: 200 },
      ),
    );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=${operationId}`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ status: "outcome_unknown" });
});

test("refuses a timeout status response for a different operation", async () => {
  jest
    .spyOn(global, "fetch")
    .mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sandbox_id: "sbx-1",
          operation_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          outcome: "migrated",
          execution_state: "done",
          phase: "cleanup_complete",
        }),
        { status: 200 },
      ),
    );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ status: "outcome_unknown" });
});

test("rejects an upstream success for another internal sandbox before projection", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        sandbox_id: "sbx-other",
        operation_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        outcome: "migrated",
        execution_state: "done",
        phase: "cleanup_complete",
      }),
      { status: 200 },
    ),
  );

  const response = await POST(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migrate?operation_id=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      { method: "POST" },
    ),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({
    error: "Sandbox manager returned an update result for a different sandbox.",
  });
});
