/**
 * Final verification (2026-09-26): the Sources page read EVERY row (6,258 for
 * admin, 7 requests, 10 s). It now reads a page of 100 at a time with the
 * Saved filter and the search applied by the server — so the server's filter
 * must mean exactly what `isSourceSaved` means — and one row per Source must
 * still hold when a recapture and its parent land on different pages.
 */
import {
  SOURCES_PAGE_SIZE,
  SAVED_FILTER_OR,
  SOURCE_LIST_COLUMNS,
  SOURCE_LIST_ORDER_COLUMN,
  sourceListedAt,
  appendSourcePage,
  isSourceSaved,
  searchFilterOr,
  type SourceListRow,
} from "@/features/sources/sourceRows";

function row(over: Partial<SourceListRow>): SourceListRow {
  return {
    id: "id", name: "n", source_kind: "scrape_parsed_page", source_id: "s", mime_type: null,
    origin_client: "web", capture_method: "http", canonical_identity: null,
    derivation_kind: "initial_extract", parent_processed_id: null, kept_at: null,
    total_pages: null, organization_id: "o", created_by: "u", visibility: "internal",
    created_at: "2026-09-26T00:00:00Z", updated_at: "2026-09-26T00:00:00Z", ...over,
  } as SourceListRow;
}

describe("paged Sources read", () => {
  it("reads 100 at a time", () => {
    expect(SOURCES_PAGE_SIZE).toBe(100);
  });

  it("the server's Saved filter covers every case isSourceSaved counts as saved", () => {
    // kept · an upload (no origin, or 'upload') · pasted text from before Save existed
    expect(SAVED_FILTER_OR).toContain("kept_at.not.is.null");
    expect(SAVED_FILTER_OR).toMatch(/source_kind\.in\.\(cld_file,legacy,code_file\)/);
    expect(SAVED_FILTER_OR).toMatch(/origin_client\.eq\.upload/);
    expect(SAVED_FILTER_OR).toMatch(/source_kind\.eq\.inline/);
    expect(isSourceSaved(row({ source_kind: "cld_file", origin_client: null }))).toBe(true);
  });

  it("a Source the platform materialized in the background is never 'an upload' (2026-09-26 files backfill)", () => {
    // 3,366 of one owner's files became cld_file Sources with no origin — 3,324 of them crawler
    // output — and the upload clause admitted every one into the default Saved view.
    const backfilled = row({ source_kind: "cld_file", origin_client: null, intelligence_policy: "materialize_only" });
    expect(isSourceSaved(backfilled)).toBe(false);
    expect(isSourceSaved(row({ source_kind: "inline", origin_client: null, intelligence_policy: "materialize_only" }))).toBe(false);
    // A Save still counts, whatever landed it.
    expect(isSourceSaved({ ...backfilled, kept_at: "2026-09-26T00:00:00Z" })).toBe(true);
    // The server's filter says the same: both no-origin clauses exclude the background policy.
    expect(SAVED_FILTER_OR.match(/intelligence_policy\.neq\.materialize_only/g)).toHaveLength(2);
  });

  it("the list orders and shows by when the Source entered the person's world", () => {
    expect(SOURCE_LIST_COLUMNS.split(",")).toContain("captured_at");
    expect(SOURCE_LIST_ORDER_COLUMN).toBe("captured_at");
    expect(sourceListedAt(row({ captured_at: "2026-03-02T23:48:06Z" }))).toBe("2026-03-02T23:48:06Z");
    expect(sourceListedAt(row({ captured_at: null }))).toBe("2026-09-26T00:00:00Z");
  });

  it("search matches the name or the address, and PostgREST-special characters cannot break the filter", () => {
    expect(searchFilterOr("diet")).toBe("name.ilike.%diet%,canonical_identity.ilike.%diet%");
    expect(searchFilterOr("a,b(c)")).toBe("name.ilike.%a b c%,canonical_identity.ilike.%a b c%");
    expect(searchFilterOr("   ")).toBeNull();
  });

  it("a parent arriving on a later page than its recapture is dropped", () => {
    const page1 = appendSourcePage([], [row({ id: "new", derivation_kind: "recapture", parent_processed_id: "old" })]);
    const page2 = appendSourcePage(page1, [row({ id: "old" }), row({ id: "other" })]);
    expect(page2.map((r) => r.id)).toEqual(["new", "other"]);
  });
});

import { sourcesListFilter } from "@/features/sources/sourceRows";

describe("sourcesListFilter", () => {
  it("nests every narrowing inside one or-value", () => {
    expect(sourcesListFilter({ saved: false, search: "" })).toBe(
      "and(or(parent_processed_id.is.null,derivation_kind.eq.recapture))",
    );
    const f = sourcesListFilter({ saved: true, search: "diet" });
    expect(f.startsWith("and(or(parent_processed_id.is.null")).toBe(true);
    expect(f).toContain(",or(kept_at.not.is.null,");
    expect(f).toContain(",or(name.ilike.%diet%,canonical_identity.ilike.%diet%))");
  });
});
