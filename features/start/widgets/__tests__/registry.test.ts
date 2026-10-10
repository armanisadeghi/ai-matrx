// The registry guard: every Start widget declares a Board section, its sizes, a describe line and a body.
jest.mock("../bodies/KpisWidget", () => ({ KpisWidget: () => null }));
jest.mock("../bodies/MetricWidget", () => ({ MetricWidget: () => null }));
jest.mock("../bodies/RecentWidget", () => ({ RecentWidget: () => null }));
jest.mock("../bodies/TasksWidget", () => ({ TasksWidget: () => null }));
jest.mock("../bodies/AgendaWidget", () => ({ AgendaWidget: () => null }));
jest.mock("../bodies/FavoritesWidget", () => ({ FavoritesWidget: () => null }));
jest.mock("../bodies/AgentsWidget", () => ({ AgentsWidget: () => null }));
jest.mock("../bodies/PageWidget", () => ({ PageWidget: () => null }));
jest.mock("../bodies/TableWidget", () => ({ TableWidget: () => null }));

import { BOARD_SECTIONS } from "@/features/board/items/types";
import { START_WIDGET_CATALOG, describeStartWidget } from "../catalog";
import { START_WIDGETS, START_WIDGETS_WITHOUT_BODY } from "../registry";
import { START_WIDGET_SIZES } from "../types";

const sectionKeys = BOARD_SECTIONS.map((s) => s.key as string);

describe("Start widget registry", () => {
  it("has a body for every catalog entry", () => {
    expect(START_WIDGETS_WITHOUT_BODY).toEqual([]);
    expect(START_WIDGETS.map((w) => w.key)).toEqual(START_WIDGET_CATALOG.map((s) => s.key));
  });

  it.each(START_WIDGET_CATALOG.map((s) => [s.key, s] as const))("%s declares section, sizes, describe, fields", (_k, spec) => {
    expect(sectionKeys).toContain(spec.section);
    expect(spec.sizes.length).toBeGreaterThan(0);
    for (const size of spec.sizes) expect(START_WIDGET_SIZES).toContain(size);
    const line = spec.describe(spec.defaultConfig);
    expect(typeof line).toBe("string");
    expect(line.length).toBeGreaterThan(0);
    expect(line.length).toBeLessThanOrEqual(60);
    for (const f of spec.fields) {
      if (f.options) expect(f.options.length).toBeGreaterThan(0);
    }
  });

  it("has unique keys, and the Slice 1 + 2 widgets", () => {
    const keys = START_WIDGET_CATALOG.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(["kpis", "metric", "recent", "tasks", "agenda", "favorites", "agents", "page", "table"]);
  });

  it("describes an unknown widget by name instead of dropping it", () => {
    expect(describeStartWidget({ type: "gone", config: {} })).toBe('Unavailable widget "gone"');
  });
});
