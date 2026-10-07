/**
 * Review 8041caec (2026-10-07): rows moved in from Notion must read back in source order.
 * One recordWriteMany gives every row the same created_at, so the store's read order
 * (`created_at desc, id`) is decided by the id — the ids must ascend in source order.
 */
import { sourceOrderIds, tableSlug } from "../../data/designed-database";

describe("sourceOrderIds", () => {
  it("hands out ids that ascend in the order the rows were given", () => {
    for (let run = 0; run < 50; run++) {
      const ids = sourceOrderIds(7);
      expect(ids).toHaveLength(7);
      expect([...ids].sort()).toEqual(ids);
      expect(new Set(ids).size).toBe(7);
    }
  });
});

describe("tableSlug", () => {
  it("starts with a letter even when the name starts with a digit", () => {
    expect(tableSlug("2026 Reading List", 0)).toBe("t_2026_reading_list_0");
    expect(tableSlug("Vendors", 0)).toBe("vendors_0");
  });
});
