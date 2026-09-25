/**
 * GATES-TAIL-2. The tool catalog's Active switch toasted "Error updating tool" with no reason and
 * no remedy; the bulk Activate/Deactivate toasted the database's own line, and an update RLS
 * filtered to zero rows read as success. Rule: a refusal is said in words (what, why, what to
 * do), and a write that changed nothing is a refusal. The switch holds pending via
 * `usePendingWrites` (lib/errors/__tests__/usePendingWrites.test.tsx).
 */
const chain = { update: jest.fn(), in: jest.fn(), select: jest.fn() };
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ from: () => chain }) } }));

import { describeWriteFailure, WriteRefusedError } from "@/lib/errors/writeFailure";
import { putToolActive, setToolsActive } from "../tool-active-writes";

const RAW = /PUT|\/api\/admin|Failed to update|row-level|violates|definition"/;
const words = (err: unknown) => {
  const w = describeWriteFailure(err, { action: "turn off read_calendar_week", remedy: "Try again." });
  return `${w.title} ${w.description}`;
};

beforeEach(() => {
  jest.resetAllMocks();
  chain.update.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
});

it("a refused single-tool write carries the server's words and its status", async () => {
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: "Admin access required" }),
  })) as unknown as typeof fetch;
  const err = await putToolActive("7f1c2d3e-0000-4000-8000-00000000b001", false).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(WriteRefusedError);
  expect((err as WriteRefusedError).status).toBe(403);
  expect(words(err)).toMatch(/^Could not turn off read_calendar_week\. Admin access required/);
  expect(words(err)).not.toMatch(RAW);
});

it("a bulk write RLS filtered to zero rows is a refusal, said in words", async () => {
  chain.select.mockResolvedValue({ data: [], error: null });
  const err = await setToolsActive(["a", "b"], false).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(WriteRefusedError);
  expect(words(err)).toMatch(/Nothing was saved/);
});

it("a bulk write the database refused is said in words, never its line", async () => {
  chain.select.mockResolvedValue({
    data: null,
    error: { code: "42501", message: 'new row violates row-level security policy for table "definition"' },
  });
  chain.in.mockReturnValue(chain);
  const err = await setToolsActive(["a"], true).catch((e: unknown) => e);
  expect(err).toBeTruthy();
  expect(words(err)).toMatch(/permission/i);
  expect(words(err)).not.toMatch(RAW);
});
