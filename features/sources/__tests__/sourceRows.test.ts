/**
 * The Sources page's default filter and its meaning of "Saved"
 * (SOURCE-CONVERGENCE §8.1): the page opens on Saved; All captures is one
 * toggle away; a capture nobody saved never reads as Saved; an uploaded file
 * (an upload IS a save) always does; one row per Source.
 */
import {
  DEFAULT_SAVED_FILTER,
  applySavedFilter,
  currentVersionsOnly,
  isSourceSaved,
  sourceStage,
  type SourceListRow,
} from "@/features/sources/sourceRows";

function row(over: Partial<SourceListRow>): SourceListRow {
  return {
    id: "id",
    name: "n",
    source_kind: "scrape_parsed_page",
    source_id: "s",
    mime_type: null,
    origin_client: "web",
    capture_method: "http",
    canonical_identity: null,
    derivation_kind: "initial_extract",
    parent_processed_id: null,
    kept_at: null,
    clean_content_completed_at: null,
    canonical_clean_id: null,
    total_pages: null,
    organization_id: "o",
    created_by: "u",
    visibility: "personal",
    created_at: "2026-09-26T00:00:00Z",
    updated_at: "2026-09-26T00:00:00Z",
    ...over,
  };
}

describe("the Sources page's saved filter", () => {
  it("defaults to Saved", () => {
    expect(DEFAULT_SAVED_FILTER).toBe("saved");
  });

  it("Saved hides unsaved captures; All captures shows everything", () => {
    const rows = [
      row({ id: "captured-unsaved" }),
      row({ id: "captured-saved", kept_at: "2026-09-26T01:00:00Z" }),
      row({ id: "uploaded-file", source_kind: "cld_file", origin_client: null, capture_method: null }),
      row({ id: "agent-fetch", origin_client: "agent" }),
    ];
    expect(applySavedFilter(rows, DEFAULT_SAVED_FILTER).map((r) => r.id)).toEqual(["captured-saved", "uploaded-file"]);
    expect(applySavedFilter(rows, "all").map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });

  it("an uploaded file counts as saved; an unsaved extension capture does not", () => {
    expect(isSourceSaved(row({ source_kind: "cld_file", origin_client: "upload" }))).toBe(true);
    expect(isSourceSaved(row({ origin_client: "extension" }))).toBe(false);
  });
});

describe("one row per Source", () => {
  it("drops a version superseded by a recapture and every derived copy", () => {
    const rows = [
      row({ id: "old" }),
      row({ id: "new", derivation_kind: "recapture", parent_processed_id: "old" }),
      row({ id: "cleaned-copy", derivation_kind: "manual_curation", parent_processed_id: "new" }),
      row({ id: "other" }),
    ];
    expect(currentVersionsOnly(rows).map((r) => r.id)).toEqual(["new", "other"]);
  });
});

describe("stage", () => {
  it("is the furthest stage reached", () => {
    expect(sourceStage(row({}), { chunkCount: 0, entityCount: 0 })).toBe("raw");
    expect(sourceStage(row({ clean_content_completed_at: "x" }), { chunkCount: 0, entityCount: 0 })).toBe("cleaned");
    expect(sourceStage(row({}), { chunkCount: 3, entityCount: 0 })).toBe("searchable");
    expect(sourceStage(row({}), { chunkCount: 3, entityCount: 2 })).toBe("entities");
  });
});
