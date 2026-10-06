/**
 * Database-owned surface rows (declared_by = 'database': Applet surfaces,
 * organization extensions) are never archived by code sync (Arman, 2026-10-06).
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
jest.mock("@ai-matrx/chat/surfaces/config/namespace-registry", () => ({
  listRegisteredNamespaces: () => [],
}));
jest.mock("@/features/surfaces/manifests/registry", () => ({
  ALL_MANIFESTS: [],
  getRegisteredSurfaceNames: () => [],
  getRawManifest: () => undefined,
}));

import {
  DATABASE_OWNED_REFUSAL_PREFIX,
  deleteMirrorRow,
} from "../manifest-sync.service";

type Row = Record<string, unknown>;
type Call = { op: string; filters: [string, unknown][] };

/** Minimal filter-aware fake: reads narrow by eq/is; updates are recorded. */
function recordingClient(tables: Record<string, Row[]>) {
  const calls: Call[] = [];
  const client = {
    schema: (schemaName: string) => ({
      from: (name: string) => {
        const call: Call = { op: "select", filters: [] };
        const matches = () =>
          (tables[`${schemaName}.${name}`] ?? []).filter((row) =>
            call.filters.every(([c, v]) => (v === null ? row[c] == null : row[c] === v)),
          );
        const chain: any = {
          select: () => chain,
          eq: (c: string, v: unknown) => (call.filters.push([c, v]), chain),
          is: (c: string, v: unknown) => (call.filters.push([c, v]), chain),
          update: () => ((call.op = "update"), calls.push(call), chain),
          maybeSingle: () => Promise.resolve({ data: matches()[0] ?? null, error: null }),
          then: (res: any, rej?: any) =>
            Promise.resolve({ data: matches(), error: null }).then(res, rej),
        };
        return chain;
      },
    }),
  };
  return { client, calls };
}

const OLD = "2020-01-01T00:00:00Z";

describe("deleteMirrorRow and database-owned rows", () => {
  it("refuses a database-owned row and issues no archive", async () => {
    const { client, calls } = recordingClient({
      "ui.ui_surface_write_target": [
        { surface_name: "applets/abc", name: "t", item_type: "", updated_at: OLD, declared_by: "database" },
      ],
    });
    await expect(
      deleteMirrorRow(client as any, {
        table: "ui_surface_write_target",
        surfaceName: "applets/abc",
        name: "t",
      } as any),
    ).rejects.toThrow(DATABASE_OWNED_REFUSAL_PREFIX);
    expect(calls.filter((c) => c.op === "update")).toHaveLength(0);
  });

  it("archives a code-owned row only with a declared_by = code predicate", async () => {
    const { client, calls } = recordingClient({
      "ui.ui_surface_client_tool": [
        { surface_name: "matrx-user/gone", name: "t", updated_at: OLD, declared_by: "code" },
      ],
    });
    await deleteMirrorRow(client as any, {
      table: "ui_surface_client_tool",
      surfaceName: "matrx-user/gone",
      name: "t",
    } as any);
    const update = calls.find((c) => c.op === "update");
    expect(update?.filters).toContainEqual(["declared_by", "code"]);
  });
});
