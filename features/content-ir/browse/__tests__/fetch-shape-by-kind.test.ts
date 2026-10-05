/**
 * A shape off the current page (a pinned pick, a locked agent's shape) is read
 * by kind through the canonical list RPC, and the row carries `description`.
 */

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

import { fetchShapeByKind } from "../service";

const row = (kind: string, description: string | null) => ({ id: kind, kind, label: kind, description, total_count: 2 });

beforeEach(() => rpc.mockReset());

it("asks the canonical RPC for the kind and returns the exact match with its description", async () => {
  rpc.mockResolvedValue({ data: [row("quiz_set_extra", null), row("quiz_set", "A set of quiz questions.")], error: null });
  const found = await fetchShapeByKind("quiz_set");
  expect(rpc).toHaveBeenCalledWith(
    "shx_list_scoped",
    expect.objectContaining({ p_scope: "all", p_filters: { kind: { kind: "text", value: "quiz_set" } } }),
  );
  expect(found?.description).toBe("A set of quiz questions.");
});

it("null when only a longer slug matches, and a failed read throws", async () => {
  rpc.mockResolvedValue({ data: [row("quiz_set_extra", null)], error: null });
  expect(await fetchShapeByKind("quiz_set")).toBeNull();
  rpc.mockResolvedValue({ data: null, error: { message: "boom", code: "XX000" } });
  await expect(fetchShapeByKind("quiz_set")).rejects.toThrow();
});
