import { withClaims } from "@/test-utils/supabase-auth";
import {
  disconnectStorageConnection,
  listStorageConnections,
  refreshStorageConnection,
  startStorageAuthorization,
  storageConnectionFromRow,
} from "@/features/storage-connections/service";
import type { StorageConnectionRow } from "@/features/storage-connections/types";

const mockApiPost = jest.fn();
const mockCreateClient = jest.fn();

jest.mock("@/lib/api/typed-client", () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
  buildPath: (path: string, params: Record<string, string>) =>
    path.replace("{provider}", params.provider),
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => mockCreateClient(),
}));

function row(
  overrides: Partial<StorageConnectionRow> = {},
): StorageConnectionRow {
  return {
    id: "connection-1",
    provider: "dropbox",
    account_email: "reader@example.com",
    account_name: "Reader",
    scopes: ["files.metadata.read"],
    status: "connected",
    last_verified_at: null,
    last_error: null,
    created_at: "2026-09-19T00:00:00Z",
    metadata: {
      requested_scopes: ["files.metadata.read", 99],
      granted_scopes: ["files.metadata.read"],
      scope_evidence: "provider token response",
      access_token: "must-never-reach-the-screen",
    },
    ...overrides,
  };
}

test("projects only scoped lifecycle metadata and never arbitrary provider secrets", () => {
  const projected = storageConnectionFromRow(row());
  expect(projected.requestedScopes).toEqual(["files.metadata.read"]);
  expect(projected.grantedScopes).toEqual(["files.metadata.read"]);
  expect(projected.scopeEvidence).toBe("provider token response");
  expect(projected).not.toHaveProperty("metadata");
  expect(JSON.stringify(projected)).not.toContain(
    "must-never-reach-the-screen",
  );
});

test("keeps an unknown server status unknown", () => {
  const projected = storageConnectionFromRow(row({ status: "future_state" }));
  expect(projected.status).toEqual({
    asRead: "future_state",
    status: null,
  });
});

test("reads only this user’s Box and Dropbox rows under RLS", async () => {
  const chain = {
    select: jest.fn(),
    in: jest.fn(),
    eq: jest.fn(),
    is: jest.fn(),
    order: jest.fn(),
    abortSignal: jest.fn().mockResolvedValue({ data: [row()], error: null }),
  };
  for (const name of ["select", "in", "eq", "is", "order"] as const) {
    chain[name].mockReturnValue(chain);
  }
  const from = jest.fn().mockReturnValue(chain);
  const schema = jest.fn().mockReturnValue({ from });
  mockCreateClient.mockReturnValue({
    auth: withClaims({
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "present", user: { id: "user-1" } } },
      }),
    }),
    schema,
  });

  await expect(listStorageConnections()).resolves.toHaveLength(1);
  expect(schema).toHaveBeenCalledWith("users");
  expect(from).toHaveBeenCalledWith("integration_connections");
  expect(chain.in).toHaveBeenCalledWith("provider", ["dropbox", "box"]);
  expect(chain.eq).toHaveBeenCalledWith("owner_type", "user");
  expect(chain.eq).toHaveBeenCalledWith("owner_user_id", "user-1");
  expect(chain.is).toHaveBeenCalledWith("deleted_at", null);
});

test("a missing or expired session is a load error, never a false empty list", async () => {
  const from = jest.fn();
  mockCreateClient.mockReturnValue({
    auth: withClaims({
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    }),
    schema: jest.fn().mockReturnValue({ from }),
  });

  await expect(listStorageConnections()).rejects.toThrow(
    "Sign in to load your file connections.",
  );
  expect(from).not.toHaveBeenCalled();
});

test("uses the generated lifecycle paths and exact connection body", async () => {
  mockApiPost
    .mockResolvedValueOnce({
      data: {
        authorization_url: "https://box.example.test/server-minted",
        provider: "box",
        requested_scopes: ["root_readonly"],
      },
    })
    .mockResolvedValue({
      data: {
        connection_id: "connection-1",
        provider: "box",
        status: "connected",
        requested_scopes: ["root_readonly"],
        granted_scopes: ["root_readonly"],
        scope_evidence: "provider token response",
      },
    });

  await startStorageAuthorization("box");
  await refreshStorageConnection("box", "connection-1");
  await disconnectStorageConnection("box", "connection-1");

  expect(mockApiPost.mock.calls).toEqual([
    ["/storage-oauth/box/authorize", undefined],
    ["/storage-oauth/box/refresh", { connection_id: "connection-1" }],
    ["/storage-oauth/box/disconnect", { connection_id: "connection-1" }],
  ]);
});
