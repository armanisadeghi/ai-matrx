/** @jest-environment node */

import { NextRequest } from "next/server";
import { GET } from "./route";

const lookup = jest.fn();

jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  lookupSandboxAndOrchestrator: (...args: unknown[]) => lookup(...args),
  orchestratorJsonHeaders: () => ({ "X-API-Key": "test-key" }),
}));

const sandboxRowId = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: sandboxRowId }) };
const operationId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  jest.restoreAllMocks();
  lookup.mockResolvedValue({
    ok: true,
    sandboxId: "sbx-1",
    orchestrator: { url: "https://hosted.example.test", apiKey: "hosted-key" },
  });
});

test("forwards an exact operation id through the owner-gated status proxy", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        sandbox_id: "sbx-1",
        operation_id: operationId,
        outcome: "recovering",
        execution_state: "running",
        phase: "rollback",
      }),
      { status: 200 },
    ),
  );

  const response = await GET(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migration?operation_id=${operationId}`,
    ),
    params,
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    sandbox_id: sandboxRowId,
    outcome: "recovering",
  });
  expect(fetch).toHaveBeenCalledWith(
    `https://hosted.example.test/sandboxes/sbx-1/migration?operation_id=${operationId}`,
    expect.objectContaining({ method: "GET" }),
  );
});

test("without a saved id, exposes only the orchestrator's current live operation", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        sandbox_id: "sbx-1",
        operation_id: operationId,
        outcome: "in_progress",
        execution_state: "running",
        phase: "target_start_intent",
      }),
      { status: 200 },
    ),
  );

  const response = await GET(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migration`,
    ),
    params,
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    sandbox_id: sandboxRowId,
    outcome: "in_progress",
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://hosted.example.test/sandboxes/sbx-1/migration",
    expect.objectContaining({ method: "GET" }),
  );
});

test("does not turn a mismatched terminal result into current success", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(
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

  const response = await GET(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migration?operation_id=${operationId}`,
    ),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ status: "outcome_unknown" });
});

test("rejects another internal sandbox before projecting the row id", async () => {
  jest.spyOn(global, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        sandbox_id: "sbx-other",
        operation_id: operationId,
        outcome: "migrated",
        execution_state: "done",
        phase: "cleanup_complete",
      }),
      { status: 200 },
    ),
  );

  const response = await GET(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migration?operation_id=${operationId}`,
    ),
    params,
  );

  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ status: "outcome_unknown" });
});

test("rejects a noncanonical requested operation before contacting the orchestrator", async () => {
  const upstream = jest.spyOn(global, "fetch");
  const response = await GET(
    new NextRequest(
      `https://app.example.test/api/sandbox/${sandboxRowId}/migration?operation_id=not-a-canonical-operation`,
    ),
    params,
  );

  expect(response.status).toBe(422);
  expect(upstream).not.toHaveBeenCalled();
});
