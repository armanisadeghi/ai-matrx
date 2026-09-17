/**
 * Guards for the connected-account browse service.
 *
 * The one that matters: this list walks someone else's mailbox, so until the
 * walk ends there IS no total. A surface that reports the page it holds as the
 * size of the corpus tells a person their 50,000-message mailbox holds 50.
 */

import { createConnectedSourceListService } from "./service";
import type { ConnectedBrowseResponse } from "../types";

const mockBrowse = jest.fn();
jest.mock("../api", () => ({
  browseConnectedSources: (...args: unknown[]) => mockBrowse(...args),
  ConnectedSourcesError: class extends Error {},
}));

const dispatch = jest.fn() as unknown as Parameters<
  typeof createConnectedSourceListService
>[0];

const query = {
  page: 1,
  search: "",
  scope: { kind: "mine" },
} as unknown as Parameters<
  ReturnType<typeof createConnectedSourceListService>["fetchPage"]
>[0];

const sort = {
  sort: "title",
  direction: "asc",
  favoritesFirst: false,
  pageSize: 2,
} as unknown as Parameters<
  ReturnType<typeof createConnectedSourceListService>["fetchPage"]
>[1];

function response(over: Partial<ConnectedBrowseResponse>): ConnectedBrowseResponse {
  return {
    adapter: "onedrive_drive",
    connection_id: "conn",
    sources: [],
    scanned: 0,
    matched: 0,
    elapsed_seconds: 0.1,
    sources_per_second: 0,
    has_more: false,
    offset: 0,
    total: 0,
    summary: "Read 0 item(s).",
    ...over,
  };
}

beforeEach(() => jest.clearAllMocks());

test("an unfinished walk never reports the page as the corpus", async () => {
  mockBrowse.mockResolvedValue(
    response({
      sources: [
        { id: "a", external_id: "a", adapter: "onedrive_drive", kind: "file", title: "a" },
        { id: "b", external_id: "b", adapter: "onedrive_drive", kind: "file", title: "b" },
      ] as ConnectedBrowseResponse["sources"],
      matched: 2,
      has_more: true,
      total: null,
    }),
  );

  const service = createConnectedSourceListService(dispatch, {
    adapter: "onedrive_drive",
    connectionId: "conn",
  });
  const page = await service.fetchPage(query, sort);

  expect(page.rows).toHaveLength(2);
  // 2 held + "there is at least one more" — never 2 presented as the whole.
  expect(page.total).toBe(3);
});

test("a finished walk reports the real total", async () => {
  mockBrowse.mockResolvedValue(
    response({
      sources: [
        { id: "a", external_id: "a", adapter: "onedrive_drive", kind: "file", title: "a" },
      ] as ConnectedBrowseResponse["sources"],
      matched: 1,
      has_more: false,
      total: 1,
    }),
  );

  const service = createConnectedSourceListService(dispatch, {
    adapter: "onedrive_drive",
    connectionId: "conn",
  });
  const page = await service.fetchPage(query, sort);

  expect(page.total).toBe(1);
});

test("the second page asks the server for the second page", async () => {
  mockBrowse.mockResolvedValue(response({}));
  const service = createConnectedSourceListService(dispatch, {
    adapter: "onedrive_drive",
    connectionId: "conn",
  });

  await service.fetchPage({ ...query, page: 3 }, sort);

  expect(mockBrowse.mock.calls[0][1]).toMatchObject({ limit: 2, offset: 4 });
});

test("the measured sentence is handed to the screen, not swallowed", async () => {
  mockBrowse.mockResolvedValue(
    response({ summary: "Read 1,240 item(s) in 3.1s (400/s); 88 matched." }),
  );
  const reports: string[] = [];
  const service = createConnectedSourceListService(
    dispatch,
    { adapter: "onedrive_drive", connectionId: "conn" },
    (report) => reports.push(report.summary),
  );

  await service.fetchPage(query, sort);

  expect(reports[0]).toContain("400/s");
});

test("a tab total is declared unknown rather than zero", async () => {
  const service = createConnectedSourceListService(dispatch, {
    adapter: "onedrive_drive",
    connectionId: "conn",
  });
  const counts = await service.fetchCounts(query);

  expect(counts.byKind).toEqual({});
  expect(counts.narrowUnavailable?.mine).toContain("walked live");
});
