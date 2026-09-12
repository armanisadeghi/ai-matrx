/**
 * Proves the recency guard on the GLOBAL stale sweep (`applyManifestSync({
 * deleteStale: true })`). Before this test, the sweep deleted every `db_only`
 * row with no age check at all — only the per-row `deleteMirrorRow` lever
 * refused a row touched inside `RECENT_ROW_WINDOW_HOURS`. See the WP5 row in
 * `docs/handoffs/canonical-stream-and-surface-writeback.md` and the
 * `includeRecent` option on `ApplyManifestSyncOptions`.
 *
 * Uses a fixture surface (`zz_fixture/probe`, never a real manifest) with two
 * DB-only `ui_surface_value` rows — one written a minute ago, one written 48
 * hours ago — to prove:
 *   1. A default sweep (`includeRecent` unset) deletes the OLD row and SKIPS
 *      the RECENT one, reporting it on `skippedRecentRows`.
 *   2. `includeRecent: true` deletes both and reports nothing skipped.
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

jest.mock("@/features/surfaces/config/namespace-registry", () => ({
  listRegisteredNamespaces: () => [],
}));

const TEST_SURFACE = "zz_fixture/probe";

const testManifest = {
  surfaceName: TEST_SURFACE,
  label: "ZZ Fixture Probe",
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
}));

import { applyManifestSync } from "../manifest-sync.service";

const NOW = Date.now();
const RECENT_ROW = {
  surface_name: TEST_SURFACE,
  name: "zz_fixture_recent_value",
  updated_at: new Date(NOW - 60_000).toISOString(), // 1 minute ago
  label: "Recent",
  description: null,
  value_type: "string",
  always_available: false,
  typical_char_count: null,
  auto_context: true,
  sort_order: 1000,
  group_key: "general",
};
const OLD_ROW = {
  surface_name: TEST_SURFACE,
  name: "zz_fixture_old_value",
  updated_at: new Date(NOW - 48 * 3_600_000).toISOString(), // 48 hours ago
  label: "Old",
  description: null,
  value_type: "string",
  always_available: false,
  typical_char_count: null,
  auto_context: true,
  sort_order: 1000,
  group_key: "general",
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

function buildTableRows(): Record<string, Row[]> {
  return {
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

describe("applyManifestSync recency guard on the global sweep", () => {
  it("skips a row updated within RECENT_ROW_WINDOW_HOURS by default and deletes the stale one", async () => {
    const client = makeClient(buildTableRows());

    const result = await applyManifestSync(client as any, { deleteStale: true });

    expect(result.deleted).toEqual([
      { surfaceName: TEST_SURFACE, valueName: OLD_ROW.name },
    ]);
    expect(result.skippedRecentRows).toHaveLength(1);
    expect(result.skippedRecentRows[0]).toMatchObject({
      table: "ui_surface_value",
      surfaceName: TEST_SURFACE,
      name: RECENT_ROW.name,
    });
  });

  it("deletes the recent row too when includeRecent is true, and reports nothing skipped", async () => {
    const client = makeClient(buildTableRows());

    const result = await applyManifestSync(client as any, {
      deleteStale: true,
      includeRecent: true,
    });

    const deletedNames = result.deleted.map((d) => d.valueName).sort();
    expect(deletedNames).toEqual([OLD_ROW.name, RECENT_ROW.name].sort());
    expect(result.skippedRecentRows).toEqual([]);
  });
});
