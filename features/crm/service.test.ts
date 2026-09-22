import { webcrypto } from "node:crypto";

interface MockResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

type QueryCall = { method: string; args: unknown[] };

const queryState: { result: MockResult; calls: QueryCall[] } = {
  result: { data: null, error: null },
  calls: [],
};

function queryBuilder() {
  const builder: Record<string, unknown> = {};
  const chain = (method: string) =>
    jest.fn((...args: unknown[]) => {
      queryState.calls.push({ method, args });
      return builder;
    });
  builder.select = chain("select");
  builder.update = chain("update");
  builder.in = chain("in");
  builder.is = chain("is");
  builder.eq = chain("eq");
  builder.then = (
    resolve: (value: MockResult) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(queryState.result).then(resolve, reject);
  return builder;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: jest.fn((schema: string) => ({
      from: jest.fn((table: string) => {
        queryState.calls.push({ method: "from", args: [schema, table] });
        return queryBuilder();
      }),
    })),
  },
}));

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForTargets: jest.fn(),
  },
}));

import { associationsService } from "@/features/scopes/service/associationsService";
import {
  fetchPartiesByIds,
  fetchTopicExperts,
  removeInteraction,
} from "./service";

Object.defineProperty(globalThis, "crypto", {
  configurable: true,
  value: webcrypto,
});

const TOPIC_ID = "0d59c395-8c19-43df-90df-8ca384f3edc3";
const PARTY_ID = "9111fe66-89a2-4bcc-b6f9-afcb6daafbaa";

beforeEach(() => {
  jest.clearAllMocks();
  queryState.calls = [];
  queryState.result = { data: [], error: null };
});

describe("party id hydration", () => {
  it("keeps the general hydrator contact-only", async () => {
    await fetchPartiesByIds([PARTY_ID]);

    expect(queryState.calls).toContainEqual({
      method: "eq",
      args: ["record_class", "contact"],
    });
  });

  it("hydrates discovered parties for exact expert edges", async () => {
    jest.mocked(associationsService.listForTargets).mockResolvedValue({
      ok: true,
      data: {
        edges: [
          {
            id: "af7251e4-a07e-420f-ab04-5228b27e6070",
            targetId: TOPIC_ID,
            sourceType: "party",
            sourceId: PARTY_ID,
            role: "expert_for",
            label: null,
            position: null,
            metadata: {},
            orgId: "7cd12da2-2213-4378-8fba-a9e2dc4ea657",
            createdAt: "2026-08-30T11:01:03.967218+00:00",
          },
        ],
      },
    });
    queryState.result = {
      data: [{ id: PARTY_ID, display_name: "Cenmar Fuertes" }],
      error: null,
    };

    const result = await fetchTopicExperts(TOPIC_ID);

    expect(result.map(({ party }) => party.id)).toEqual([PARTY_ID]);
    expect(queryState.calls).not.toContainEqual({
      method: "eq",
      args: ["record_class", "contact"],
    });
  });
});

describe("interaction removal", () => {
  it("scrubs linked Gmail audit data before erasing the retained reply", async () => {
    queryState.result = { data: null, error: null, count: 1 };

    await removeInteraction({
      id: "11111111-1111-4111-8111-111111111111",
      organization_id: "22222222-2222-4222-8222-222222222222",
      direction: "inbound",
      channel_code: "email",
      message_id: "gmail-provider-message-id",
      attributes: {
        outreach_inbound: {
          identity_id: "33333333-3333-4333-8333-333333333333",
          evidence: "Call me Tuesday",
        },
      },
    });

    const writes = queryState.calls.filter(
      ({ method }) => method === "from" || method === "update",
    );
    expect(writes).toHaveLength(4);
    expect(writes[0]).toEqual({
      method: "from",
      args: ["crm", "sending_event"],
    });
    expect(writes[1]?.method).toBe("update");
    expect(JSON.stringify(writes[1]?.args)).not.toContain(
      "gmail-provider-message-id",
    );
    expect(writes[2]).toEqual({ method: "from", args: ["crm", "interaction"] });
    expect(writes[3]?.method).toBe("update");
    expect(JSON.stringify(writes[3]?.args)).not.toContain(
      "gmail-provider-message-id",
    );
    expect(queryState.calls).toContainEqual({
      method: "eq",
      args: ["organization_id", "22222222-2222-4222-8222-222222222222"],
    });
    expect(queryState.calls).toContainEqual({
      method: "eq",
      args: ["identity_id", "33333333-3333-4333-8333-333333333333"],
    });
  });

  it("refuses to report deletion when RLS updates no interaction", async () => {
    queryState.result = { data: null, error: null, count: 0 };

    await expect(
      removeInteraction({
        id: "11111111-1111-4111-8111-111111111111",
        organization_id: "22222222-2222-4222-8222-222222222222",
        direction: "outbound",
        channel_code: "call",
        message_id: null,
        attributes: {},
      }),
    ).rejects.toThrow("no longer writable in this organization");
  });
});
