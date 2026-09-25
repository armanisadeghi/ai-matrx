/**
 * No false "You don't have access" on a processed document (2026-09-25).
 *
 * admin@admin.com opened their own document and was told "You don't have access
 * to this processed document"; a second click opened it. The access gate answers
 * "denied" for any EXISTING row whose read came back with no error — by design, a
 * read that returned nothing is an authorization answer. So every surface must
 * only hand the gate a read that actually ran and actually came back empty:
 *
 *  - useLibraryDoc reported `loading: false, doc: null` on its first render,
 *    before its effect had started the read — the detail sheet mounted the gate.
 *  - the studio's document read returned a bare `null` for "no user known yet",
 *    for a failed request (an expired session on a waking tab), and for "empty",
 *    and the studio gated all three as an access question.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rpcResult: { data: unknown; error: unknown } = { data: null, error: null };
const queryResults: Array<{ data: unknown; error: unknown }> = [];
const getSession = jest.fn(async () => ({ data: { session: null }, error: null }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { auth: { getSession: () => getSession() } },
}));

jest.mock("@/utils/supabase/ragDb", () => ({
  ragDb: () => ({
    rpc: () => ({
      abortSignal: () => new Promise((resolve) => setTimeout(() => resolve(rpcResult), 5)),
    }),
  }),
}));

jest.mock("@/utils/supabase/docprocDb", () => {
  const chain = {
    select: () => chain,
    is: () => chain,
    eq: () => chain,
    maybeSingle: async () => queryResults.shift() ?? { data: null, error: null },
  };
  return {
    PROCESSED_DOCUMENTS_COLUMNS: "id",
    docprocDb: () => ({ from: () => chain }),
  };
});

import { useLibraryDoc } from "@/features/rag/hooks/useLibrary";
import { readProcessedDocument } from "@/features/pdf-extractor/hooks/usePdfExtractor";

describe("useLibraryDoc never reports 'empty' before its read has run", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    root = createRoot(host);
  });
  afterEach(() => act(() => root.unmount()));

  it("reports loading on the very first render for a requested id", async () => {
    const renders: Array<{ loading: boolean; hasDoc: boolean }> = [];
    function Probe() {
      const r = useLibraryDoc("00000000-0000-4000-8000-000000000001");
      renders.push({ loading: r.loading, hasDoc: r.doc !== null });
      return null;
    }
    await act(async () => {
      root.render(<Probe />);
    });
    // A render that says "not loading, no document" is what mounted the gate.
    expect(renders[0]).toEqual({ loading: true, hasDoc: false });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const last = renders[renders.length - 1];
    // The read settled empty: NOW (and only now) the surface may ask the gate.
    expect(last).toEqual({ loading: false, hasDoc: false });
    const firstSettled = renders.findIndex((r) => !r.loading);
    expect(firstSettled).toBeGreaterThan(0);
  });
});

describe("readProcessedDocument says WHY a document did not open", () => {
  const id = "00000000-0000-4000-8000-00000000000a";

  it("asks nothing and answers not-ready while no user is known", async () => {
    queryResults.length = 0;
    await expect(readProcessedDocument(id, null)).resolves.toEqual({ kind: "not-ready" });
  });

  it("reports a failed request as a fault, never as empty", async () => {
    const expired = { code: "PGRST301", message: "JWT expired" };
    queryResults.push({ data: null, error: expired }, { data: null, error: expired });
    await expect(readProcessedDocument(id, "user-1")).resolves.toEqual({
      kind: "fault",
      error: expired,
    });
  });

  it("recovers from one expired-session failure by refreshing and asking again", async () => {
    getSession.mockClear();
    queryResults.push(
      { data: null, error: { code: "PGRST301", message: "JWT expired" } },
      { data: { id: "00000000-0000-4000-8000-00000000000b", name: "Deck.pdf" }, error: null },
    );
    const read = await readProcessedDocument("00000000-0000-4000-8000-00000000000b", "user-1");
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(read.kind).toBe("ok");
  });

  it("answers absent only when the read ran and came back empty", async () => {
    queryResults.push({ data: null, error: null });
    await expect(
      readProcessedDocument("00000000-0000-4000-8000-00000000000c", "user-1"),
    ).resolves.toEqual({ kind: "absent" });
  });
});
