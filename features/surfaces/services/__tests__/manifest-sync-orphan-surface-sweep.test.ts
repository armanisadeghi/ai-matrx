/**
 * A code-declared surface no manifest declares any more (renamed/removed) is an
 * orphan: the global archive sweep must archive its code-owned item rows too,
 * never a database-owned row. Live case: 11 write targets under the retired
 * `matrx-user/rag-*` surfaces survived from 2026-08-18 because the sweep only
 * looked at surfaces that still had a manifest.
 */

jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: async (
    queryFn: (range: { from: number; to: number }) => Promise<{
      data: unknown[] | null;
      error: unknown;
    }>,
  ) => {
    const result = await queryFn({ from: 0, to: 99_999 });
    if (result.error) throw result.error;
    return result.data ?? [];
  },
}));

jest.mock("@ai-matrx/chat/surfaces/config/namespace-registry", () => ({
  listRegisteredNamespaces: () => [],
}));

const TEST_SURFACE = "cascade-electronics/pickup-intake";

const testManifest = {
  surfaceName: TEST_SURFACE,
  client: "cascade-electronics",
  executionMode: "python-stream",
  description: "A recycling company's pickup intake form.",
  label: "Cascade Electronics Pickup Intake",
  readiness: "stub",
  values: [],
  groups: [],
  agentRoles: [],
  writeTargets: [],
  clientTools: [],
};

jest.mock("@/features/surfaces/manifests/registry", () => ({
  ALL_MANIFESTS: [testManifest],
  getRegisteredSurfaceNames: () => [testManifest.surfaceName],
  getRawManifest: () => undefined,
}));

import { applyManifestSync } from "../manifest-sync.service";

const NOW = Date.now();
const RECENT_ROW = {
  surface_name: TEST_SURFACE,
  name: "cascade_electronics_recent_pickup",
  updated_at: new Date(NOW - 60_000).toISOString(), // 1 minute ago
  label: "Recent",
  description: null,
  value_type: "string",
  always_available: false,
  typical_char_count: null,
  auto_context: true,
  sort_order: 1000,
  group_key: "general",
  declared_by: "code",
};
const OLD_ROW = {
  surface_name: TEST_SURFACE,
  name: "cascade_electronics_old_pickup",
  updated_at: new Date(NOW - 48 * 3_600_000).toISOString(), // 48 hours ago
  label: "Old",
  description: null,
  value_type: "string",
  always_available: false,
  typical_char_count: null,
  auto_context: true,
  sort_order: 1000,
  group_key: "general",
  declared_by: "code",
};

type Row = Record<string, unknown>;

function makeChain(readData: Row[]) {
  let currentData: Row[] = readData;
  const chain: any = {
    select: () => {
      currentData = readData;
      return chain;
    },
    eq: () => chain,
    neq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    range: () => chain,
    update: () => {
      currentData = [];
      return chain;
    },
    upsert: () => {
      currentData = [];
      return chain;
    },
    insert: () => Promise.resolve({ data: [], error: null }),
    delete: () => {
      currentData = [];
      return chain;
    },
    single: () =>
      Promise.resolve({
        data: readData[0] ?? null,
        error: readData[0] ? null : { message: "no row" },
      }),
    maybeSingle: () => Promise.resolve({ data: readData[0] ?? null, error: null }),
    then: (resolve: any, reject?: any) =>
      Promise.resolve({ data: currentData, error: null, count: currentData.length }).then(
        resolve,
        reject,
      ),
  };
  return chain;
}

function makeClient(tableRows: Record<string, Row[]>) {
  return {
    schema: (schemaName: string) => ({
      from: (table: string) => makeChain(tableRows[`${schemaName}.${table}`] ?? []),
    }),
  };
}

/**
 * The fake chain is filter-blind (`.eq()` / `.is()` return the chain
 * unchanged), so each table's fixture holds EXACTLY the rows its query should
 * return — nothing here stands in for a WHERE clause.
 */
function buildTableRows(): Record<string, Row[]> {
  return {
    // `applyManifestSync` stamps an explicit `organization_id` on every catalog
    // write and resolves it through `resolveSystemOrgId` → `iam.system_orgs`
    // (a3cb48fd26; the no-db-assigned-org work order forbids a resolver or
    // trigger choosing one). Without this row the resolver throws "no row"
    // before the sweep runs at all. The id is the live `key='system'` row.
    "iam.system_orgs": [
      { key: "system", organization_id: "39c38960-d30c-4840-b0c1-c9960de95582" },
    ],
    "ui.ui_surface": [
      {
        name: TEST_SURFACE,
        url_pattern: null,
        label: null,
        value_groups: null,
        parent_surface_name: null,
      },
    ],
    "ui.ui_surface_value": [RECENT_ROW, OLD_ROW],
    "ui.ui_surface_agent_role": [],
    "ui.ui_surface_write_target": [],
    "ui.ui_surface_client_tool": [],
    "ui.ui_surface_config": [],
    "agent.menu_surface": [],
  };
}

const GONE = "matrx-user/retired-surface";
const ORPHAN_TARGET = {
  surface_name: GONE,
  item_type: "",
  name: "retired_target",
  updated_at: new Date(NOW - 48 * 3_600_000).toISOString(),
  declared_by: "code",
};

describe("applyManifestSync archives item rows of orphan code surfaces", () => {
  it("archives a code write target whose whole surface lost its manifest", async () => {
    const rows = buildTableRows();
    rows["ui.ui_surface"] = [
      ...rows["ui.ui_surface"],
      { name: GONE, url_pattern: null, label: null, value_groups: null, parent_surface_name: null },
    ];
    rows["ui.ui_surface_value"] = [];
    rows["ui.ui_surface_write_target"] = [ORPHAN_TARGET];
    const result = await applyManifestSync(makeClient(rows) as any, { deleteStale: true });
    expect(result.writeTargetDeleted).toEqual([{ surfaceName: GONE, targetName: "retired_target" }]);
  });

  it("never sweeps without deleteStale", async () => {
    const rows = buildTableRows();
    rows["ui.ui_surface_value"] = [];
    rows["ui.ui_surface_write_target"] = [ORPHAN_TARGET];
    const result = await applyManifestSync(makeClient(rows) as any, {});
    expect(result.writeTargetDeleted).toEqual([]);
  });
});
