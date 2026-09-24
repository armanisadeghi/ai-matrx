import { MANDATE_COLUMNS } from "../columns";
import { mandateListConfig } from "../listConfig";

// The Job and Fulfilled by cells used to stack several values each (name +
// key; agent + who decided + version drift), so none of them could be sorted
// or filtered on its own. Each value is now its own column, and every one of
// these ids is in mnd_list_scoped's sort and filter vocabulary.
describe("/mandates — one value per column", () => {
  const byId = new Map(MANDATE_COLUMNS.map((c) => [c.id, c]));

  it.each(["label", "mandate_key", "feature", "fulfilled_by", "layer", "version"])(
    "%s is its own visible, sortable, filterable column",
    (id) => {
      const spec = byId.get(id);
      expect(spec).toBeDefined();
      expect(spec?.defaultHidden).toBeFalsy();
      expect(spec?.column.sortable).not.toBe(false);
      expect(spec?.column.filter).toBeTruthy();
    },
  );

  it("bumps prefsVersion past the split so existing users see the new columns", () => {
    expect(mandateListConfig.prefsVersion).toBeGreaterThanOrEqual(3);
  });
});
