import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSnapshots, marketingKeys } from "./hooks";
import {
  getSnapshotReceiptWatermark,
  listSnapshotReceiptPage,
} from "./service";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";
import type { SnapshotReceiptPage } from "./service";
import type { PageSnapshot } from "../types";

/**
 * A REAL `web.snapshot` row (the generated shape), with only the id varying.
 * The hook hands these straight to the table, so a fixture that carries an id
 * and nothing else lets a test pass while the surface would render a row it
 * cannot read.
 */
function snapshotRow(id: string): PageSnapshot {
  return {
    audit_metrics: null,
    body_file_id: "body-file",
    captured_at: "2026-09-13T00:00:00Z",
    content_hash: null,
    created_at: "2026-09-13T00:00:00Z",
    created_by: null,
    deleted_at: null,
    extracted: {},
    final_url: "https://example.com/page",
    head_tags: {},
    headings: [],
    http_status: 200,
    id,
    images: [],
    links_summary: {},
    markdown_file_id: null,
    metadata: {},
    organization_id: "org-1",
    page_id: "page",
    perf: {},
    processed_document_id: null,
    seo_metrics: null,
    session_id: "session-1",
    site_id: "site",
    structured_data: {},
    updated_at: "2026-09-13T00:00:00Z",
    updated_by: null,
    version: 1,
    word_count: 120,
  };
}

jest.mock("./service", () => ({
  getSnapshotReceiptWatermark: jest.fn(),
  listSnapshotReceiptPage: jest.fn(),
  decodeSnapshotReceiptCursor: (value: string) => JSON.parse(value),
  snapshotSourceIdentity: (state: MatrxDataTableQueryState) => ({
    pageSize: state.pageSize,
    search: state.search,
  }),
  SnapshotReceiptError: class SnapshotReceiptError extends Error {},
}));
const watermark = jest.mocked(getSnapshotReceiptWatermark);
const page = jest.mocked(listSnapshotReceiptPage);
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const state: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 10,
  search: "",
  searchMatchMode: "contains",
  anyOf: "",
  layeredFilters: [],
  columnFilters: {},
  sort: { id: "captured_at", direction: "desc" },
};
let result: ReturnType<typeof useSnapshots> | null = null;
function Harness() {
  result = useSnapshots("site", "page", state);
  return null;
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("snapshot append production hook", () => {
  let client: QueryClient;
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(async () => {
    watermark.mockReset().mockResolvedValue("2026-09-13T00:00:00Z");
    page
      .mockReset()
      .mockResolvedValueOnce({
        rows: [snapshotRow("one")],
        total: 2,
        nextCursor: JSON.stringify({
          watermark: "2026-09-13T00:00:00Z",
          sortId: "captured_at",
          direction: "desc",
          value: "x",
          id: "one",
        }),
      })
      .mockResolvedValueOnce({
        rows: [snapshotRow("two")],
        total: 2,
        nextCursor: null,
      });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      ),
    );
    await flush();
    await flush();
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    client.clear();
  });
  it("loadAll reaches the frozen terminal receipt", async () => {
    await act(async () => result!.pagination.requestLoadAll());
    for (
      let count = 0;
      count < 10 && result!.pagination.rows.length < 2;
      count += 1
    )
      await flush();
    expect(result!.pagination.rows.map((row) => row.id)).toEqual([
      "one",
      "two",
    ]);
  });
  it("invalidation starts a fresh watermark receipt", async () => {
    await act(async () =>
      client.refetchQueries({ queryKey: marketingKeys.page("site", "page") }),
    );
    for (
      let count = 0;
      count < 10 && watermark.mock.calls.length < 2;
      count += 1
    )
      await flush();
    expect(watermark.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
  it("aborts and clears an old append receipt when the page lineage is invalidated", async () => {
    expect(result!.pagination.rows.map((row) => row.id)).toEqual(["one"]);
    const oldPage = deferred<SnapshotReceiptPage>();
    const freshPage = deferred<SnapshotReceiptPage>();
    let oldSignal: AbortSignal | undefined;
    page
      .mockReset()
      .mockImplementationOnce(({ signal }) => {
        oldSignal = signal;
        return oldPage.promise;
      })
      .mockImplementationOnce(() => freshPage.promise);
    watermark.mockReset().mockResolvedValue("2026-09-14T00:00:00Z");

    await act(async () => result!.pagination.requestLoadAll());
    for (let count = 0; count < 10 && !oldSignal; count += 1) await flush();
    expect(oldSignal).toBeDefined();

    await act(async () => {
      await client.invalidateQueries({
        queryKey: marketingKeys.page("site", "page"),
      });
    });
    for (
      let count = 0;
      count < 10 && watermark.mock.calls.length < 1;
      count += 1
    )
      await flush();
    expect(oldSignal!.aborted).toBe(true);
    expect(result!.pagination.rows).toEqual([]);
    expect(watermark).toHaveBeenCalledTimes(1);

    await act(async () =>
      freshPage.resolve({
        rows: [snapshotRow("fresh-one")],
        total: 1,
        nextCursor: null,
      }),
    );
    for (
      let count = 0;
      count < 10 && result!.pagination.rows.length !== 1;
      count += 1
    )
      await flush();
    oldPage.resolve({
      rows: [snapshotRow("stale-two")],
      total: 2,
      nextCursor: null,
    });
    await flush();
    expect(result!.pagination.rows.map((row) => row.id)).toEqual(["fresh-one"]);
  });
});
