/**
 * THE ORIGIN-UNTOUCHED TEST. The whole point of copy-subset is that shaping
 * a copy never changes the surface the user came from. The origin here is a
 * deep-frozen row array plus a separate query-state object; the model
 * filters, sorts, selects, and serializes through the real filter engine,
 * and afterwards the origin is byte-for-byte what it was — same references,
 * same order, same values.
 */

import {
  computeCopySubset,
  copySubsetText,
  initialCopySubsetState,
} from "@/components/agent-copy/copy-subset/model";
import {
  copySubsetSessionCount,
  getCopySubsetSession,
  registerCopySubsetSession,
  releaseCopySubsetSession,
} from "@/components/agent-copy/copy-subset/session";
import type { CopySubsetColumn } from "@/components/agent-copy/copy-subset/types";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";

type Model = {
  id: string;
  provider: string;
  status: "matched" | "missing_local" | "extra_local";
  released: string | null;
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) {
      deepFreeze(v);
    }
  }
  return value;
}

const originRows: Model[] = deepFreeze([
  { id: "a", provider: "openai", status: "matched", released: "2026-01-01" },
  { id: "b", provider: "openai", status: "missing_local", released: "2026-03-01" },
  { id: "c", provider: "openai", status: "missing_local", released: "2026-02-01" },
  { id: "d", provider: "anthropic", status: "missing_local", released: "2026-04-01" },
  { id: "e", provider: "openai", status: "extra_local", released: null },
]);

const originQuery: MatrxDataTableQueryState = deepFreeze({
  page: 3,
  pageSize: 25,
  search: "openai",
  anyOf: "",
  layeredFilters: [],
  columnFilters: { status: { kind: "select", value: "matched" } },
  sort: { id: "id", direction: "asc" },
});

const columns: CopySubsetColumn<Model>[] = [
  { id: "id", header: "Model", accessorKey: "id" },
  { id: "provider", header: "Provider", accessorKey: "provider" },
  { id: "status", header: "Status", accessorKey: "status", filter: "select" },
  { id: "released", header: "Released", accessorKey: "released" },
];

describe("copy-subset model — the origin is untouched", () => {
  afterEach(() => {
    // Every test releases what it registered; a leak here is a leak in prod.
    expect(copySubsetSessionCount()).toBe(0);
  });

  it("filters, sorts, selects, and copies without touching the origin rows or query", () => {
    const originSnapshot = JSON.stringify(originRows);
    const originRefs = [...originRows];
    const querySnapshot = JSON.stringify(originQuery);

    const session = registerCopySubsetSession<Model>({
      label: "Provider models",
      location: "test",
      kind: "models",
      rows: originRows,
      columns,
      getRowId: (row) => row.id,
    });
    expect(session.rows).not.toBe(originRows);

    const state = initialCopySubsetState(session);
    const shaped = {
      ...state,
      query: {
        ...state.query,
        columnFilters: { status: { kind: "select" as const, value: "missing_local" } },
        sort: { id: "released", direction: "desc" as const },
      },
      hiddenColumnIds: ["provider"],
      format: "csv" as const,
    };

    const computed = computeCopySubset(session, shaped);
    // Hidden columns leave the query, exactly as in MatrxDataTable: the
    // provider column is hidden, so its values neither show nor filter.
    expect(computed.matched.map((r) => r.id)).toEqual(["d", "b", "c"]);
    expect(computed.columns.map((c) => c.id)).toEqual(["id", "status", "released"]);

    const { text, computation } = copySubsetText(session, {
      ...shaped,
      selectedRowIds: ["c", "zzz-not-a-match"],
    });
    expect(computation.rows.map((r) => r.id)).toEqual(["c"]);
    expect(computation.meta).toMatchObject({
      total_rows: 5,
      matched_rows: 3,
      copied_rows: 1,
      total_columns: 4,
      copied_columns: 3,
      search: undefined,
      active_filters: 1,
      sort: "released:desc",
      selection: true,
    });
    expect(text).toBe("Model,Status,Released\nc,missing_local,2026-02-01");

    // Origin: same references, same order, same bytes; query object untouched.
    expect(originRows.map((r) => r)).toEqual(originRefs);
    originRows.forEach((row, index) => expect(row).toBe(originRefs[index]));
    expect(JSON.stringify(originRows)).toBe(originSnapshot);
    expect(JSON.stringify(originQuery)).toBe(querySnapshot);
    expect(originQuery.sort).toEqual({ id: "id", direction: "asc" });

    releaseCopySubsetSession(session.id);
    expect(getCopySubsetSession(session.id)).toBeNull();
  });

  it("keys rows by snapshot index when the caller has no row id", () => {
    const session = registerCopySubsetSession({
      label: "Rows",
      location: "test",
      kind: "rows",
      rows: [{ v: 1 }, { v: 2 }, { v: 3 }],
    });
    expect(session.columns.map((c) => c.id)).toEqual(["v"]);
    const state = initialCopySubsetState(session);
    const { computation } = copySubsetText(session, {
      ...state,
      selectedRowIds: ["row-1"],
      format: "json",
    });
    expect(computation.rows).toEqual([{ v: 2 }]);
    releaseCopySubsetSession(session.id);
  });

  it("starts hidden columns hidden and pre-selects the caller's ids", () => {
    const session = registerCopySubsetSession<Model>({
      label: "Provider models",
      location: "test",
      kind: "models",
      rows: originRows,
      columns: [...columns, { id: "x", header: "X", accessorFn: () => "x", hidden: true }],
      getRowId: (row) => row.id,
      initialSelectedIds: ["a", "e"],
      defaultFormat: "markdown",
    });
    const state = initialCopySubsetState(session);
    expect(state.hiddenColumnIds).toEqual(["x"]);
    expect(state.format).toBe("markdown");
    const { computation } = copySubsetText(session, state);
    expect(computation.rows.map((r) => r.id)).toEqual(["a", "e"]);
    expect(computation.columns.some((c) => c.id === "x")).toBe(false);
    releaseCopySubsetSession(session.id);
  });
});
