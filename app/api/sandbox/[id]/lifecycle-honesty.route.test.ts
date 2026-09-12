/** @jest-environment node */

import {
  DELETE as adminDelete,
  GET as adminGet,
  PUT as adminPut,
} from "@/app/api/admin/sandbox/[id]/route";
import {
  DELETE as userDelete,
  PUT as userPut,
} from "@/app/api/sandbox/[id]/route";
import { POST as extend } from "@/app/api/sandbox/[id]/extend/route";

const rows: Array<{ data: any; error: any }> = [];
const update = jest.fn();
const remove = jest.fn();
const query = {
  select: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(() =>
    Promise.resolve(
      rows.shift() ?? { data: null, error: { code: "PGRST116" } },
    ),
  ),
  maybeSingle: jest.fn(() =>
    Promise.resolve(rows.shift() ?? { data: null, error: null }),
  ),
  update,
  delete: remove,
};
const from = jest.fn(() => query);
const auth = {
  getUser: jest.fn(async () => ({
    data: { user: { id: "admin" } },
    error: null,
  })),
};
const lookup = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth, from })),
}));
jest.mock("@/utils/supabase/adminClient", () => ({
  createAdminClient: jest.fn(() => ({ from })),
}));
jest.mock("@/utils/supabase/userSessionData", () => ({
  checkIsSuperAdmin: jest.fn(async () => true),
}));
jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  orchestratorJsonHeaders: (target: { apiKey: string }) => ({
    "Content-Type": "application/json",
    "X-API-Key": target.apiKey,
  }),
  resolvePersistedOrchestrator: (tier: string, config: unknown) =>
    tier === "hosted" || tier === "ec2"
      ? {
          ok: true,
          orchestrator: {
            url: `https://${tier}.example.test`,
            apiKey: `${tier}-key`,
            tier,
          },
        }
      : { ok: false, error: "Sandbox has an invalid persisted tier" },
  lookupSandboxAndOrchestrator: (...args: unknown[]) => lookup(...args),
}));
jest.mock("@/lib/sandbox/decorate-sandbox-row", () => ({
  decorateSandboxRow: (row: unknown) => row,
}));

const params = { params: Promise.resolve({ id: "row-1" }) };
const row = (overrides = {}) => ({
  id: "row-1",
  sandbox_id: "sbx-1",
  status: "running",
  tier: "hosted",
  config: { tier: "hosted" },
  expires_at: "2030-01-01T00:00:00.000Z",
  ...overrides,
});
const request = (body?: unknown) =>
  new Request("https://app.example.test", {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  rows.length = 0;
  jest.clearAllMocks();
  lookup.mockResolvedValue({
    ok: true,
    sandboxId: "sbx-1",
    status: "running",
    orchestrator: {
      url: "https://hosted.example.test",
      apiKey: "hosted-key",
      tier: "hosted",
    },
  });
});

test.each([403, 404, 503])(
  "admin stop preserves DB when upstream returns %i",
  async (status) => {
    rows.push({ data: row(), error: null });
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("refused", { status }));
    const response = await adminPut(request({ action: "stop" }) as any, params);
    expect(response.status).toBe(status === 503 ? 502 : status);
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  },
);

test("admin stop uses hosted target/key then returns only orchestrator-persisted stopped row", async () => {
  rows.push(
    { data: row(), error: null },
    { data: row({ status: "stopped" }), error: null },
  );
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(null, { status: 204 }));
  const response = await adminPut(request({ action: "stop" }) as any, params);
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    "https://hosted.example.test/sandboxes/sbx-1?graceful=true",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-API-Key": "hosted-key" }),
    }),
  );
  expect(update).not.toHaveBeenCalled();
});

test("admin delete network failure does not hard-delete or mutate its row", async () => {
  rows.push({ data: row({ status: "stopped" }), error: null });
  jest.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
  const response = await adminDelete(
    new Request("https://app.example.test") as any,
    params,
  );
  expect(response.status).toBe(502);
  expect(update).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test("user delete invokes graceful purge for stopped history and requires the row to disappear", async () => {
  lookup.mockResolvedValue({
    ok: true,
    sandboxId: "sbx-1",
    status: "stopped",
    orchestrator: {
      url: "https://ec2.example.test",
      apiKey: "ec2-key",
      tier: "ec2",
    },
  });
  rows.push({ data: null, error: null });
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response(null, { status: 204 }));
  const response = await userDelete(
    new Request("https://app.example.test") as any,
    params,
  );
  expect(response.status).toBe(204);
  expect(fetch).toHaveBeenCalledWith(
    "https://ec2.example.test/sandboxes/sbx-1?graceful=true&purge=true",
    expect.anything(),
  );
  expect(update).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test("user stop upstream 403 cannot be converted into a local stopped state", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response("denied", { status: 403 }));
  const response = await userPut(request({ action: "stop" }) as any, params);
  expect(response.status).toBe(403);
  expect(update).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test("extend refuses unbounded expiry before network or a DB write", async () => {
  rows.push({ data: { expires_at: null }, error: null });
  const fetch = jest.spyOn(global, "fetch");
  const response = await extend(request({ ttl_seconds: 3600 }) as any, params);
  expect(response.status).toBe(409);
  expect(fetch).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});

test("extend 503 has no local mirror write", async () => {
  rows.push({ data: { expires_at: "2030-01-01T00:00:00.000Z" }, error: null });
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(new Response("bad", { status: 503 }));
  const response = await extend(request({ ttl_seconds: 3600 }) as any, params);
  expect(response.status).toBe(502);
  expect(update).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
});

test("extend accepts only the matching persisted upstream expiry", async () => {
  const expiry = "2030-01-01T01:00:00.000Z";
  rows.push(
    { data: { expires_at: "2030-01-01T00:00:00.000Z" }, error: null },
    { data: row({ expires_at: expiry }), error: null },
  );
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ new_expires_at: expiry }), { status: 200 }),
    );
  const response = await extend(request({ ttl_seconds: 3600 }) as any, params);
  expect(response.status).toBe(200);
  expect(fetch).toHaveBeenCalledWith(
    "https://hosted.example.test/sandboxes/sbx-1/extend",
    expect.objectContaining({
      headers: expect.objectContaining({ "X-API-Key": "hosted-key" }),
    }),
  );
  expect(update).not.toHaveBeenCalled();
});

test("admin GET inspects an invalid-tier row without attempting destructive routing", async () => {
  rows.push({ data: row({ tier: "wrong" }), error: null });
  const response = await adminGet(
    new Request("https://app.example.test") as any,
    params,
  );
  expect(response.status).toBe(200);
  expect(fetch).not.toHaveBeenCalled();
});

test("extend accepts semantically equal ISO timestamps with different wire formatting", async () => {
  rows.push(
    { data: { expires_at: "2030-01-01T00:00:00Z" }, error: null },
    { data: row({ expires_at: "2030-01-01T01:00:00.000+00:00" }), error: null },
  );
  jest
    .spyOn(global, "fetch")
    .mockResolvedValue(
      new Response(JSON.stringify({ new_expires_at: "2030-01-01T01:00:00Z" }), {
        status: 200,
      }),
    );
  const response = await extend(request({ ttl_seconds: 3600 }) as any, params);
  expect(response.status).toBe(200);
});

test("admin GET maps database transport errors to sanitized 500", async () => {
  rows.push({ data: null, error: { message: "connection reset" } });
  const response = await adminGet(
    new Request("https://app.example.test") as any,
    params,
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: "Failed to read sandbox instance",
  });
  expect(update).not.toHaveBeenCalled();
});
