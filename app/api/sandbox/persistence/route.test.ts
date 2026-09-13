/** @jest-environment node */

import { NextRequest } from "next/server";
import { createServer } from "node:http";
import { DELETE, GET } from "./route";
import { normalizePersistenceInfo } from "@/lib/sandbox/persistence-read";

const mockCreateClient = jest.fn();
const mockResolveOrchestratorByTier = jest.fn();

jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  resolveOrchestratorByTier: (tier: string) =>
    mockResolveOrchestratorByTier(tier) ?? {
      tier,
      url: `https://${tier}.example.test`,
      apiKey: `${tier}-key`,
    },
  orchestratorJsonHeaders: (target: { apiKey: string }) => ({
    "X-API-Key": target.apiKey,
  }),
}));

jest.mock("@/utils/supabase/server", () => ({
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

function authenticatedSession(userId = "admin-user") {
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: userId } },
        error: null,
      }),
    },
  });
}

function completeWirePayload(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "admin-user",
    tier: "hosted",
    volume_name: "matrx-user-admin-user",
    volume_bytes: null,
    volume_bytes_known: false,
    s3_bucket: null,
    s3_hot_prefix: null,
    s3_cold_prefix: null,
    sandboxes_total: 1,
    sandboxes_active: 1,
    ...overrides,
  };
}

afterEach(() => {
  jest.restoreAllMocks();
  mockCreateClient.mockReset();
  mockResolveOrchestratorByTier.mockReset();
});

test("normalizes the live hosted wire names instead of dropping active sandboxes", () => {
  const result = normalizePersistenceInfo(
    "hosted",
    "admin-user",
    completeWirePayload(),
  );

  expect(result).toMatchObject({
    tier: "hosted",
    status: "available",
    current_size_bytes: null,
    sandbox_count: 1,
    active_sandbox_count: 1,
  });
});

test.each([
  ["wrong tier", completeWirePayload({ tier: "ec2" })],
  ["wrong user", completeWirePayload({ user_id: "another-user" })],
  [
    "missing canonical count",
    completeWirePayload({ sandboxes_total: undefined }),
  ],
])(
  "refuses a %s persistence payload rather than guessing fields",
  (_label, payload) => {
    expect(
      normalizePersistenceInfo("hosted", "admin-user", payload),
    ).toBeNull();
  },
);

test("keeps an unreachable tier explicit and never converts it to zero storage", async () => {
  authenticatedSession();
  jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify(
          completeWirePayload({
            volume_bytes: 42,
            volume_bytes_known: true,
            sandboxes_total: 2,
          }),
        ),
        { status: 200 },
      ),
    )
    .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));

  const response = await GET(
    new NextRequest("http://localhost/api/sandbox/persistence"),
  );
  const body = await response.json();

  expect(body).toMatchObject({ total_size_bytes: 42, partial: true });
  expect(body.tiers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        tier: "hosted",
        status: "available",
        sandbox_count: 2,
        active_sandbox_count: 1,
      }),
      expect.objectContaining({
        tier: "ec2",
        status: "unavailable",
        current_size_bytes: null,
        error: "Storage service did not respond in time.",
      }),
    ]),
  );
});

test("bounds a real hanging HTTP persistence response with the abort deadline", async () => {
  authenticatedSession();
  const server = createServer((_request, _response) => {
    // Deliberately leave the response open; fetch can finish only via abort.
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("test server did not bind TCP");
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  jest
    .spyOn(AbortSignal, "timeout")
    .mockImplementation(() => originalTimeout(25));
  mockResolveOrchestratorByTier.mockReturnValue({
    tier: "hosted",
    url: `http://127.0.0.1:${address.port}`,
    apiKey: "test-key",
  });

  const startedAt = Date.now();
  try {
    const response = await GET(
      new NextRequest("http://localhost/api/sandbox/persistence?tier=hosted"),
    );
    const body = await response.json();
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(body.tiers).toEqual([
      expect.objectContaining({
        tier: "hosted",
        status: "unavailable",
        current_size_bytes: null,
        error: "Storage service did not respond in time.",
      }),
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("does not turn a 404 persistence route into an empty volume", async () => {
  authenticatedSession();
  jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(new Response("missing", { status: 404 }))
    .mockResolvedValueOnce(new Response("missing", { status: 404 }));

  const response = await GET(
    new NextRequest("http://localhost/api/sandbox/persistence"),
  );
  const body = await response.json();

  expect(body).toMatchObject({ total_size_bytes: 0, partial: true });
  expect(body.tiers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: "unavailable",
        current_size_bytes: null,
        error: "Storage service returned 404.",
      }),
    ]),
  );
});

test("refuses an unscoped delete instead of pretending EC2 storage is user-wipeable", async () => {
  authenticatedSession();
  const fetch = jest.spyOn(global, "fetch");

  const response = await DELETE(
    new NextRequest("http://localhost/api/sandbox/persistence", {
      method: "DELETE",
    }),
  );

  await expect(response.json()).resolves.toEqual({
    ok: false,
    error: "Only hosted-tier storage can be wiped here.",
  });
  expect(response.status).toBe(400);
  expect(fetch).not.toHaveBeenCalled();
});
