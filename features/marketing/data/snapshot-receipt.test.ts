import {
  decodeSnapshotReceiptCursor,
  encodeSnapshotReceiptCursor,
  listSnapshotReceiptPage,
  quotePostgrestLogicLiteral,
  snapshotSourceIdentity,
} from "./service";
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";
import { authenticatedWebDb } from "@/utils/supabase/webDb";

jest.mock("@/utils/supabase/webDb", () => ({ authenticatedWebDb: jest.fn() }));

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

  it("keeps whole-word searches explicit instead of aliasing them to contains", async () => {
    await expect(
      listSnapshotReceiptPage({
        siteId: "site-1",
        pageId: "page-1",
        state,
        watermark: "2026-09-13T00:00:00Z",
      }),
    ).rejects.toThrow("whole-word search is not available");
    expect(snapshotSourceIdentity({ ...state, searchMatchMode: "contains" })).not.toEqual(
      snapshotSourceIdentity(state),
    );
  });

  it("checks the un-cursored exact total before applying a second-page keyset", async () => {
    const methods = ["select", "eq", "lte", "or", "ilike", "gte", "order", "limit"] as const;
    const countQuery = Object.fromEntries(methods.map((name) => [name, jest.fn()])) as Record<string, jest.Mock>;
    const rowQuery = Object.fromEntries(methods.map((name) => [name, jest.fn()])) as Record<string, jest.Mock>;
    for (const query of [countQuery, rowQuery]) {
      for (const method of methods) query[method].mockReturnValue(query);
    }
    countQuery.abortSignal = jest.fn().mockResolvedValue({ data: null, error: null, count: 3 });
    rowQuery.abortSignal = jest.fn().mockResolvedValue({
      data: [{ id: "snapshot-3", captured_at: "2026-09-12T00:00:00Z" }],
      error: null,
    });
    const db = { from: jest.fn().mockReturnValueOnce(countQuery).mockReturnValueOnce(rowQuery) };
    jest.mocked(authenticatedWebDb).mockResolvedValue(db as never);
    const cursor = {
      watermark: "2026-09-13T00:00:00Z",
      sortId: "captured_at" as const,
      direction: "desc" as const,
      value: "2026-09-12T00:00:00Z",
      id: "snapshot-2",
    };
    await expect(
      listSnapshotReceiptPage({
        siteId: "site-1", pageId: "page-1", state: { ...state, searchMatchMode: "contains" },
        watermark: cursor.watermark, cursor, expectedTotal: 3,
      }),
    ).resolves.toMatchObject({ total: 3, rows: [{ id: "snapshot-3" }] });
    expect(countQuery.or).not.toHaveBeenCalledWith(expect.stringContaining("snapshot-2"));
    expect(rowQuery.or).toHaveBeenCalledWith(expect.stringContaining("snapshot-2"));
  });

  it("refuses a later exact-count drift before merging its rows", async () => {
    const methods = ["select", "eq", "lte", "or", "ilike", "gte", "order", "limit"] as const;
    const countQuery = Object.fromEntries(methods.map((name) => [name, jest.fn()])) as Record<string, jest.Mock>;
    for (const method of methods) countQuery[method].mockReturnValue(countQuery);
    countQuery.abortSignal = jest.fn().mockResolvedValue({ data: null, error: null, count: 4 });
    jest.mocked(authenticatedWebDb).mockResolvedValue({ from: jest.fn().mockReturnValue(countQuery) } as never);
    await expect(
      listSnapshotReceiptPage({
        siteId: "site-1", pageId: "page-1", state: { ...state, searchMatchMode: "contains" },
        watermark: "2026-09-13T00:00:00Z",
        cursor: { watermark: "2026-09-13T00:00:00Z", sortId: "captured_at", direction: "desc", value: null, id: "snapshot-2" },
        expectedTotal: 3,
      }),
    ).rejects.toThrow("matching count changed");
  });
});
