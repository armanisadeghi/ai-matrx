/**
 * G10B review (2026-10-02): the first update confirm of a session waited on a
 * second read of a record the card had just read. A finished read is kept for
 * `RECORD_READ_FRESH_MS`, so the confirm (or the Apply hover warm-up) answers
 * from it — and a write on this page (a revision bump) is never answered from
 * the read taken before it.
 */
const maybeSingle = jest.fn();

jest.mock("@/utils/supabase/client", () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: () => maybeSingle() };
  return { supabase: { from: () => chain, schema: () => ({ from: () => chain }) } };
});

import { noteRecordChanged } from "@ai-matrx/content-ir-react";
import { readDirectiveRecord } from "@/features/matrx-envelope/directiveRecordRow";

const ID = "48afefc4-7c41-4d06-8283-d01a76ce16a6";

describe("a record read is kept for the confirm", () => {
  it("answers a second read from the first, and reads again after a write", async () => {
    maybeSingle.mockResolvedValue({ data: { id: ID, title: "G10B Review5" }, error: null });
    await readDirectiveRecord({ noun: "task", id: ID });
    await readDirectiveRecord({ noun: "task", id: ID });
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    noteRecordChanged(ID);
    await readDirectiveRecord({ noun: "task", id: ID });
    expect(maybeSingle).toHaveBeenCalledTimes(2);
  });
});
