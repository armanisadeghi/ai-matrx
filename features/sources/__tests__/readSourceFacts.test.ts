/**
 * The Sources page reads per-row stage facts in parallel batches. One failed
 * batch used to throw away EVERY batch — the whole list then read "Unknown".
 * A failure belongs only to the rows in the batch that failed: the others keep
 * their facts, and the failed ids come back so those rows can offer a retry.
 */
const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) },
}));
jest.mock("@ai-matrx/data/db", () => ({ readAllRows: jest.fn() }));

import { readSourceFacts } from "@/features/sources/hooks/useSources";

function factsRow(id: string) {
  return {
    processed_document_id: id,
    chunk_count: 1,
    has_entities: false,
    attachments: [],
    current_document_id: id,
    current_chunk_count: 1,
    current_has_entities: false,
    stale_chunk_count: 0,
    indexing: false,
    head_document_id: id,
  };
}

const ids = Array.from({ length: 600 }, (_, i) => `id-${i}`);

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (_fn: string, args: { p_ids: string[] }) =>
    args.p_ids.includes("id-300")
      ? { data: null, error: { code: "57014", message: "statement timeout" } }
      : { data: args.p_ids.map(factsRow), error: null },
  );
});

describe("reading Source facts in batches", () => {
  it("keeps every successful batch when one batch fails", async () => {
    const { facts, failedIds } = await readSourceFacts(ids);
    // Batches of 200: 0-199 and 400-599 succeed; 200-399 (holding id-300) fails.
    expect(facts.size).toBe(400);
    expect(facts.has("id-0")).toBe(true);
    expect(facts.has("id-599")).toBe(true);
    expect([...failedIds].sort()).toEqual(ids.slice(200, 400).sort());
    expect(failedIds.has("id-0")).toBe(false);
  });

  it("a retry of the failed ids fills them in", async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_ids: string[] }) => ({
      data: args.p_ids.map(factsRow),
      error: null,
    }));
    const { facts, failedIds } = await readSourceFacts(ids.slice(200, 400));
    expect(facts.size).toBe(200);
    expect(failedIds.size).toBe(0);
  });
});

// ── Measured 2026-09-26 as admin@admin.com on the live DB (548 of their Sources) ──
// `source_list_facts` costs ~6 s PER CALL whatever the batch size (its RLS
// materializes every visible processed_document once per call); the per-id
// cost is small. 25-id batches × 8 parallel: 22/22 batches hit 57014 at 8 s.
// 200-id batches, 1–2 at a time: 0 failures, ~6.2 s each.
describe("batch shape against a per-call cost", () => {
  it("reads 548 Sources in at most 3 calls, one at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    rpc.mockImplementation(async (_fn: string, args: { p_ids: string[] }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { data: args.p_ids.map(factsRow), error: null };
    });
    const many = Array.from({ length: 548 }, (_, i) => `m-${i}`);
    const { facts, failedIds } = await readSourceFacts(many);
    expect(rpc.mock.calls.length).toBeLessThanOrEqual(3);
    expect(peak).toBe(1);
    expect(facts.size).toBe(548);
    expect(failedIds.size).toBe(0);
  });
});
