interface MockResult {
  data: unknown;
  error: { message: string; code?: string } | null;
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
import { fetchPartiesByIds, fetchTopicExperts } from "./service";

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
