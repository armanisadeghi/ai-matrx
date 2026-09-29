import {
  WORK_ITEM_PAGE_SIZES,
  workItemSearchClause,
} from "../service/batchAdminService";

describe("WorkItemsPanel source pager contract", () => {
  it("offers only source-supported page sizes", () => {
    expect(WORK_ITEM_PAGE_SIZES).toEqual([10, 25, 50, 100]);
  });

  it("searches Purpose because it is visible in every work-item row", () => {
    expect(workItemSearchClause("schema-translation-s13-proof")).toContain(
      "purpose.ilike.%schema-translation-s13-proof%",
    );
  });
});
