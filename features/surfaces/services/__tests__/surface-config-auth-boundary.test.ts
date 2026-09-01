const fetchMandatePins = jest.fn(async () => ({
  "podcast.producer": {
    mandateKey: "podcast.producer",
    agentId: "agent-1",
    versionId: null,
    useLatest: true,
    isEnabled: true,
  },
}));

jest.mock("@/features/mandates/service", () => ({ fetchMandatePins }));

let userId: string | null = null;

function query(data: unknown[]) {
  const result = { data, error: null };
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  return chain;
}

const client = {
  auth: {
    getUser: jest.fn(async () => ({
      data: { user: userId ? { id: userId } : null },
      error: null,
    })),
  },
  schema: (schema: string) => ({
    from: (table: string) => {
      if (schema === "ui" && table === "ui_surface_agent_role") {
        return query([
          {
            name: "producer",
            label: "Producer",
            description: "Produces the episode",
            kind: "single",
            default_agent_id: null,
            mandate_key: "podcast.producer",
            max_agents: 1,
            allow_custom: false,
            auto_run: "never",
            sort_order: 1,
          },
        ]);
      }
      return query([]);
    },
  }),
};

jest.mock("@/utils/supabase/client", () => ({ createClient: () => client }));

import { fetchSurfaceConfigBundle } from "../surface-config.service";

beforeEach(() => {
  userId = null;
  fetchMandatePins.mockClear();
  client.auth.getUser.mockClear();
});

describe("surface config mandate authentication boundary", () => {
  it("does not read protected mandate definitions for a guest", async () => {
    const bundle = await fetchSurfaceConfigBundle("matrx-user/podcast");

    expect(client.auth.getUser).toHaveBeenCalledTimes(1);
    expect(fetchMandatePins).not.toHaveBeenCalled();
    expect(bundle.dbRoles[0]?.mandateAgentId).toBeNull();
  });

  it("resolves mandate-backed defaults after authenticating", async () => {
    userId = "user-1";

    const bundle = await fetchSurfaceConfigBundle("matrx-user/podcast");

    expect(fetchMandatePins).toHaveBeenCalledWith(["podcast.producer"]);
    expect(bundle.dbRoles[0]?.mandateAgentId).toBe("agent-1");
  });
});
