import { getCoverageMatrix } from "@/features/marketing/data/service";

const SITE_ID = "d0aff5b6-0710-4848-8304-164db3c80ab7";
const COVERAGE = {
  totalPages: 4001,
  knownPageUrls: 4402,
  unconfirmedCandidates: 401,
  resourceUrls: 106,
  inSitemaps: 3772,
  crawled: 1073,
  neverCrawled: 2928,
  sitemapNotCrawled: 2709,
  crawledNoSitemap: 10,
  inGsc: 2596,
  gscNoSitemap: 229,
  sitemapNoGsc: 1405,
  byProvenance: { sitemap: 3707, crawl: 80, gsc: 214, manual: 0 },
};

const abortSignal = jest.fn(async () => ({ data: COVERAGE, error: null }));
const rpc = jest.fn(() => ({ abortSignal }));
const from = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/webDb", () => ({
  authenticatedWebDb: jest.fn(async () => ({ rpc, from })),
}));

describe("getCoverageMatrix", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads the complete matrix through one aggregate RPC", async () => {
    const signal = new AbortController().signal;

    await expect(getCoverageMatrix(SITE_ID, signal)).resolves.toEqual(COVERAGE);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("site_page_coverage", {
      p_site_id: SITE_ID,
    });
    expect(abortSignal).toHaveBeenCalledWith(signal);
    expect(from).not.toHaveBeenCalled();
  });
});
