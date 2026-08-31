import { categoryRowToDef } from "./converters";
import { compareCategoryOrder } from "./selectors";
import type { CategoryApiRow } from "./types";

const apiRow = (label: string | null): CategoryApiRow => ({
  id: label ?? "missing-name",
  label,
  description: null,
  icon_name: null,
  color: null,
  sort_order: 0,
  placement_type: "ai-action",
  parent_category_id: null,
  enabled_features: null,
  metadata: null,
  is_active: true,
  user_id: null,
  organization_id: null,
  project_id: null,
  task_id: null,
  created_at: "2026-08-31T00:00:00Z",
  updated_at: "2026-08-31T00:00:00Z",
});

describe("shortcut category missing-name boundary", () => {
  it("turns a legacy null label into an honest renderable name", () => {
    expect(categoryRowToDef(apiRow(null)).label).toBe("Unnamed category");
  });

  it("keeps shared category ordering total for stale pre-normalized state", () => {
    const missing = {
      ...categoryRowToDef(apiRow("temporary")),
      label: null,
      _dirty: false,
      _dirtyFields: {},
      _fieldHistory: {},
      _loadedFields: {},
      _loading: false,
      _error: null,
    };
    const named = {
      ...missing,
      id: "named",
      label: "Named",
    };

    expect(() =>
      [named, missing].sort(compareCategoryOrder),
    ).not.toThrow();
  });
});
