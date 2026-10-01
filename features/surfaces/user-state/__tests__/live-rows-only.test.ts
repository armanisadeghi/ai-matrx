/**
 * The person's saved surface state is read and written exactly the way the
 * server reads it: live rows only (aidream context_rules reads
 * `deleted_at IS NULL`). An archived row read here would show a context rule
 * the server never applies; a save into an archived row would vanish.
 */

const calls: Array<[string, unknown[]]> = [];

function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["schema", "from", "select", "eq", "is", "upsert"]) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return m === "is" || m === "upsert" ? Promise.resolve(result) : b;
    };
  }
  return b;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: (...a: unknown[]) => (builder({ data: [], error: null }).schema as (...x: unknown[]) => unknown)(...a) },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({ ensureOrgId: async () => "org-1" }));
jest.mock("@/lib/organizations/organizationRefusalToast", () => ({
  withOrganizationRefusalShown: async (_v: string, fn: () => Promise<string>) => fn(),
}));

import { surfaceUserStateService } from "../service";

beforeEach(() => {
  calls.length = 0;
});

it("loads only the caller's live rows", async () => {
  await surfaceUserStateService.loadFeature("4060701e-706a-4c76-b3ca-0bbc69fa5a14", "context_rules");
  expect(calls).toContainEqual(["is", ["deleted_at", null]]);
  expect(calls).toContainEqual(["eq", ["user_id", "4060701e-706a-4c76-b3ca-0bbc69fa5a14"]]);
});

it("a save revives an archived row instead of writing into one the server ignores", async () => {
  await surfaceUserStateService.save("u1", "context_rules", "_default", { a: { include: false } });
  const upsert = calls.find(([m]) => m === "upsert");
  expect((upsert?.[1][0] as Record<string, unknown>).deleted_at).toBeNull();
});
