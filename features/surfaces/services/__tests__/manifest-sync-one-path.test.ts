/**
 * ONE SYNC PATH (ALC-14, CONTRACT §2.7): every row `applyManifestSync` writes
 * comes from the package plan. A surface row no manifest declares is an orphan
 * (archived or given a manifest — never silently edited by the sync).
 *
 * Fixture: a recycling company's pickup-intake surface is declared; its old
 * pickup-history surface still has a DB row with no url_pattern and no
 * manifest.
 */
jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: async (
    queryFn: (range: { from: number; to: number }) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  ) => {
    const result = await queryFn({ from: 0, to: 99_999 });
    if (result.error) throw result.error;
    return result.data ?? [];
  },
}));
jest.mock("@/features/surfaces/config/namespace-registry", () => ({
  listRegisteredNamespaces: () => [],
}));

const DECLARED = "matrx-user/cascade-pickup-intake";
const UNDECLARED = "matrx-user/cascade-pickup-history";

const manifest = {
  surfaceName: DECLARED,
  client: "matrx-user",
  executionMode: "python-stream",
  description: "A recycling company's pickup intake form.",
  label: "Pickup intake",
  urlPattern: "/cascade-pickup-intake",
  readiness: "stub",
  values: [
    {
      name: "pickup_address",
      label: "Pickup address",
      description: "Where the truck goes.",
      valueType: "string",
      alwaysAvailable: true,
      typicalCharCount: 80,
    },
  ],
  groups: [],
  agentRoles: [],
  writeTargets: [],
  clientTools: [],
};

jest.mock("@/features/surfaces/manifests/registry", () => ({
  ALL_MANIFESTS: [manifest],
  getRegisteredSurfaceNames: () => [manifest.surfaceName],
  getRawManifest: () => undefined,
}));

import { applyManifestSync } from "../manifest-sync.service";

type Row = Record<string, unknown>;
type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

/** A filter-aware fake: `.eq`/`.is` narrow reads; every write is recorded. */
export function recordingClient(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  const client = {
    schema: (schemaName: string) => ({
      from: (name: string) => {
        const table = `${schemaName}.${name}`;
        const call: Call = { table, op: "select", filters: [] };
        const matches = () =>
          (tables[table] ?? []).filter((row) =>
            call.filters.every(([column, value]) =>
              value === null ? row[column] == null : (row[column] ?? "") === value,
            ),
          );
        const chain: any = {
          select: () => chain,
          order: () => chain,
          range: () => chain,
          // Not used to choose writes in these paths; pass through.
          neq: () => chain,
          in: () => chain,
          not: () => chain,
          or: () => chain,
          limit: () => chain,
          eq: (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return chain;
          },
          is: (column: string, value: unknown) => {
            call.filters.push([column, value]);
            return chain;
          },
          upsert: (payload: unknown) => {
            call.op = "upsert";
            call.payload = payload;
            calls.push(call);
            return chain;
          },
          update: (payload: unknown) => {
            call.op = "update";
            call.payload = payload;
            calls.push(call);
            return chain;
          },
          delete: () => {
            call.op = "delete";
            calls.push(call);
            return chain;
          },
          single: () => Promise.resolve({ data: matches()[0] ?? null, error: matches()[0] ? null : { message: "no row" } }),
          maybeSingle: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
          then: (resolve: any, reject?: any) => {
            const data = call.op === "upsert" ? (call.payload as Row[]) : matches();
            return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
          },
        };
        return chain;
      },
    }),
  };
  return { client, calls };
}

function baseTables(): Record<string, Row[]> {
  return {
    "iam.system_orgs": [{ key: "system", organization_id: "39c38960-d30c-4840-b0c1-c9960de95582" }],
    "ui.ui_surface": [
      { name: DECLARED, url_pattern: "/cascade-pickup-intake", parent_surface_name: null },
      { name: UNDECLARED, url_pattern: null, parent_surface_name: null },
    ],
    "ui.ui_surface_value": [],
    "ui.ui_surface_agent_role": [],
    "ui.ui_surface_write_target": [],
    "ui.ui_surface_client_tool": [],
    "ui.ui_surface_config": [],
    "agent.menu_surface": [],
  };
}

describe("applyManifestSync writes only what the package plan declares", () => {
  it("never writes to a surface row no manifest declares", async () => {
    const { client, calls } = recordingClient(baseTables());
    const result = await applyManifestSync(client as any);
    const touchedUndeclared = calls.filter(
      (call) => call.op !== "select" && call.filters.some(([, value]) => value === UNDECLARED),
    );
    expect(touchedUndeclared).toEqual([]);
    expect(result.urlPatternsUpdated.map((u) => u.surfaceName)).not.toContain(UNDECLARED);
    // The declared surface's pattern already matches the DB: nothing was "set".
    expect(result.urlPatternsUpdated).toEqual([]);
  });
});
