import {
  decodeSnapshotReceiptCursor,
  encodeSnapshotReceiptCursor,
  quotePostgrestLogicLiteral,
  snapshotSourceIdentity,
} from "./service";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";

const state: MatrxDataTableQueryState = {
  page: 3,
  pageSize: 25,
  search: "  retained  ",
  searchMatchMode: "whole_words",
  anyOf: "ignored",
  layeredFilters: [],
  columnFilters: {
    final_url: { kind: "text", value: "example" },
    unhandled: { kind: "text", value: "must not become source scope" },
  },
  sort: { id: "captured_at", direction: "desc" },
};

describe("snapshot receipt cursor", () => {
  it("quotes PostgREST logic literals without changing delimiters or null semantics", () => {
    expect(quotePostgrestLogicLiteral('a,b(c)%\\"d')).toBe('"a,b(c)%\\\\\\"d"');
    expect(quotePostgrestLogicLiteral(42)).toBe("42");
  });

  it("round-trips a typed null cursor and rejects malformed cursor input", () => {
    const encoded = encodeSnapshotReceiptCursor({
      watermark: "2026-09-13T00:00:00Z",
      sortId: "final_url",
      direction: "asc",
      value: null,
      id: "snapshot-1",
    });
    expect(decodeSnapshotReceiptCursor(encoded)).toEqual({
      watermark: "2026-09-13T00:00:00Z",
      sortId: "final_url",
      direction: "asc",
      value: null,
      id: "snapshot-1",
    });
    expect(() => decodeSnapshotReceiptCursor("not-base64")).toThrow("Refresh required");
  });

  it("uses source identity without offset page or unsupported query controls", () => {
    const first = snapshotSourceIdentity(state);
    const second = snapshotSourceIdentity({ ...state, page: 1, anyOf: "another", layeredFilters: [] });
    expect(second).toEqual(first);
  });
});
