import {
  MAX_COLUMN_WIDTH_PX,
  MIN_COLUMN_WIDTH_PX,
  clampColumnWidth,
  effectiveLayoutMode,
  effectiveRowDensity,
  parseColumnWidths,
  parseLayoutChoice,
  parseRowDensityChoice,
  parseLayoutMode,
  parseRowDensity,
  parseTableViewParams,
  resolveTableLayout,
  serializeColumnWidths,
  tableViewParamPatch,
} from "../table-view-url";
import {
  definitionFromViewState,
  describeDefinition,
  parseSavedViewDefinition,
  viewStateFromDefinition,
} from "../saved-views/definition";

/**
 * Layout is PART OF THE VIEW: the URL, a saved view and the "unsaved changes"
 * comparison all carry it. These pin the codec so a dragged width survives a
 * reload and a saved view from before layout existed still opens.
 */

const DEFAULTS = { pageSize: 20 };

describe("layout mode + density + freeze in the URL", () => {
  it("round-trips through the query string and omits platform defaults", () => {
    const state = parseTableViewParams(
      new URLSearchParams("lay=scroll&den=compact&frz=1&w=budget:220,notes:96"),
      DEFAULTS,
    );
    expect(state.layout).toBe("scroll");
    expect(state.density).toBe("compact");
    expect(state.freezeFirst).toBe(true);
    expect(state.widths).toEqual({ budget: 220, notes: 96 });
    const patch = tableViewParamPatch(state, DEFAULTS);
    expect(patch.lay).toBe("scroll");
    expect(patch.den).toBe("compact");
    expect(patch.frz).toBe("1");
    expect(patch.w).toBe("budget:220,notes:96");

    const plain = parseTableViewParams(new URLSearchParams(""), DEFAULTS);
    const plainPatch = tableViewParamPatch(plain, DEFAULTS);
    expect(plain.layout).toBe("default");
    expect(plain.density).toBe("default");
    // An EXPLICIT auto / normal is a real choice and rides the URL — it is how
    // someone picks Automatic inside an organization whose default is Scroll.
    const explicit = parseTableViewParams(new URLSearchParams("lay=auto&den=normal"), DEFAULTS);
    expect(explicit.layout).toBe("auto");
    expect(tableViewParamPatch(explicit, DEFAULTS).lay).toBe("auto");
    expect(tableViewParamPatch(explicit, DEFAULTS).den).toBe("normal");
    expect(effectiveLayoutMode("default", "scroll")).toBe("scroll");
    expect(effectiveLayoutMode("auto", "scroll")).toBe("auto");
    expect(effectiveRowDensity("default", "compact")).toBe("compact");
    expect(effectiveRowDensity("normal", "compact")).toBe("normal");
    expect(plainPatch.lay).toBeNull();
    expect(plainPatch.w).toBeNull();
    expect(plainPatch.den).toBeNull();
    expect(plainPatch.frz).toBeNull();
  });

  it("refuses nonsense rather than guessing", () => {
    expect(parseLayoutMode("sideways")).toBe("auto");
    expect(parseRowDensity("huge")).toBe("normal");
    expect(parseLayoutChoice("sideways")).toBe("default");
    expect(parseRowDensityChoice("huge")).toBe("default");
    expect(parseColumnWidths("a:4,b:99999,c:abc,noColon,:12,d:150")).toEqual({ d: 150 });
    expect(clampColumnWidth(1)).toBe(MIN_COLUMN_WIDTH_PX);
    expect(clampColumnWidth(10 ** 6)).toBe(MAX_COLUMN_WIDTH_PX);
  });

  it("serializes widths in a stable order so equal maps compare equal", () => {
    expect(serializeColumnWidths({ z: 100, a: 200 })).toBe("a:200,z:100");
    expect(serializeColumnWidths({})).toBeNull();
  });

  it("auto fits up to the cap and scrolls past it; an override always wins", () => {
    expect(resolveTableLayout("auto", 8, 8)).toBe("fit");
    expect(resolveTableLayout("auto", 9, 8)).toBe("scroll");
    expect(resolveTableLayout("fit", 30, 8)).toBe("fit");
    expect(resolveTableLayout("scroll", 2, 8)).toBe("scroll");
  });
});

describe("layout in a saved view", () => {
  it("is stored, described, and a pre-layout definition still opens with defaults", () => {
    const state = parseTableViewParams(
      new URLSearchParams("lay=fit&den=tall&frz=1&w=budget:220"),
      DEFAULTS,
    );
    const def = definitionFromViewState(state, DEFAULTS);
    expect(def.layout).toBe("fit");
    expect(def.widths).toEqual({ budget: 220 });
    expect(def.density).toBe("tall");
    expect(def.freezeFirst).toBe(true);
    expect(describeDefinition(def, (n) => n)).toContain("fit to width");
    expect(describeDefinition(def, (n) => n)).toContain("first column frozen");

    const reopened = viewStateFromDefinition(parseSavedViewDefinition(JSON.parse(JSON.stringify(def))), DEFAULTS);
    expect(reopened.layout).toBe("fit");
    expect(reopened.widths).toEqual({ budget: 220 });

    // A definition saved before layout existed.
    const legacy = parseSavedViewDefinition({ search: "", hidden: ["x"], order: [] });
    expect(legacy.layout).toBe("default");
    expect(legacy.widths).toEqual({});
    expect(legacy.density).toBe("default");
    expect(legacy.freezeFirst).toBe(false);
    expect(legacy.wrap).toBe(false);
    const wrapped = parseTableViewParams(new URLSearchParams("wrap=1"), DEFAULTS);
    expect(wrapped.wrap).toBe(true);
    expect(tableViewParamPatch(wrapped, DEFAULTS).wrap).toBe("1");
    expect(describeDefinition(definitionFromViewState(wrapped, DEFAULTS), (n) => n)).toContain("text wrapped");
    // ...and a stored width outside the clamp is clamped, never trusted.
    expect(parseSavedViewDefinition({ widths: { a: 5 } }).widths).toEqual({ a: MIN_COLUMN_WIDTH_PX });
  });
});
