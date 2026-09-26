/**
 * The admin sync's PostgREST transport must never send a governance column
 * (`organization_id`, `visibility`) for a row that already exists — the
 * package SQL sets them on INSERT only (CONTRACT §2.7, ruling N5). Re-sending
 * a value read moments earlier would silently revert a concurrent change.
 *
 * Fixture: a recycling company's pickup-intake surface with one existing value
 * whose organization was reassigned and whose label changed in code, one
 * unchanged existing value, and one value new in code.
 */
jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: async (
    queryFn: (range: { from: number; to: number }) => PromiseLike<{
      data: unknown[] | null;
      error: unknown;
    }>,
  ) => {
    const result = await queryFn({ from: 0, to: 99_999 });
    if (result.error) throw result.error;
    return result.data ?? [];
  },
}));

import type { SurfaceSyncPlan } from "@ai-matrx/alchemy/checks";
import { executeSyncPlan } from "../execute-sync-plan";

type Row = Record<string, unknown>;
type Call = { op: string; payload?: unknown; options?: unknown; filters: [string, unknown][] };

const SURFACE = "cascade-electronics/pickup-intake";
const SYSTEM_ORG = "39c38960-d30c-4840-b0c1-c9960de95582";
const REASSIGNED_ORG = "5b1f7c1e-2f0a-4d0e-9d0a-0c6f0a1b2c3d";

function valueRow(name: string, label: string, organizationId = SYSTEM_ORG): Row {
  return {
    organization_id: organizationId,
    visibility: "public",
    surface_name: SURFACE,
    item_type: "",
    name,
    label,
    synced_by: null,
    synced_from: "test",
  };
}

function fakeClient(existing: Row[]) {
  const calls: Call[] = [];
  const chain = (call: Call, data: () => Row[]) => {
    const c: any = {
      eq: (column: string, value: unknown) => {
        call.filters.push([column, value]);
        return c;
      },
      order: () => c,
      range: () => c,
      select: () => c,
      then: (resolve: any, reject?: any) =>
        Promise.resolve({ data: data(), error: null, count: data().length }).then(resolve, reject),
    };
    return c;
  };
  const sb = {
    schema: () => ({
      from: () => ({
        select: () => {
          const call: Call = { op: "select", filters: [] };
          return chain(call, () => existing);
        },
        upsert: (payload: Row[], options: unknown) => {
          const call: Call = { op: "upsert", payload, options, filters: [] };
          calls.push(call);
          return chain(call, () => payload);
        },
        update: (payload: Row) => {
          const call: Call = { op: "update", payload, filters: [] };
          calls.push(call);
          // PostgREST returns the matched row's selected (key) columns.
          return chain(call, () => [{ ...payload, ...Object.fromEntries(call.filters) }]);
        },
      }),
    }),
  };
  return { sb, calls };
}

const plan: SurfaceSyncPlan = {
  surfaces: [],
  keys: { "ui.ui_surface_value": ["surface_name", "item_type", "name"] },
  tables: [
    {
      table: "ui.ui_surface_value",
      conflict: ["surface_name", "item_type", "name"],
      insertOnly: ["organization_id", "visibility"],
      rows: [
        valueRow("pickup_address", "Pickup address (new label)"),
        valueRow("pickup_window", "Pickup window"),
        valueRow("pallet_count", "Pallet count"),
      ],
    },
  ],
} as SurfaceSyncPlan;

describe("executeSyncPlan governance is insert-only", () => {
  it("inserts new rows with governance, updates changed rows without it, and leaves unchanged rows alone", async () => {
    const { sb, calls } = fakeClient([
      valueRow("pickup_address", "Pickup address", REASSIGNED_ORG),
      valueRow("pickup_window", "Pickup window"),
    ]);

    const result = await executeSyncPlan(sb as any, plan, {
      existingSurfaces: new Set([SURFACE]),
      createMissingSurfaces: false,
    });

    // No payload for an EXISTING row may carry a governance column.
    for (const call of calls) {
      const rows = (Array.isArray(call.payload) ? call.payload : [call.payload]) as Row[];
      for (const row of rows) {
        if (row.name === "pallet_count") continue; // the one new row
        expect(row).not.toHaveProperty("organization_id");
        expect(row).not.toHaveProperty("visibility");
      }
    }

    const inserts = calls.filter((c) => c.op === "upsert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.options).toMatchObject({ ignoreDuplicates: true });
    expect((inserts[0]!.payload as Row[]).map((r) => r.name)).toEqual(["pallet_count"]);
    expect((inserts[0]!.payload as Row[])[0]).toMatchObject({ organization_id: SYSTEM_ORG, visibility: "public" });

    const updates = calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.payload).toMatchObject({ label: "Pickup address (new label)" });
    expect(updates[0]!.filters).toEqual([
      ["surface_name", SURFACE],
      ["item_type", ""],
      ["name", "pickup_address"],
    ]);

    expect(result.tables[0]!.written.map((r) => r.name).sort()).toEqual(["pallet_count", "pickup_address"]);
  });
});
