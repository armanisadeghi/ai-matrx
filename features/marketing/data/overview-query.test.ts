import { getSiteOverview } from "@/features/marketing/data/service";

const SITE_ID = "38eff4c9-b021-451a-b995-7d9b3d17db5e";
const PAGE_ROLLUP = {
  totalPages: 312,
  knownPageUrls: 478,
  unconfirmedCandidates: 166,
  resourceUrls: 166,
  inSitemaps: 290,
  crawled: 220,
  neverCrawled: 92,
  sitemapNotCrawled: 70,
  crawledNoSitemap: 4,
  inGsc: 291,
  gscNoSitemap: 8,
  sitemapNoGsc: 7,
  targetKeywordPages: 42,
  blockedPages: 11,
  serpIssues: 9,
  byProvenance: { sitemap: 250, crawl: 40, gsc: 20, manual: 2 },
};

interface MockResult {
  data: unknown;
  error: unknown;
  count?: number;
}

interface MockQueryBuilder {
  select: (...args: unknown[]) => MockQueryBuilder;
  eq: (...args: unknown[]) => MockQueryBuilder;
  in: (...args: unknown[]) => MockQueryBuilder;
  is: (...args: unknown[]) => MockQueryBuilder;
  order: (...args: unknown[]) => MockQueryBuilder;
  limit: (...args: unknown[]) => MockQueryBuilder;
  abortSignal: (...args: unknown[]) => MockQueryBuilder;
  maybeSingle: () => Promise<MockResult>;
  then: (
    resolve: (value: MockResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

function queryBuilder(result: MockResult) {
  let builder: MockQueryBuilder;
  builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    abortSignal: () => builder,
    maybeSingle: async () => result,
    then: (
      resolve: (value: MockResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

const relationResults: Record<string, MockResult> = {
  v_site_score: {
    data: { site_id: SITE_ID, site_score: 87, scored_pages: 300 },
    error: null,
  },
  finding: { data: null, error: null, count: 5 },
  snapshot: { data: null, error: null, count: 2257 },
  crawl_session: { data: null, error: null, count: 18 },
  sitemap: { data: null, error: null, count: 3 },
};

const from = jest.fn((relation: string) =>
  queryBuilder(relationResults[relation] ?? { data: null, error: null }),
);
let rpcResult: MockResult = { data: PAGE_ROLLUP, error: null };
const rpc = jest.fn(() => queryBuilder(rpcResult));

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/webDb", () => ({
  authenticatedWebDb: jest.fn(async () => ({ rpc, from })),
}));

describe("getSiteOverview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    rpcResult = { data: PAGE_ROLLUP, error: null };
  });

  it("loads every page count through one shared aggregate scan", async () => {
    await expect(
      getSiteOverview(SITE_ID, new AbortController().signal),
    ).resolves.toEqual({
      siteScore: 87,
      scoredPages: 300,
      canonicalPages: 312,
      unconfirmedCandidates: 166,
      resourceUrls: 166,
      openFindings: 5,
      snapshots: 2257,
      latestCrawl: null,
      targetKeywordPages: 42,
      pagesInGsc: 291,
      blockedPages: 11,
      serpIssues: 9,
      sitemaps: 3,
      crawlSessions: 18,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("site_page_coverage", {
      p_site_id: SITE_ID,
    });
    expect(from).not.toHaveBeenCalledWith("v_page_list");
  });

  it("preserves an empty PostgREST failure as the user-facing error cause", async () => {
    const upstream = { message: "", status: 500 };
    rpcResult = { data: null, error: upstream };

    await expect(getSiteOverview(SITE_ID)).rejects.toMatchObject({
      message: "We couldn't load this site's overview.",
      cause: upstream,
    });
  });
});
