/**
 * A failed run lookup is never an answer: it retries, keeps auto-clean blocked
 * (answered=false), and after the retries shows "unavailable" — not silence.
 * Also: only runs linked to THIS doc count (batch root vs own child run).
 */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<T>(fn: () => T): { result: { current: T } } {
  const result = { current: undefined as T };
  function Probe() {
    result.current = fn();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(createElement(Probe)));
  return { result };
}
import { countOwnRuns, resetSharedPdfRunLookups, usePdfDocRun } from "../usePdfDocRun";

const getByLink = jest.fn();
const jobState: { status: string | null; error: unknown; reconnect: jest.Mock } = {
  status: null,
  error: null,
  reconnect: jest.fn(),
};
jest.mock("@ai-matrx/agents/matrx", () => ({
  getRuntimeOperationsByLink: (...a: unknown[]) => getByLink(...a),
}));
jest.mock("@ai-matrx/agents/react", () => ({
  useServerJob: () => ({ ...jobState, operation: null, outcome: null }),
}));
jest.mock("@/lib/api/matrx-transport", () => ({ createMatrxTransport: () => ({}) }));
jest.mock("@/lib/redux/hooks", () => {
  const store = { getState: () => ({}) };
  return { useAppStore: () => store };
});

const DOC = "8a1f0c2e-6b7d-4e5f-9a0b-1c2d3e4f5a6b";

beforeEach(() => {
  jest.useFakeTimers();
  getByLink.mockReset();
  resetSharedPdfRunLookups();
  jobState.status = null;
  jobState.error = null;
  window.sessionStorage.clear();
});
afterEach(() => jest.useRealTimers());

it("counts only runs linked to this doc, tolerating both server shapes", () => {
  const own = { link_kind: "processed_document", link_id: DOC };
  const root = { link_kind: "batch", link_id: "batch-1" };
  expect(countOwnRuns([root], DOC)).toBe(0);
  expect(countOwnRuns([root, own], DOC)).toBe(1);
  expect(countOwnRuns([{ link_kind: null, link_id: null }], DOC)).toBe(1);
  expect(countOwnRuns(null, DOC)).toBe(0);
});

it("retries a failed lookup, stays unanswered, then says unavailable", async () => {
  window.sessionStorage.setItem(
    "pdf-extractor:runs",
    JSON.stringify({ [DOC]: { requestId: "b", kind: "upload", at: Date.now() } }),
  );
  getByLink.mockRejectedValue(new Error("network"));
  const { result } = renderHook(() =>
    usePdfDocRun({ docId: DOC, localStreaming: false, onSettled: jest.fn() }),
  );
  await act(async () => {});
  expect(getByLink).toHaveBeenCalledTimes(1);
  expect(result.current.answered).toBe(false);
  expect(result.current.phase).toBe("checking");
  for (const ms of [1000, 2000, 4000]) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }
  expect(getByLink).toHaveBeenCalledTimes(4);
  expect(result.current.phase).toBe("unavailable");
  expect(result.current.answered).toBe(false);
});

it("no open doc: no lookup, and never 'unavailable'", async () => {
  const { result } = renderHook(() =>
    usePdfDocRun({ docId: null, localStreaming: false, onSettled: jest.fn() }),
  );
  await act(async () => {});
  for (const ms of [1000, 2000, 4000, 8000]) {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  }
  expect(getByLink).not.toHaveBeenCalled();
  expect(result.current.phase).not.toBe("unavailable");
});

it("looks a doc's run up once even when several shells / double effects ask", async () => {
  getByLink.mockResolvedValue({ operations: [] });
  const mount = () =>
    renderHook(() => usePdfDocRun({ docId: DOC, localStreaming: false, onSettled: jest.fn() }));
  mount();
  mount(); // desktop + mobile, or a StrictMode remount
  await act(async () => {});
  expect(getByLink).toHaveBeenCalledTimes(1);
});
