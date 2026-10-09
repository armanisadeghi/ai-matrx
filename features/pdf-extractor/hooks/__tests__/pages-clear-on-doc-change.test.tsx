/** Switching docs never renders the previous doc's pages under the new doc. */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let releaseB: (() => void) | null = null;

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "u1" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: () => "u1" }));
jest.mock("@/utils/supabase/docprocDb", () => {
  let docId = "";
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.is = () => chain;
  chain.eq = (_c: string, v: string) => {
    docId = v;
    return chain;
  };
  chain.maybeSingle = async () => ({ data: { id: docId }, error: null });
  chain.order = async () => {
    const n = docId === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" ? 48 : 1;
    if (docId.startsWith("b")) await new Promise<void>((r) => { releaseB = r; });
    return {
      data: Array.from({ length: n }, (_, i) => ({ id: `${docId}-${i}`, page_index: i, page_number: i + 1 })),
      error: null,
    };
  };
  return { docprocDb: () => ({ from: () => chain }) };
});

import { useProcessedDocumentPages } from "../useProcessedDocumentPages";

it("pages clear the moment the doc changes, and show only the new doc's rows", async () => {
  const seen: Array<{ doc: string; n: number }> = [];
  function Probe({ id }: { id: string }) {
    const { pages } = useProcessedDocumentPages({ processedDocumentId: id });
    seen.push({ doc: id, n: pages.length });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Probe, { id: A })));
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  expect(seen[seen.length - 1]).toEqual({ doc: A, n: 48 });

  await act(async () => root.render(createElement(Probe, { id: B })));
  // B's read is still pending: no render for B may carry A's 48 pages.
  expect(seen.filter((s) => s.doc === B).every((s) => s.n === 0)).toBe(true);
  await act(async () => { releaseB?.(); await new Promise((r) => setTimeout(r, 10)); });
  expect(seen[seen.length - 1]).toEqual({ doc: B, n: 1 });
});
