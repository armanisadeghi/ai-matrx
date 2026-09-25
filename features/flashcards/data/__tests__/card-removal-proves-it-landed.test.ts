/**
 * Removing a card, set, or detail must PROVE the soft-delete landed.
 *
 * A PostgREST `update` that RLS filters to zero rows returns `error: null`.
 * The old `deleteCard` / `deleteSet` / `softDeleteDetail` / `mergeCards`
 * trusted that, so the set editor toasted "Card deleted" while the card stayed
 * (2026-09-25). Each path now reads back the rows it wrote and fails loudly on
 * zero. The fake below behaves like PostgREST: the update answers with the rows
 * RLS let through (none when refused), and never an error for a refusal.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(), rpc: jest.fn() },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { add: jest.fn(async () => ({ ok: true })) },
}));

import { supabase } from "@/utils/supabase/client";
import { fcService } from "../fcService";

type Update = { table: string; values: Record<string, unknown>; ids: string[] };

/** A PostgREST-shaped fake: `allowed` is the set of ids RLS lets this caller update. */
function install(allowed: Set<string>) {
  const updates: Update[] = [];
  const schema = {
    from(table: string) {
      let pending: Update | null = null;
      const q: Record<string, unknown> = {};
      const resolveUpdate = () => {
        const u = pending!;
        updates.push(u);
        const rows = u.ids.filter((id) => allowed.has(id)).map((id) => ({ id }));
        return { data: rows, error: null, count: rows.length };
      };
      Object.assign(q, {
        update(values: Record<string, unknown>) {
          pending = { table, values, ids: [] };
          return q;
        },
        eq(col: string, val: string) {
          if (pending && col === "id") pending.ids = [val];
          return q;
        },
        in(col: string, vals: string[]) {
          if (pending && col === "id") pending.ids = vals;
          return q;
        },
        is: () => q,
        neq: () => q,
        select: () => q,
        // A refusal is never an error — only fewer (or zero) rows.
        then(resolve: (v: unknown) => void) {
          return Promise.resolve(resolveUpdate()).then(resolve);
        },
      });
      return q;
    },
  };
  (supabase.schema as jest.Mock).mockReturnValue(schema);
  return updates;
}

afterEach(() => jest.clearAllMocks());

describe.each([
  ["deleteCard", (id: string) => fcService.deleteCard(id), "fc_card"],
  ["deleteSet", (id: string) => fcService.deleteSet(id), "fc_set"],
  ["softDeleteDetail", (id: string) => fcService.softDeleteDetail(id), "fc_detail"],
] as const)("%s", (name, run, table) => {
  it("reports success only when the row was actually soft-deleted", async () => {
    const updates = install(new Set(["row-1"]));
    const res = await run("row-1");
    expect(res.error).toBeNull();
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe(table);
    expect(updates[0].values.deleted_at).toEqual(expect.any(String));
  });

  it("fails loudly when RLS refused the update (zero rows, no error)", async () => {
    install(new Set());
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = await run("row-1");
    spy.mockRestore();
    expect(res.error).toMatch(new RegExp(`^${name}: Nothing was removed`));
  });
});
