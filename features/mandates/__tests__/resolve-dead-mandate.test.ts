/**
 * THE CLASS BEHIND ARMAN'S "this mandate does not exist" (2026-08-31).
 *
 * A client-side mandate resolution must never satisfy a run — or an
 * availability probe that gates a run button — with a definition that cannot
 * run. There are three dead states and they all produce the same live symptom:
 * an affordance renders as if it works, and the run door 404s.
 *
 *   · SOFT-DELETED — `mandates.goal_writer` carries
 *     `deleted_at 2026-08-29 22:22:35Z` in `mandate.definition` and no default
 *     holder. This is the exact row the goal-writer constant pointed at.
 *   · DISABLED — `is_enabled = false`.
 *   · HOLDERLESS — nothing names an agent, so there is nothing to run.
 *
 * The read is filtered at the query (`deleted_at is null`), which is why the
 * first case is asserted on the QUERY rather than on a returned row: a filter
 * that quietly disappears is exactly how this class comes back.
 */

import { resolveMandate } from "../service";

const state: {
  filters: Array<[string, unknown]>;
  row: Record<string, unknown> | null;
} = { filters: [], row: null };

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => {
        const builder: Record<string, unknown> = {};
        const chain = (name: string) => (...args: unknown[]) => {
          state.filters.push([name, args]);
          return builder;
        };
        for (const m of ["select", "eq", "is", "in", "order", "limit"]) {
          builder[m] = chain(m);
        }
        builder.maybeSingle = () =>
          Promise.resolve({ data: state.row, error: null });
        return builder;
      },
    }),
    auth: {
      getUser: () =>
        Promise.resolve({
          data: { user: { id: "dead-mandate-test-user" } },
          error: null,
        }),
    },
  }),
}));

function isFilterApplied(column: string): boolean {
  return state.filters.some(
    ([name, args]) =>
      name === "is" &&
      Array.isArray(args) &&
      args[0] === column &&
      args[1] === null,
  );
}

beforeEach(() => {
  state.filters = [];
  state.row = null;
});

describe("resolveMandate refuses every dead definition", () => {
  it("filters soft-deleted rows out at the query — a probe can never see one", async () => {
    // A unique key per case: `resolveMandate` memoizes successful resolutions.
    await expect(
      resolveMandate("zzz.deleted_probe_a", { optional: true }),
    ).resolves.toBeNull();
    expect(isFilterApplied("deleted_at")).toBe(true);
  });

  it("refuses a DISABLED definition by name", async () => {
    state.row = {
      id: "m1",
      mandate_key: "zzz.disabled_probe",
      is_enabled: false,
      default_holder_id: "a1",
      default_holder_type: "agent",
      default_holder_version_id: null,
    };
    await expect(resolveMandate("zzz.disabled_probe")).rejects.toThrow(
      /disabled/i,
    );
  });

  it("refuses a HOLDERLESS definition — there is nothing to run", async () => {
    state.row = {
      id: "m2",
      mandate_key: "zzz.holderless_probe",
      is_enabled: true,
      default_holder_id: null,
      default_holder_type: "agent",
      default_holder_version_id: null,
    };
    await expect(resolveMandate("zzz.holderless_probe")).rejects.toThrow();
  });
});
