/**
 * Cache invalidation race (2026-10-06): a read already in flight when a doc is
 * invalidated started BEFORE the write, yet it used to be cached for 30s and
 * handed to every later reader — the studio showed no clean text for half a
 * minute after the server wrote it.
 */
type Row = { data: unknown; error: unknown };
const pending: Array<(r: Row) => void> = [];
const queries = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
}));
jest.mock("@/utils/supabase/docprocDb", () => {
  const chain = {
    select: () => chain,
    is: () => chain,
    eq: () => chain,
    maybeSingle: () => {
      queries();
      return new Promise<Row>((resolve) => pending.push(resolve));
    },
  };
  return {
    PROCESSED_DOCUMENTS_COLUMNS: "id",
    docprocDb: () => ({ from: () => chain }),
  };
});

import {
  invalidateProcessedDocumentCache,
  readProcessedDocument,
} from "@/features/pdf-extractor/hooks/usePdfExtractor";

const DOC = "22222222-2222-2222-2222-222222222222";
const row = (clean: string | null) => ({
  data: { id: DOC, name: "n", content: "raw", clean_content: clean },
  error: null,
});
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  pending.length = 0;
  queries.mockClear();
  invalidateProcessedDocumentCache();
});

it("a read in flight at invalidation is neither shared nor cached", async () => {
  const stale = readProcessedDocument(DOC, "u1");
  await tick();
  expect(queries).toHaveBeenCalledTimes(1);

  invalidateProcessedDocumentCache(DOC);

  const fresh = readProcessedDocument(DOC, "u1");
  await tick();
  // A new read was issued — the pre-write one was not reused.
  expect(queries).toHaveBeenCalledTimes(2);

  pending[1](row("cleaned text"));
  await fresh;
  pending[0](row(null)); // the old read lands LAST
  await stale;

  const next = await readProcessedDocument(DOC, "u1");
  expect(next.kind).toBe("ok");
  if (next.kind === "ok") expect(next.doc.cleanContent).toBe("cleaned text");
});
