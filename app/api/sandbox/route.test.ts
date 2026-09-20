/** @jest-environment node */

import { withClaims as mockWithClaims } from "@/test-utils/supabase-auth";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockCreateClient = jest.fn();

jest.mock("@/utils/supabase/server", () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }));
jest.mock("@/utils/supabase/workspaceDb", () => ({ workspaceDb: (client: unknown) => client }));
jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  resolveOrchestratorByTier: () => ({ tier: "ec2", url: "https://orchestrator.example.test", apiKey: "test-key" }),
  orchestratorJsonHeaders: () => ({ "X-API-Key": "test-key" }),
}));
jest.mock("@/lib/sandbox/decorate-sandbox-row", () => ({ decorateSandboxRow: (row: unknown) => row }));

const user = { id: "11111111-1111-4111-8111-111111111111" };
const body = { organization_id: "22222222-2222-4222-8222-222222222222", tier: "ec2" };
const request = () => new NextRequest("http://localhost/api/sandbox", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const countQuery = (result: unknown) => ({ select: () => ({ eq: () => ({ in: () => ({ is: async () => result }) }) }) });

function clientForCount(result: unknown) {
  return { auth: mockWithClaims({ getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }), from: jest.fn(() => countQuery(result)) };
}

afterEach(() => { jest.restoreAllMocks(); mockCreateClient.mockReset(); });

test("fails closed before orchestration or persistence when the active-count read fails", async () => {
  const client = clientForCount({ count: null, error: { message: "db unavailable" } }); mockCreateClient.mockResolvedValue(client);
  const fetch = jest.spyOn(global, "fetch");
  const response = await POST(request());
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({ error: "Sandbox capacity check is temporarily unavailable. Try again shortly." });
  expect(fetch).not.toHaveBeenCalled(); expect(client.from).toHaveBeenCalledTimes(1);
});

test("keeps the five active sandbox ceiling before orchestration", async () => {
  const client = clientForCount({ count: 5, error: null }); mockCreateClient.mockResolvedValue(client);
  const fetch = jest.spyOn(global, "fetch");
  const response = await POST(request());
  expect(response.status).toBe(429); expect(fetch).not.toHaveBeenCalled();
});

test("admits below the ceiling and persists only after orchestration succeeds", async () => {
  const upsert = jest.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "row-1", sandbox_id: "sandbox-1" }, error: null }) }) }));
  const client = clientForCount({ count: 1, error: null });
  client.from.mockImplementationOnce(() => countQuery({ count: 1, error: null })).mockImplementationOnce(() => ({ upsert } as unknown as ReturnType<typeof countQuery>)); mockCreateClient.mockResolvedValue(client);
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ sandbox_id: "sandbox-1", status: "creating", container_id: null }) } as Response);
  const response = await POST(request());
  expect(response.status).toBe(201); expect(upsert).toHaveBeenCalledTimes(1);
});

test("preserves the orchestrator's atomic capacity refusal", async () => {
  const client = clientForCount({ count: 4, error: null });
  mockCreateClient.mockResolvedValue(client);
  jest.spyOn(global, "fetch").mockResolvedValue({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({
      detail: { code: "admission_capacity_exceeded", ceiling: 5, occupied: 5 },
    }),
  } as Response);

  const response = await POST(request());

  expect(response.status).toBe(429);
  expect(client.from).toHaveBeenCalledTimes(1);
});
