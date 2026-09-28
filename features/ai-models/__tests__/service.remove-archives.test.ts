/**
 * Delete means archive (Arman, 2026-09-27): removing an AI model moves the
 * ai.model_definition row to Trash (deleted_at) — never a hard DELETE.
 */
const calls: Array<[string, unknown[]]> = [];

function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["schema", "from", "update", "delete", "eq", "is", "select"]) {
    c[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return c;
    };
  }
  c.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [{ id: "m1" }], error: null }).then(resolve);
  return c;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: (...args: unknown[]) => (chain().schema as (...a: unknown[]) => unknown)(...args) },
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));

import { aiModelService } from "../service";

describe("aiModelService.remove", () => {
  it("sets deleted_at on the model and never issues a DELETE", async () => {
    await aiModelService.remove("m1");
    const names = calls.map(([m]) => m);
    expect(names).not.toContain("delete");
    const update = calls.find(([m]) => m === "update");
    expect(update).toBeDefined();
    expect(Object.keys(update![1][0] as object)).toEqual(["deleted_at"]);
    expect(calls).toContainEqual(["from", ["model_definition"]]);
    expect(calls).toContainEqual(["eq", ["id", "m1"]]);
  });
});
