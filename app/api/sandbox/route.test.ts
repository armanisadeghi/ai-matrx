/** @jest-environment node */

import { NextRequest } from "next/server";
import { POST } from "./route";

const mockCreateClient = jest.fn();
const mockReconcile = jest.fn();

jest.mock("@/utils/supabase/server", () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }));
jest.mock("@/utils/supabase/workspaceDb", () => ({ workspaceDb: (client: unknown) => client }));
jest.mock("@/lib/sandbox/reconcile", () => ({ reconcileUserSandboxes: (...args: unknown[]) => mockReconcile(...args) }));
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
  return { auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) }, from: jest.fn(() => countQuery(result)) };
}

afterEach(() => { jest.restoreAllMocks(); mockCreateClient.mockReset(); mockReconcile.mockReset(); });

test("fails closed before orchestration or persistence when the active-count read fails", async () => {
  const client = clientForCount({ data: null, error: { message: "db unavailable" } }); mockCreateClient.mockResolvedValue(client);
  const fetch = jest.spyOn(global, "fetch");
  const response = await POST(request());
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({ error: "Sandbox capacity check is temporarily unavailable. Try again shortly." });
  expect(fetch).not.toHaveBeenCalled(); expect(client.from).toHaveBeenCalledTimes(1);
});

test("keeps the five active sandbox ceiling before orchestration", async () => {
  const client = clientForCount({ data: Array.from({ length: 5 }, (_, index) => ({ id: String(index) })), error: null }); mockCreateClient.mockResolvedValue(client); mockReconcile.mockResolvedValue({ reconciled: 0 });
  const fetch = jest.spyOn(global, "fetch");
  const response = await POST(request());
  expect(response.status).toBe(429); expect(fetch).not.toHaveBeenCalled();
});

test("fails closed when reconciliation's replacement count read fails", async () => {
  const client = clientForCount({ data: Array.from({ length: 5 }, (_, index) => ({ id: String(index) })), error: null });
  client.from.mockImplementationOnce(() => countQuery({ data: Array.from({ length: 5 }, (_, index) => ({ id: String(index) })), error: null })).mockImplementationOnce(() => countQuery({ data: null, error: { message: "retry read unavailable" } }));
  mockCreateClient.mockResolvedValue(client); mockReconcile.mockResolvedValue({ reconciled: 1 }); const fetch = jest.spyOn(global, "fetch");
  const response = await POST(request());
  expect(response.status).toBe(503); expect(fetch).not.toHaveBeenCalled(); expect(client.from).toHaveBeenCalledTimes(2);
});

test("admits below the ceiling and persists only after orchestration succeeds", async () => {
  const upsert = jest.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "row-1", sandbox_id: "sandbox-1" }, error: null }) }) }));
  const client = clientForCount({ data: [{ id: "one" }], error: null });
  client.from.mockImplementationOnce(() => countQuery({ data: [{ id: "one" }], error: null })).mockImplementationOnce(() => ({ upsert } as unknown as ReturnType<typeof countQuery>)); mockCreateClient.mockResolvedValue(client);
  jest.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ sandbox_id: "sandbox-1", status: "creating", container_id: null }) } as Response);
  const response = await POST(request());
  expect(response.status).toBe(201); expect(upsert).toHaveBeenCalledTimes(1);
});
