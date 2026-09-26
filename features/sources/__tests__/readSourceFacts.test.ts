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

const ids = Array.from({ length: 60 }, (_, i) => `id-${i}`);

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (_fn: string, args: { p_ids: string[] }) =>
    args.p_ids.includes("id-30")
      ? { data: null, error: { code: "57014", message: "statement timeout" } }
      : { data: args.p_ids.map(factsRow), error: null },
  );
});

describe("reading Source facts in batches", () => {
  it("keeps every successful batch when one batch fails", async () => {
    const { facts, failedIds } = await readSourceFacts(ids);
    // Batches of 25: ids 0-24 and 50-59 succeed; 25-49 (holding id-30) fails.
    expect(facts.size).toBe(35);
    expect(facts.has("id-0")).toBe(true);
    expect(facts.has("id-59")).toBe(true);
    expect([...failedIds].sort()).toEqual(ids.slice(25, 50).sort());
    expect(failedIds.has("id-0")).toBe(false);
  });

  it("a retry of the failed ids fills them in", async () => {
    rpc.mockImplementation(async (_fn: string, args: { p_ids: string[] }) => ({
      data: args.p_ids.map(factsRow),
      error: null,
    }));
    const { facts, failedIds } = await readSourceFacts(ids.slice(25, 50));
    expect(facts.size).toBe(25);
    expect(failedIds.size).toBe(0);
  });
});
