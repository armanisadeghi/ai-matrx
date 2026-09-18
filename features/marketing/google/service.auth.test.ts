import { createClient } from "@/utils/supabase/client";
import { listGoogleConnectionInventory } from "./service";

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
}));

/**
 * A PostgREST-shaped query stub that PAGES — because the inventory read does
 * (V17-7). `readAllRows` ends every page with `.range(from, to)` and needs the
 * `count` back, so a stub that resolves one array however it is ranged cannot
 * tell a complete read from a capped one.
 */
function pagedRelation(rows: readonly unknown[], pageSize = 1000) {
  const ranges: Array<[number, number]> = [];
  const select = jest.fn((..._args: [string, unknown?]) => query);
  const query: Record<string, unknown> = {};
  let requested: [number, number] = [0, pageSize - 1];
  for (const method of ["eq", "is", "in", "order", "returns", "abortSignal"]) {
    query[method] = jest.fn(() => query);
  }
  query.range = jest.fn((from: number, to: number) => {
    requested = [from, to];
    ranges.push([from, to]);
    return query;
  });
  // `readAllRows` awaits the builder itself.
  query.then = (
    resolve: (value: { data: unknown[]; error: null; count: number }) => unknown,
  ) =>
    Promise.resolve({
      data: rows.slice(requested[0], requested[1] + 1),
      error: null,
      count: rows.length,
    }).then(resolve);
  return { select, ranges };
}

function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "google-connection",
    owner_type: "user",
    owner_user_id: "user-1",
    organization_id: null,
    provider: "google",
    provider_subject: "provider-user",
    account_email: "owner@example.com",
    account_name: "Owner",
    scopes: [],
    status: "connected",
    last_verified_at: null,
    last_error: null,
    created_at: "2026-09-12T00:00:00Z",
    updated_at: "2026-09-12T00:00:00Z",
    metadata: {},
    credential_present: false,
    credential_stable: false,
    capability_health: null,
    ...overrides,
  };
}

function resourceRow(index: number) {
  return {
    id: `resource-${index}`,
    connection_id: "google-connection",
    resource_type: "google_document",
    resource_ref: `doc-${index}`,
    display_name: `Doc ${index}`,
    permission_level: null,
    discovered_at: "2026-09-12T00:00:00Z",
    metadata: {},
  };
}

function mockSupabase(
  relations: Record<string, ReturnType<typeof pagedRelation>>,
) {
  const from = jest.fn((relation: string) => ({
    select: relations[relation]!.select,
  }));
  jest.mocked(createClient).mockReturnValue({
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
        error: null,
      }),
    },
    schema: jest.fn(() => ({ from })),
  } as never);
  return from;
}

describe("listGoogleConnectionInventory auth boundary", () => {
  it("does not issue authenticated-only table reads without a live Supabase session", async () => {
    const from = jest.fn();
    jest.mocked(createClient).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
      from,
    } as never);

    await expect(listGoogleConnectionInventory()).resolves.toEqual({
      connections: [],
      resources: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not issue the table read for a session missing its bearer token", async () => {
    const from = jest.fn();
    jest.mocked(createClient).mockReturnValue({
      auth: {
        getSession: jest.fn().mockResolvedValue({
          data: { session: {} },
          error: null,
        }),
      },
      schema: jest.fn(() => ({ from })),
    } as never);

    await expect(listGoogleConnectionInventory()).resolves.toEqual({
      connections: [],
      resources: [],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("reads only the client-safe credential health projection", async () => {
    const connections = pagedRelation([connectionRow()]);
    const resources = pagedRelation([]);
    mockSupabase({
      integration_connections: connections,
      integration_connection_resources: resources,
    });

    const result = await listGoogleConnectionInventory();

    const projection = connections.select.mock.calls[0]![0];
    expect(projection).toContain("credential_present");
    expect(projection).toContain("credential_stable");
    expect(projection).not.toContain("credential_item_id");
    expect(projection).not.toContain("vault_secret_key");
    expect(result.connections[0]).toMatchObject({
      credential_present: false,
      credential_stable: false,
      health: "needs_reauth",
    });
  });

  /**
   * 🚨 A LIST THIS TREATS AS COMPLETE IS READ COMPLETELY (V17-7, CLAUDE.md
   * § readAllRows). The resource rows are COUNTED per account and that count is
   * what `revokeConsequence` tells a person a Disconnect will strand — so a
   * PostgREST page cap silently understates what a destructive press destroys,
   * and the attach and review lists come back short with nothing saying so.
   *
   * RED before the fix: the bare `.select().in()` returned page one and the
   * inventory reported 1000 of 1200 resources with no error.
   */
  it("pages every resource row, so a count a person weighs a Disconnect against is whole", async () => {
    const all = Array.from({ length: 1200 }, (_, index) => resourceRow(index));
    const connections = pagedRelation([connectionRow()]);
    const resources = pagedRelation(all);
    mockSupabase({
      integration_connections: connections,
      integration_connection_resources: resources,
    });

    const result = await listGoogleConnectionInventory();

    expect(result.resources).toHaveLength(1200);
    // More than one page was actually requested — not one wide range.
    expect(resources.ranges.length).toBeGreaterThan(1);
  });

  it("asks both reads for an exact count and a stable total order", async () => {
    const connections = pagedRelation([connectionRow()]);
    const resources = pagedRelation([resourceRow(0)]);
    mockSupabase({
      integration_connections: connections,
      integration_connection_resources: resources,
    });

    await listGoogleConnectionInventory();

    for (const relation of [connections, resources]) {
      // Without `{ count: "exact" }` there is no total to verify a page against,
      // and `readAllRows` would rather throw than trust a full-looking page.
      expect(relation.select.mock.calls[0]![1]).toEqual({ count: "exact" });
      expect(relation.ranges[0]).toEqual([0, 999]);
    }
  });
});
