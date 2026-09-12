import { createClient } from "@/utils/supabase/client";
import { listGoogleConnectionInventory } from "./service";

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(),
}));

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
    const connectionSelect = jest.fn();
    let connectionQuery: {
      eq: jest.Mock;
      is: jest.Mock;
      order: jest.Mock;
      abortSignal: jest.Mock;
    };
    connectionQuery = {
      eq: jest.fn(() => connectionQuery),
      is: jest.fn(() => connectionQuery),
      order: jest.fn(() => connectionQuery),
      abortSignal: jest.fn().mockResolvedValue({
        data: [
          {
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
          },
        ],
        error: null,
      }),
    };
    connectionSelect.mockReturnValue(connectionQuery);

    const resourceSelect = jest.fn();
    let resourceQuery: {
      in: jest.Mock;
      is: jest.Mock;
      order: jest.Mock;
      abortSignal: jest.Mock;
    };
    resourceQuery = {
      in: jest.fn(() => resourceQuery),
      is: jest.fn(() => resourceQuery),
      order: jest.fn(() => resourceQuery),
      abortSignal: jest.fn().mockResolvedValue({ data: [], error: null }),
    };
    resourceSelect.mockReturnValue(resourceQuery);

    const from = jest.fn((relation: string) => ({
      select:
        relation === "integration_connections"
          ? connectionSelect
          : resourceSelect,
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

    const result = await listGoogleConnectionInventory();

    const projection = connectionSelect.mock.calls[0]?.[0] as string;
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
});
