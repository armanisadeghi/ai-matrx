import {
  modelFiltersToColumns,
  modelQueryToTab,
  modelQueryExtras,
  parseModelQueryExtras,
} from "../canonicalTableQuery";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table";

const base: MatrxDataTableQueryState = {
  page: 2,
  pageSize: 50,
  search: "kling",
  anyOf: "",
  sort: { id: "input_price", direction: "desc" },
  columnFilters: {},
};

test("preserves every existing catalog filter, including false and zero bounds", () => {
  const filters = {
    provider: "Anthropic",
    input_capability: "image" as const,
    output_capability: "text" as const,
    is_deprecated: false,
    is_primary: true,
    is_premium: false,
    context_window_min: 0,
    context_window_max: 200000,
    max_tokens_min: 0,
    max_tokens_max: 8192,
  };
  expect(
    modelQueryToTab({ ...base, columnFilters: modelFiltersToColumns(filters) }),
  ).toEqual({
    q: "kling",
    page: 2,
    perPage: 50,
    sort: "input_price",
    dir: "desc",
    filters,
  });
});

test("clear really removes the active-only default and numeric filters", () => {
  expect(modelQueryToTab({ ...base, search: "", sort: null }).filters).toEqual(
    {},
  );
  const merged = {
    is_deprecated: false,
    provider: "Anthropic",
    ...modelQueryToTab(base).filters,
  };
  expect(modelFiltersToColumns(merged)).toEqual({});
  expect(modelFiltersToColumns({})).toEqual({});
  expect(modelFiltersToColumns({ is_deprecated: false })).toEqual({
    is_deprecated: { kind: "boolean", value: false },
  });
});

test("does not turn arbitrary text filters into legacy capability restrictions", () => {
  expect(
    modelQueryToTab({
      ...base,
      columnFilters: {
        input_capability: { kind: "text", value: "imag" },
      },
    }).filters,
  ).toEqual({});
});

test("extended query survives URL serialization without duplicating legacy filters", () => {
  const query: MatrxDataTableQueryState = {
    ...base,
    searchScope: "name",
    searchMatchMode: "whole_words",
    anyOf: "image",
    columnFilters: {
      is_deprecated: { kind: "boolean", value: false },
      name: { kind: "text", value: "kling", negated: true },
    },
    layeredFilters: [
      { id: "first", field: "name", operator: "contains", value: "kling" },
    ],
  };
  const extra = modelQueryExtras(query);
  expect(extra.columnFilters).toEqual({
    name: { kind: "text", value: "kling", negated: true },
  });
  expect(parseModelQueryExtras(JSON.stringify(extra))).toEqual(extra);
});
test("malformed URL state cannot inject invalid filters", () => {
  expect(parseModelQueryExtras("not json")).toBeUndefined();
  expect(
    parseModelQueryExtras(
      JSON.stringify({ anyOf: "", columnFilters: { name: { kind: "bad" } } }),
    ),
  ).toBeUndefined();
});
