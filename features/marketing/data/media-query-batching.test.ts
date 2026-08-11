import {
  fetchSiteMediaRows,
  fetchSiteVideoResourceRows,
} from "@/features/marketing/data/service";

const SITE_ID = "d0aff5b6-0710-4848-8304-164db3c80ab7";
const SNAPSHOT_COUNT = 1073;

interface CurrentPageFixture {
  id: string;
  url: string;
  path: string;
  latest_snapshot_id: string;
}

const mockPages: CurrentPageFixture[] = Array.from(
  { length: SNAPSHOT_COUNT },
  (_, index) => {
    const suffix = String(index).padStart(12, "0");
    return {
      id: `10000000-0000-4000-8000-${suffix}`,
      url: `https://example.com/page-${index}`,
      path: `/page-${index}`,
      latest_snapshot_id: `20000000-0000-4000-8000-${suffix}`,
    };
  },
);

const mockSnapshotBatchSizes: number[] = [];

interface MockQueryState {
  from: number;
  ids: string[];
  select: string;
}

function mockQuery(relation: string) {
  const state: MockQueryState = { from: 0, ids: [], select: "" };
  const query = {
    select(columns: string) {
      state.select = columns;
      return query;
    },
    eq() {
      return query;
    },
    is() {
      return query;
    },
    not() {
      return query;
    },
    order() {
      return query;
    },
    range(from: number) {
      state.from = from;
      return query;
    },
    in(_column: string, ids: string[]) {
      state.ids = ids;
      mockSnapshotBatchSizes.push(ids.length);
      return query;
    },
    abortSignal() {
      return query;
    },
    returns() {
      return query;
    },
    then(
      onFulfilled: (value: { data: unknown[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      const data =
        relation === "page"
          ? mockPages.slice(state.from, state.from + 1000)
          : state.ids.map((id) =>
              state.select.includes("resources:extracted->resources")
                ? {
                    id,
                    captured_at: "2026-08-11T00:00:00.000Z",
                    resources: {
                      count: 1,
                      items: [
                        {
                          kind: "video",
                          url: `https://example.com/video/${id}.mp4`,
                        },
                      ],
                    },
                  }
                : {
                    id,
                    captured_at: "2026-08-11T00:00:00.000Z",
                    images: { count: 0, missing_alt: 0, items: [] },
                    head_tags: {},
                  },
            );
      return Promise.resolve({ data, error: null }).then(
        onFulfilled,
        onRejected,
      );
    },
  };
  return query;
}

const mockWebDb = {
  from(relation: string) {
    return mockQuery(relation);
  },
};

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/webDb", () => ({
  authenticatedWebDb: jest.fn(async () => mockWebDb),
}));

describe("site media PostgREST request batching", () => {
  beforeEach(() => {
    mockSnapshotBatchSizes.length = 0;
  });

  it.each([
    ["images", fetchSiteMediaRows],
    ["videos", fetchSiteVideoResourceRows],
  ] as const)(
    "keeps every %s snapshot-id filter below the gateway-safe bound",
    async (_kind, fetchRows) => {
      const rows = await fetchRows(SITE_ID);

      expect(rows).toHaveLength(SNAPSHOT_COUNT);
      expect(mockSnapshotBatchSizes).toEqual([
        150,
        150,
        150,
        150,
        150,
        150,
        150,
        23,
      ]);
      expect(Math.max(...mockSnapshotBatchSizes)).toBeLessThanOrEqual(150);
    },
  );
});
