/**
 * FORCING TEST (active-org law, 2026-09-30): resuming an unfinished quiz reads
 * across EVERY organization the person is in. The active organization is only
 * where a NEW session is filed — it must never narrow this lookup.
 */

const calls: Array<[string, ...unknown[]]> = [];
const builder: Record<string, unknown> = {};
for (const m of ["select", "is", "eq", "order", "limit"]) {
  builder[m] = (...args: unknown[]) => {
    calls.push([m, ...args]);
    return builder;
  };
}
builder.maybeSingle = async () => ({ data: null, error: null });

jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ schema: () => ({ from: () => builder }) }),
}));
jest.mock("@/utils/supabase/resolveUser", () => ({
  getClaimsUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
}));
jest.mock("@/utils/supabase/writeOne", () => ({ tryWriteOne: jest.fn(), writeOneRow: jest.fn() }));

import { findExistingQuizByHash } from "../quiz.actions";

it("looks the session up by owner + content hash with NO organization predicate", async () => {
  calls.length = 0;
  const result = await findExistingQuizByHash("hash-1");
  expect(result).toEqual({ success: true, data: undefined });
  const columns = calls.filter(([m]) => m === "eq").map(([, col]) => col);
  expect(columns).toEqual(["created_by", "quiz_content_hash", "is_completed"]);
});
