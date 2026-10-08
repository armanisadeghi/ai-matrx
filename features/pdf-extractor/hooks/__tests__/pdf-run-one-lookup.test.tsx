/**
 * One by-link lookup per doc open, through the REAL hook and the REAL
 * @ai-matrx/agents follow path (only the transport's wire is faked). The probe
 * and the follow's identify step used to issue two identical GETs ~450 ms apart.
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const wire: string[] = [];
const OP = (docId: string) => ({
  execution_id: "e1",
  request_id: "r1",
  type: "pdf_clean",
  status: "completed",
  is_terminal: true,
  waiting_input: false,
  cost: 0,
  meters: {},
  link_kind: "processed_document",
  link_id: docId,
  error: null,
  created_at: null,
  started_at: null,
  ended_at: "2020-01-01T00:00:00Z",
  last_event_seq: 1,
});
jest.mock("@/lib/api/matrx-transport", () => ({
  createMatrxTransport: () => ({
    fetch: async (path: string) => {
      wire.push(path.split("?")[0]);
      const docId = path.split("/by-link/processed_document/")[1]?.split("?")[0] ?? "";
      return new Response(JSON.stringify({ operations: [OP(docId)] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  }),
}));
jest.mock("@/lib/redux/hooks", () => {
  const store = { getState: () => ({}) };
  return { useAppStore: () => store };
});

import { resetSharedPdfRunLookups, usePdfDocRun } from "../usePdfDocRun";

const DOC = "8a1f0c2e-6b7d-4e5f-9a0b-1c2d3e4f5a6b";

function mount(docId: string) {
  const result = { current: undefined as ReturnType<typeof usePdfDocRun> | undefined };
  function Probe() {
    result.current = usePdfDocRun({ docId, localStreaming: false, onSettled: jest.fn() });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { result, root };
}

beforeEach(() => {
  wire.length = 0;
  resetSharedPdfRunLookups();
  window.sessionStorage.clear();
});

it("opening a doc issues exactly one by-link GET (probe + follow share it)", async () => {
  const { result } = mount(DOC);
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(result.current?.answered).toBe(true);
  const links = wire.filter((p) => p.includes("/by-link/"));
  expect(links).toEqual([`/runtime/operations/by-link/processed_document/${DOC}`]);
});
