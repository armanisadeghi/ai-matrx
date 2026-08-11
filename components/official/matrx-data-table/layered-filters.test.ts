import { filterAndSortRows } from "./filter-engine";
import {
  columnFiltersToLayeredRules,
  decodeLayeredFilterRules,
  encodeLayeredFilterRules,
  layeredFilterMatchesValue,
  type LayeredFilterRule,
} from "./layered-filters";
import type { MatrxColumnDef } from "./types";

const RULES: LayeredFilterRule[] = [
  {
    id: "include-itad",
    field: "query",
    operator: "contains",
    value: "ITAD",
  },
  {
    id: "exclude-what",
    field: "query",
    operator: "not_word",
    value: "what",
  },
];

describe("MatrxDataTable layered filters", () => {
  it("round-trips ordered rules through URL state", () => {
    expect(decodeLayeredFilterRules(encodeLayeredFilterRules(RULES))).toEqual(
      RULES,
    );
  });

  it("rejects malformed or oversized URL payloads", () => {
    expect(decodeLayeredFilterRules("not-json")).toEqual([]);
    expect(
      decodeLayeredFilterRules(
        JSON.stringify([{ ...RULES[0], operator: "run_sql" }]),
      ),
    ).toEqual([]);
    expect(
      decodeLayeredFilterRules(
        JSON.stringify(
          Array.from({ length: 21 }, (_, index) => ({
            ...RULES[0],
            id: String(index),
          })),
        ),
      ),
    ).toEqual([]);
  });

  it("matches whole-word exclusions without excluding partial words", () => {
    expect(layeredFilterMatchesValue("what is ITAD", RULES[1])).toBe(false);
    expect(layeredFilterMatchesValue("ITAD somewhat nearby", RULES[1])).toBe(
      true,
    );
  });

  it("AND-combines layers in the local table engine", () => {
    const columns: MatrxColumnDef<{ query: string }>[] = [
      { accessorKey: "query", header: "Keyword" },
    ];
    const rows = [
      { query: "ITAD services" },
      { query: "what is ITAD" },
      { query: "electronics recycling" },
    ];

    expect(
      filterAndSortRows(rows, columns, {}, null, "", undefined, RULES),
    ).toEqual([{ query: "ITAD services" }]);
  });

  it("converts ordinary numeric ranges into server-ready layers", () => {
    expect(
      columnFiltersToLayeredRules(
        {
          clicks: { kind: "number", min: 10, max: 100 },
          impressions: { kind: "number", min: 50 },
        },
        ["clicks", "impressions"],
      ),
    ).toEqual([
      {
        id: "column-clicks",
        field: "clicks",
        operator: "between",
        value: "10",
        valueTo: "100",
      },
      {
        id: "column-impressions",
        field: "impressions",
        operator: "greater_or_equal",
        value: "50",
      },
    ]);
  });
});
