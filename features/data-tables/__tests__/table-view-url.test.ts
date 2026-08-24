import type { ColumnFilterMap } from "../column-filters";
import {
  activeFiltersOnly,
  isColumnFilterMap,
  parseSortParam,
  parseTableViewParams,
  sameTableView,
  tableViewParamPatch,
  type TableViewState,
} from "../table-view-url";

const DEFAULTS = { pageSize: 20 };
const params = (q: string) => new URLSearchParams(q);

const baseState = (over: Partial<TableViewState> = {}): TableViewState => ({
  search: "",
  sortField: null,
  sortDirection: "asc",
  filters: {},
  page: 1,
  pageSize: 20,
  ...over,
});

describe("parseSortParam", () => {
  it("splits field and direction", () => {
    expect(parseSortParam("capital.desc")).toEqual({
      field: "capital",
      direction: "desc",
    });
  });

  it("splits on the LAST dot so a dotted field name survives", () => {
    expect(parseSortParam("address.city.asc")).toEqual({
      field: "address.city",
      direction: "asc",
    });
  });

  it("defaults to ascending when the direction is missing or junk", () => {
    expect(parseSortParam("capital")).toEqual({ field: "capital", direction: "asc" });
    expect(parseSortParam("capital.sideways")).toEqual({
      field: "capital.sideways",
      direction: "asc",
    });
  });

  it("returns no sort for an empty param", () => {
    expect(parseSortParam(null)).toEqual({ field: null, direction: "asc" });
  });
});

describe("parseTableViewParams", () => {
  it("reads a full view back out of the query string", () => {
    const filters: ColumnFilterMap = {
      continent: { mode: "values", values: ["Asia"], includeBlank: false, negate: false },
    };
    const state = parseTableViewParams(
      params(
        `q=beij&sort=capital.desc&p=3&ps=50&f=${encodeURIComponent(JSON.stringify(filters))}`,
      ),
      DEFAULTS,
    );
    expect(state).toEqual({
      search: "beij",
      sortField: "capital",
      sortDirection: "desc",
      filters,
      page: 3,
      pageSize: 50,
    });
  });

  it("falls back to defaults on an empty query string", () => {
    expect(parseTableViewParams(params(""), DEFAULTS)).toEqual(baseState());
  });

  // A URL is user-editable and arrives from strangers. It must degrade, never throw.
  it("degrades a mangled filter param to no filters", () => {
    expect(parseTableViewParams(params("f=not-json"), DEFAULTS).filters).toEqual({});
    expect(parseTableViewParams(params("f=%5B1%2C2%5D"), DEFAULTS).filters).toEqual({});
    expect(
      parseTableViewParams(params('f=%7B"a"%3A%7B"mode"%3A"nope"%7D%7D'), DEFAULTS).filters,
    ).toEqual({});
  });

  it("ignores nonsense page numbers rather than rendering page zero", () => {
    expect(parseTableViewParams(params("p=0"), DEFAULTS).page).toBe(1);
    expect(parseTableViewParams(params("p=-4"), DEFAULTS).page).toBe(1);
    expect(parseTableViewParams(params("p=abc"), DEFAULTS).page).toBe(1);
    expect(parseTableViewParams(params("ps=0"), DEFAULTS).pageSize).toBe(20);
  });
});

describe("tableViewParamPatch", () => {
  // A pristine grid must have a clean URL: "no sort param" and "sorted the
  // default way" have to stay the same thing.
  it("omits every default", () => {
    expect(tableViewParamPatch(baseState(), DEFAULTS)).toEqual({
      q: null,
      sort: null,
      f: null,
      p: null,
      ps: null,
    });
  });

  it("writes only what differs from default", () => {
    const patch = tableViewParamPatch(
      baseState({ search: "x", sortField: "capital", sortDirection: "desc", page: 2 }),
      DEFAULTS,
    );
    expect(patch.q).toBe("x");
    expect(patch.sort).toBe("capital.desc");
    expect(patch.page).toBeUndefined();
    expect(patch.p).toBe("2");
    expect(patch.ps).toBeNull();
  });

  it("drops filters that are not narrowing anything", () => {
    const filters: ColumnFilterMap = {
      empty: { mode: "text", text: "   " },
      unticked: { mode: "values", values: [], includeBlank: false, negate: false },
      openRange: { mode: "range", min: "", max: "" },
      real: { mode: "text", text: "asia" },
    };
    const patch = tableViewParamPatch(baseState({ filters }), DEFAULTS);
    expect(JSON.parse(patch.f as string)).toEqual({ real: { mode: "text", text: "asia" } });
  });

  it("omits `f` entirely when no filter is active", () => {
    const filters: ColumnFilterMap = { a: { mode: "text", text: "" } };
    expect(tableViewParamPatch(baseState({ filters }), DEFAULTS).f).toBeNull();
  });

  it("round-trips through parse", () => {
    const state = baseState({
      search: "wash",
      sortField: "area.sq",
      sortDirection: "desc",
      page: 4,
      pageSize: 50,
      filters: {
        continent: {
          mode: "values",
          values: ["North America", "Asia"],
          includeBlank: true,
          negate: true,
        },
      },
    });
    const patch = tableViewParamPatch(state, DEFAULTS);
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(patch)) if (v !== null) search.set(k, v);
    expect(parseTableViewParams(search, DEFAULTS)).toEqual(state);
  });
});

describe("isColumnFilterMap", () => {
  it("accepts every filter mode", () => {
    expect(
      isColumnFilterMap({
        a: { mode: "text", text: "x" },
        b: { mode: "values", values: ["x"], includeBlank: false, negate: false },
        c: { mode: "range", min: "1", max: "9" },
      }),
    ).toBe(true);
  });

  it("rejects wrong shapes", () => {
    expect(isColumnFilterMap(null)).toBe(false);
    expect(isColumnFilterMap([])).toBe(false);
    expect(isColumnFilterMap({ a: { mode: "text" } })).toBe(false);
    expect(isColumnFilterMap({ a: { mode: "values", values: [1] } })).toBe(false);
    expect(isColumnFilterMap({ a: { mode: "range", min: 1, max: 9 } })).toBe(false);
  });
});

describe("sameTableView", () => {
  it("ignores inactive filters when comparing", () => {
    const a = baseState({ filters: { x: { mode: "text", text: "" } } });
    const b = baseState({ filters: {} });
    expect(sameTableView(a, b)).toBe(true);
  });

  it("notices a real difference", () => {
    expect(sameTableView(baseState(), baseState({ page: 2 }))).toBe(false);
    expect(sameTableView(baseState(), baseState({ sortField: "a" }))).toBe(false);
  });
});

describe("activeFiltersOnly", () => {
  it("keeps a blank-only values filter, which IS a real filter", () => {
    const filters: ColumnFilterMap = {
      x: { mode: "values", values: [], includeBlank: true, negate: false },
    };
    expect(Object.keys(activeFiltersOnly(filters))).toEqual(["x"]);
  });
});
