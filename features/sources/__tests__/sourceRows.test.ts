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
  sourceFactsFromRow,
  sourceStage,
  SOURCE_STAGE_LABEL,
  STAGE_CELL_LABEL,
  stageCellState,
  type SourceFacts,
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
      row({
        id: "uploaded-file",
        source_kind: "cld_file",
        origin_client: null,
        capture_method: null,
      }),
      row({ id: "agent-fetch", origin_client: "agent" }),
    ];
    expect(
      applySavedFilter(rows, DEFAULT_SAVED_FILTER).map((r) => r.id),
    ).toEqual(["captured-saved", "uploaded-file"]);
    expect(applySavedFilter(rows, "all").map((r) => r.id)).toEqual(
      rows.map((r) => r.id),
    );
  });

  it("an uploaded file counts as saved; an unsaved extension capture does not", () => {
    expect(
      isSourceSaved(row({ source_kind: "cld_file", origin_client: "upload" })),
    ).toBe(true);
    expect(isSourceSaved(row({ origin_client: "extension" }))).toBe(false);
  });
});

describe("one row per Source", () => {
  it("drops a version superseded by a recapture and every derived copy", () => {
    const rows = [
      row({ id: "old" }),
      row({
        id: "new",
        derivation_kind: "recapture",
        parent_processed_id: "old",
      }),
      row({
        id: "cleaned-copy",
        derivation_kind: "manual_curation",
        parent_processed_id: "new",
      }),
      row({ id: "other" }),
    ];
    expect(currentVersionsOnly(rows).map((r) => r.id)).toEqual([
      "new",
      "other",
    ]);
  });
});

function facts(over: Partial<SourceFacts>): SourceFacts {
  return {
    chunkCount: 0,
    hasEntities: false,
    attachments: [],
    currentDocumentId: "id",
    currentChunkCount: 0,
    currentHasEntities: false,
    staleChunkCount: 0,
    indexing: false,
    headDocumentId: "id",
    ...over,
  };
}

describe("stage — read from the version people read", () => {
  it("an edit with no chunks is NOT searchable, even though the pre-edit capture has chunks", () => {
    // Live 2026-09-26: 40494b3e… — capture 2 chunks, current edit 0.
    const f = facts({
      chunkCount: 2,
      currentDocumentId: "edit",
      currentChunkCount: 0,
      staleChunkCount: 2,
    });
    expect(sourceStage(f)).toBe("stale");
    expect(SOURCE_STAGE_LABEL[sourceStage(f)]).toBe("Index stale — re-index");
  });

  it("says Indexing… while the current version has a job open", () => {
    expect(sourceStage(facts({ indexing: true, staleChunkCount: 2 }))).toBe(
      "indexing",
    );
    expect(SOURCE_STAGE_LABEL.indexing).toBe("Indexing…");
  });

  it("is searchable only when the current version has chunks", () => {
    expect(sourceStage(facts({ currentChunkCount: 3 }))).toBe("searchable");
    expect(
      sourceStage(facts({ currentChunkCount: 3, currentHasEntities: true })),
    ).toBe("entities");
    expect(SOURCE_STAGE_LABEL.searchable).toBe("Searchable");
  });

  it("a Source with no chunks anywhere is not yet searchable", () => {
    expect(sourceStage(facts({}))).toBe("not_searchable");
    expect(SOURCE_STAGE_LABEL.not_searchable).toBe("Not yet searchable");
  });
});

describe("reading the facts row", () => {
  it("maps the current-version columns", () => {
    expect(
      sourceFactsFromRow({
        processed_document_id: "h",
        chunk_count: 2,
        has_entities: false,
        attachments: [],
        current_document_id: "e",
        current_chunk_count: 0,
        current_has_entities: false,
        stale_chunk_count: 2,
        indexing: false,
        head_document_id: "h",
      }),
    ).toEqual(
      facts({
        chunkCount: 2,
        currentDocumentId: "e",
        staleChunkCount: 2,
        headDocumentId: "h",
      }),
    );
  });

  it("refuses a row without current-version facts rather than guessing a stage", () => {
    expect(
      sourceFactsFromRow({
        processed_document_id: "h",
        chunk_count: 2,
        has_entities: false,
        attachments: [],
      }),
    ).toBeNull();
  });
});

describe("a row's status cell", () => {
  const f = facts({ currentChunkCount: 2 });
  it("shows the stage whenever the row's facts were read — even if another batch failed", () => {
    expect(
      stageCellState(f, { loading: false, failed: false, retrying: false }),
    ).toBe("searchable");
  });
  it("says checking while the read is in flight", () => {
    expect(
      stageCellState(undefined, {
        loading: true,
        failed: false,
        retrying: false,
      }),
    ).toBe("checking");
  });
  it("offers a retry — never 'Unknown' — when this row's batch failed", () => {
    expect(
      stageCellState(undefined, {
        loading: false,
        failed: true,
        retrying: false,
      }),
    ).toBe("read_failed");
    expect(STAGE_CELL_LABEL.read_failed).toBe("Couldn't read status");
  });
  it("a settled row with no facts is a failed read too", () => {
    expect(
      stageCellState(undefined, {
        loading: false,
        failed: false,
        retrying: false,
      }),
    ).toBe("read_failed");
  });
  it("says retrying while its retry runs", () => {
    expect(
      stageCellState(undefined, {
        loading: false,
        failed: true,
        retrying: true,
      }),
    ).toBe("checking");
  });
});
