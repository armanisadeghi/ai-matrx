import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  analysisBooleanFilter,
  analysisNumberFilter,
  analysisSelectFilter,
  analysisTableRange,
  analysisTextFilter,
  cleanAnalysisSearch,
  isUuidFilter,
  priorityRowKey,
} from "@/features/marketing/data/analysis-query";

const STATE: MatrxDataTableQueryState = {
  page: 3,
  pageSize: 25,
  search: "",
  anyOf: "",
  sort: { id: "priority", direction: "desc" },
  columnFilters: {
    category: { kind: "text", value: "  technical,(seo)  " },
    severity: { kind: "select", value: "high" },
    score: { kind: "number", min: 20, max: 80 },
    suppressed: { kind: "boolean", value: false },
  },
};

describe("marketing analysis query helpers", () => {
  it("builds inclusive Supabase ranges from one-based table pages", () => {
    expect(analysisTableRange(STATE)).toEqual({ from: 50, to: 74 });
  });

  it("sanitizes OR-search syntax and reads typed column filters", () => {
    expect(cleanAnalysisSearch(` title,(broken)\\" `)).toBe("title broken");
    expect(analysisTextFilter(STATE, "category")).toBe("technical seo");
    expect(analysisSelectFilter(STATE, "severity")).toBe("high");
    expect(analysisNumberFilter(STATE, "score")).toEqual({ min: 20, max: 80 });
    expect(analysisBooleanFilter(STATE, "suppressed")).toBe(false);
  });

  it("accepts only canonical UUID filters", () => {
    expect(isUuidFilter("0f5f8ea4-9a55-4d33-8f66-c1c118917a4f")).toBe(true);
    expect(isUuidFilter("not-a-uuid")).toBe(false);
  });

  it("keeps duplicate-looking priority projections unique per result page", () => {
    const row = {
      site_id: "site-a",
      page_id: null,
      item_id: "item-a",
      item_key: "technical.title",
    };
    expect(priorityRowKey(row, 0)).not.toBe(priorityRowKey(row, 1));
  });
});
