/** @jest-environment jsdom */
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";
import { useAssistsQuery, type AssistsManagerApi } from "./useAssistsQuery";

jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => jest.fn(), useAppSelector: () => "test-user" }));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUserId: jest.fn() }));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({ captureError: jest.fn() }));
jest.mock("../redux/assistsSlice", () => ({ assistDecided: jest.fn(), fetchMyAssists: jest.fn() }));
jest.mock("../service", () => ({
  queryAssists: jest.fn(), fetchAssistStats: jest.fn(), listMySourceSuppressions: jest.fn(), markAssistsViewed: jest.fn(),
  bulkDismissAssists: jest.fn(), bulkSnoozeAssists: jest.fn(), restoreAssist: jest.fn(), setAssistStarred: jest.fn(), unsuppressAssistSource: jest.fn(),
}));
import { queryAssists, fetchAssistStats, listMySourceSuppressions } from "../service";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

let current: AssistsManagerApi;
const options = { statuses: ["pending" as const], includeSnoozed: false, starredOnly: false, unseenOnly: false, urgency: null };
const initialQuery: MatrxDataTableQueryState = { search: "", columnFilters: {}, anyOf: "", sort: { id: "created_at", direction: "desc" }, page: 1, pageSize: 25 };
function Probe({ query }: { query: MatrxDataTableQueryState }) {
  const result = useAssistsQuery(query, options);
  useEffect(() => { current = result; }, [result]);
  return null;
}

describe("current-query assists availability", () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    jest.mocked(fetchAssistStats).mockResolvedValue({ pending: 0, accepted: 0, dismissed: 0, expired: 0, superseded: 0, resolved: 0 });
    jest.mocked(listMySourceSuppressions).mockResolvedValue([]);
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

  it("distinguishes an unloaded inbox from a successfully empty inbox", async () => {
    const read = deferred<Awaited<ReturnType<typeof queryAssists>>>();
    jest.mocked(queryAssists).mockReturnValue(read.promise);
    await act(async () => root.render(<Probe query={initialQuery} />));
    expect(current.loading).toBe(true); expect(current.loaded).toBe(false);
    await act(async () => read.resolve({ rows: [], total: 0, unreadable: 0 }));
    expect(current.loading).toBe(false); expect(current.loaded).toBe(true); expect(current.total).toBe(0);
  });

  it("hides the previous query immediately and ignores its late response", async () => {
    const old = deferred<Awaited<ReturnType<typeof queryAssists>>>();
    const next = deferred<Awaited<ReturnType<typeof queryAssists>>>();
    jest.mocked(queryAssists).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    await act(async () => root.render(<Probe query={initialQuery} />));
    await act(async () => root.render(<Probe query={{ ...initialQuery, search: "new search" }} />));
    await act(async () => next.resolve({ rows: [], total: 0, unreadable: 0 }));
    expect(current.loaded).toBe(true);
    await act(async () => old.resolve({ rows: [], total: 99, unreadable: 0 }));
    expect(current.total).toBe(0); expect(current.loaded).toBe(true);
  });

  it("a failed replacement query never presents the prior success as current", async () => {
    jest.mocked(queryAssists).mockResolvedValueOnce({ rows: [], total: 7, unreadable: 0 });
    const next = deferred<Awaited<ReturnType<typeof queryAssists>>>();
    jest.mocked(queryAssists).mockReturnValueOnce(next.promise);
    await act(async () => root.render(<Probe query={initialQuery} />));
    expect(current.loaded).toBe(true);
    await act(async () => root.render(<Probe query={{ ...initialQuery, search: "refused" }} />));
    expect(current.loaded).toBe(false); expect(current.error).toBeNull();
    await act(async () => next.reject(new Error("Read refused")));
    expect(current.loaded).toBe(false); expect(current.loading).toBe(false); expect(current.error).toBe("Read refused");
  });
});
