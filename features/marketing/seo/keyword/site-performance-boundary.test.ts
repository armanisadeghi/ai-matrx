import type { SiteKeywordPerformanceRow } from "@/features/marketing/seo/keyword-research/types";
import { listSitePerformanceForKeyword } from "./data";

const capturedProductionRow = {
  average_position: 29.776217408744486,
  clicks: 1,
  competition: "LOW",
  competition_index: 29,
  competitive_position: null,
  content_role: "money_page",
  cpc: 14.47,
  ctr: 0.00040112314480545525,
  demand_trajectory: "declining",
  first_date: "2026-08-15",
  impressions: 2493,
  keyword_id: "7adf3c8b-4b39-4760-8599-1f8df3e06e9e",
  last_date: "2026-09-09",
  market_fetched_at: "2026-07-23T05:13:45.555606+00:00",
  organization_id: "f9cb3e35-2a65-4f2a-8525-088d6551071c",
  priority_score: null,
  provider: "gsc",
  query: "hard drive shredding",
  search_volume: 1000,
  site_id: "38eff4c9-b021-451a-b995-7d9b3d17db5e",
  top_page_clicks: 1,
  top_page_id: "48f19e7a-536d-40ee-83e4-a35ab1e58f9b",
  top_page_impressions: 65,
  top_page_path: "/learn/top-5-hard-drive-destruction-methods-actually-work",
  top_page_url:
    "https://datadestruction.com/learn/top-5-hard-drive-destruction-methods-actually-work",
  workflow_status: "targeted",
} satisfies SiteKeywordPerformanceRow;

const mockRpcAbortSignal = jest.fn().mockResolvedValue({
  data: [capturedProductionRow],
  error: null,
});
const mockRpc = jest.fn(() => ({ abortSignal: mockRpcAbortSignal }));

const mockViewAbortSignal = jest.fn().mockResolvedValue({
  data: [capturedProductionRow],
  error: null,
});
const mockViewQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  abortSignal: mockViewAbortSignal,
};
const mockFrom = jest.fn(() => mockViewQuery);
const mockSchema = jest.fn(() => ({ rpc: mockRpc, from: mockFrom }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => mockSchema() },
}));
jest.mock("@/utils/supabase/webDb", () => ({
  requireAuthenticatedSupabaseSession: jest.fn().mockResolvedValue({
    user: { id: "87a6e699-3622-4869-8843-d0867456c0dd" },
  }),
}));

describe("Keyword Intelligence site-performance boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the keyword-scoped RPC instead of expanding the generic performance view", async () => {
    const rows = await listSitePerformanceForKeyword(
      "38eff4c9-b021-451a-b995-7d9b3d17db5e",
      "7adf3c8b-4b39-4760-8599-1f8df3e06e9e",
    );

    expect(mockRpc).toHaveBeenCalledWith(
      "site_keyword_performance_for_keyword",
      {
        p_site_id: "38eff4c9-b021-451a-b995-7d9b3d17db5e",
        p_keyword_id: "7adf3c8b-4b39-4760-8599-1f8df3e06e9e",
      },
    );
    expect(mockFrom).not.toHaveBeenCalled();
    expect(rows).toEqual([capturedProductionRow]);
  });
});
