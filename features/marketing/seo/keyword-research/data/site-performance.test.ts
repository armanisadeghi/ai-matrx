import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  buildSiteKeywordPerformanceRpcArgs,
  listSiteKeywordPerformance,
} from "./site-performance";

const mockAbortSignal = jest.fn();
const mockRpc = jest.fn(() => ({ abortSignal: mockAbortSignal }));
const mockSchema = jest.fn((_schema: string) => ({ rpc: mockRpc }));

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: (schema: string) => mockSchema(schema) },
}));
jest.mock("@/utils/supabase/webDb", () => ({
  requireAuthenticatedSupabaseSession: jest.fn().mockResolvedValue(undefined),
}));

const STATE: MatrxDataTableQueryState = {
  page: 3,
  pageSize: 25,
  search: `  recycling,(pickup)%  `,
  anyOf: "",
  sort: { id: "priority_score", direction: "asc" },
  columnFilters: {
    query: { kind: "text", value: `  e-waste,(service)%  ` },
    top_page_path: { kind: "text", value: "", mode: "not_empty" },
    workflow_status: {
      kind: "select",
      value: "",
      values: ["candidate", "ranking"],
    },
    provider: { kind: "select", value: "gsc" },
    competition: { kind: "select", value: "HIGH" },
    clicks: { kind: "number", min: 2, max: 100 },
    ctr: { kind: "number", min: 1.5, max: 12 },
  },
};

describe("site keyword performance database boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("preserves every existing table filter while building one bounded RPC", () => {
    expect(buildSiteKeywordPerformanceRpcArgs("site-1", STATE)).toEqual({
      p_site_id: "site-1",
      p_filters: {
        query_mode: "contains",
        query_value: "e-waste  service",
        top_page_path_mode: "not_empty",
        workflow_status: ["candidate", "ranking"],
        provider: ["gsc"],
        competition: ["HIGH"],
        clicks_min: 2,
        clicks_max: 100,
        ctr_min: 0.015,
        ctr_max: 0.12,
      },
      p_search: "recycling  pickup",
      p_sort: "priority_score",
      p_sort_dir: "asc",
      p_limit: 25,
      p_offset: 50,
    });
  });

  it("falls back to the canonical click sort and omits empty contains filters", () => {
    expect(
      buildSiteKeywordPerformanceRpcArgs("site-2", {
        ...STATE,
        page: 1,
        search: "",
        sort: { id: "not_a_column", direction: "asc" },
        columnFilters: {
          query: { kind: "text", value: "   ", mode: "contains" },
        },
      }),
    ).toEqual({
      p_site_id: "site-2",
      p_filters: {},
      p_sort: "clicks",
      p_sort_dir: "asc",
      p_limit: 25,
      p_offset: 0,
    });
  });

  it("uses the parameterized RPC and strips its repeated exact-count field", async () => {
    mockAbortSignal.mockResolvedValue({
      data: [
        {
          site_id: "site-1",
          organization_id: "org-1",
          provider: "gsc",
          keyword_id: "keyword-1",
          query: "electronics recycling",
          first_date: "2026-07-15",
          last_date: "2026-08-11",
          clicks: 12,
          impressions: 300,
          ctr: 0.04,
          average_position: 5.2,
          top_page_id: "page-1",
          top_page_url: "https://example.com/recycling",
          top_page_path: "/recycling",
          top_page_clicks: 10,
          top_page_impressions: 250,
          search_volume: 900,
          cpc: 4.5,
          competition: "HIGH",
          competition_index: 80,
          demand_trajectory: "stable",
          market_fetched_at: "2026-08-01T00:00:00Z",
          workflow_status: "ranking",
          content_role: "target",
          competitive_position: "leader",
          priority_score: 92,
          total_count: 25900,
        },
      ],
      error: null,
    });

    const result = await listSiteKeywordPerformance("site-1", STATE);

    expect(mockSchema).toHaveBeenCalledWith("seo");
    expect(mockRpc).toHaveBeenCalledWith(
      "site_keyword_performance_page",
      buildSiteKeywordPerformanceRpcArgs("site-1", STATE),
    );
    expect(result.total).toBe(25900);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).not.toHaveProperty("total_count");
  });
});
