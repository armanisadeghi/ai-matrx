// `withClaims` is used at MODULE LOAD, in the `client` literal below, so its import must sit
// above that literal. ts-jest transpiles an `import` into a `require` WHERE THE STATEMENT IS, not
// at the top, so an import written further down left `supabase_auth_1` uninitialised and this
// whole suite failed to run ("Cannot access 'supabase_auth_1' before initialization") — zero
// tests, silently, rather than a red assertion. Found and fixed by lane DEAD-KEYS, 2026-09-22.
import { withClaims } from "@/test-utils/supabase-auth";

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
/** Every `schema.table` this bundle actually asks PostgREST for, in order. */
let tablesAddressed: string[] = [];

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
  // The service reads the caller from locally verified claims (getClaimsUser →
  // auth.getClaims); withClaims derives that door from this same fake getUser,
  // so the call-count assertions below still see one identity read.
  auth: withClaims({
    getUser: jest.fn(async () => ({
      data: { user: userId ? { id: userId } : null },
      error: null,
    })),
  }),
  schema: (schema: string) => ({
    from: (table: string) => {
      tablesAddressed.push(`${schema}.${table}`);
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
  tablesAddressed = [];
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

  // 🚨 DD-249, lane DEAD-KEYS (2026-09-22). `ui.ui_surface_agent_pref` and `ui.ui_surface_config`
  // have no guest tier and cannot get one: every write path stamps an owning organization_id, and
  // measured on the main database both tables hold ZERO rows with user_id and organization_id
  // null. The guest read therefore asked for something that could not exist, got 200 [] off an
  // `anon` column grant NO policy reached, and the code beside it promised "a genuine guest still
  // receives the public surface config". The grant is withdrawn, so the same read would now 42501
  // and throw the whole bundle. This is the guard: a visitor with no session must not address
  // those two tables at all. It fails if anyone re-adds a guest read.
  it("asks the database for no per-user tier when nobody is signed in", async () => {
    userId = null;

    const bundle = await fetchSurfaceConfigBundle("matrx-user/podcast");

    expect(tablesAddressed).not.toContain("ui.ui_surface_agent_pref");
    expect(tablesAddressed).not.toContain("ui.ui_surface_config");
    expect(bundle.prefs).toEqual([]);
    expect(bundle.configRows).toEqual([]);
    // The ROLE half is a real anonymous lane (278 public rows behind `pub_read`) and a guest is
    // still served by it — this guard must not be satisfied by the bundle reading nothing at all.
    expect(tablesAddressed).toContain("ui.ui_surface_agent_role");
    expect(bundle.dbRoles).toHaveLength(1);
  });
});
