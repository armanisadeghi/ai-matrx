import type { ColumnFilterMap } from "../column-filters";
import type { TableViewState } from "../table-view-url";
import {
  definitionFromViewState,
  definitionIsEmpty,
  describeDefinition,
  emptySavedViewDefinition,
  parseSavedViewDefinition,
  sameDefinition,
  viewStateFromDefinition,
} from "../saved-views/definition";

const DEFAULTS = { pageSize: 20 };

const viewState = (over: Partial<TableViewState> = {}): TableViewState => ({
  search: "",
  sortField: null,
  sortDirection: "asc",
  filters: {},
  page: 1,
  pageSize: 20,
  hidden: [],
  order: [],
  ...over,
});

const realFilter: ColumnFilterMap = {
  continent: { mode: "values", values: ["Asia"], includeBlank: false, negate: false },
};

describe("definitionFromViewState", () => {
  it("captures every axis of the view", () => {
    const d = definitionFromViewState(
      viewState({
        search: "bei",
        sortField: "capital",
        sortDirection: "desc",
        filters: realFilter,
        pageSize: 50,
        hidden: ["notes"],
        order: ["capital", "country"],
      }),
      DEFAULTS,
    );
    expect(d).toEqual({
      search: "bei",
      sortField: "capital",
      sortDirection: "desc",
      filters: realFilter,
      pageSize: 50,
      hidden: ["notes"],
      order: ["capital", "country"],
    });
  });

  // A half-typed filter left open is part of the moment, not part of the view.
  it("stores only ACTIVE filters", () => {
    const d = definitionFromViewState(
      viewState({
        filters: { ...realFilter, half: { mode: "text", text: "   " } },
      }),
      DEFAULTS,
    );
    expect(Object.keys(d.filters)).toEqual(["continent"]);
  });

  it("stores pageSize as null when it is the default", () => {
    expect(definitionFromViewState(viewState({ pageSize: 20 }), DEFAULTS).pageSize).toBeNull();
    expect(definitionFromViewState(viewState({ pageSize: 50 }), DEFAULTS).pageSize).toBe(50);
  });

  it("copies arrays rather than aliasing the live state", () => {
    const state = viewState({ hidden: ["a"] });
    const d = definitionFromViewState(state, DEFAULTS);
    d.hidden.push("b");
    expect(state.hidden).toEqual(["a"]);
  });
});

describe("viewStateFromDefinition", () => {
  // "Page 4" is where you happened to be, not what the view IS.
  it("always lands on page 1", () => {
    const d = { ...emptySavedViewDefinition(), search: "x" };
    expect(viewStateFromDefinition(d, DEFAULTS).page).toBe(1);
  });

  it("falls back to the default page size when the view stores none", () => {
    expect(viewStateFromDefinition(emptySavedViewDefinition(), DEFAULTS).pageSize).toBe(20);
  });

  it("round-trips a full view", () => {
    const state = viewState({
      search: "wash",
      sortField: "capital",
      sortDirection: "desc",
      filters: realFilter,
      pageSize: 50,
      hidden: ["notes"],
      order: ["capital"],
    });
    const back = viewStateFromDefinition(definitionFromViewState(state, DEFAULTS), DEFAULTS);
    expect(back).toEqual({ ...state, page: 1 });
  });
});

// 🚨 The definition is jsonb: it can be older than this code, hand-edited, or
// written by a version that knew a different shape. It must ALWAYS degrade.
describe("parseSavedViewDefinition never throws", () => {
  it("returns the empty view for junk", () => {
    for (const junk of [null, undefined, 42, "a string", [], true]) {
      expect(parseSavedViewDefinition(junk)).toEqual(emptySavedViewDefinition());
    }
  });

  it("keeps the fields it understands and drops only the bad ones", () => {
    const d = parseSavedViewDefinition({
      search: "keep me",
      sortField: 99, // wrong type
      sortDirection: "sideways", // not a direction
      filters: { bad: { mode: "nope" } }, // fails the guard
      pageSize: -5, // not positive
      hidden: ["a", "b"],
      order: ["a", 7], // not all strings
    });
    // ONE bad field must not cost the others.
    expect(d.search).toBe("keep me");
    expect(d.hidden).toEqual(["a", "b"]);
    expect(d.sortField).toBeNull();
    expect(d.sortDirection).toBe("asc");
    expect(d.filters).toEqual({});
    expect(d.pageSize).toBeNull();
    expect(d.order).toEqual([]);
  });

  it("accepts a definition it wrote itself", () => {
    const original = definitionFromViewState(
      viewState({ search: "x", filters: realFilter, hidden: ["n"] }),
      DEFAULTS,
    );
    expect(parseSavedViewDefinition(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});

describe("definitionIsEmpty / sameDefinition", () => {
  it("recognises the empty view", () => {
    expect(definitionIsEmpty(emptySavedViewDefinition())).toBe(true);
    expect(definitionIsEmpty({ ...emptySavedViewDefinition(), hidden: ["a"] })).toBe(false);
  });

  it("compares by value", () => {
    const a = definitionFromViewState(viewState({ search: "x" }), DEFAULTS);
    const b = definitionFromViewState(viewState({ search: "x" }), DEFAULTS);
    expect(sameDefinition(a, b)).toBe(true);
    expect(sameDefinition(a, { ...a, search: "y" })).toBe(false);
  });
});

describe("describeDefinition", () => {
  const label = (f: string) => ({ continent: "Continent", capital: "Capital" })[f] ?? f;

  it("uses HEADERS, never machine field names", () => {
    const d = definitionFromViewState(
      viewState({ filters: realFilter, sortField: "capital", sortDirection: "desc" }),
      DEFAULTS,
    );
    const text = describeDefinition(d, label);
    expect(text).toContain("Continent");
    expect(text).toContain("Capital");
    expect(text).not.toContain("continent");
  });

  it("counts multiple filters rather than listing them", () => {
    const d = definitionFromViewState(
      viewState({
        filters: {
          ...realFilter,
          capital: { mode: "text", text: "a" },
        },
      }),
      DEFAULTS,
    );
    expect(describeDefinition(d, label)).toContain("2 filters");
  });

  it("says something honest for a view that narrows nothing", () => {
    expect(describeDefinition(emptySavedViewDefinition(), label)).toBe("Everything, unsorted");
  });
});
