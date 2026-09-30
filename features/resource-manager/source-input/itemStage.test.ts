import type { SourceFacts } from "@/features/sources/sourceRows";
import { HUB_STAGE_LABEL } from "@/features/knowledge/hub/hubStage";
import { kindItemStage, STAGE_READ_TOKENS } from "./itemStage";

/**
 * A3-F follow-up: rows inside a Use existing kind showed no state, so a saved
 * Source still being read looked the same as one ready to search. A row of a
 * kind that has a stage now carries the Knowledge hub's Stage word, from the
 * same facts read the hub uses; a kind without a stage carries nothing.
 */
const facts = (p: Partial<SourceFacts>): SourceFacts => ({
  chunkCount: 0,
  hasEntities: false,
  attachments: [],
  currentDocumentId: "x",
  currentChunkCount: 0,
  currentHasEntities: false,
  staleChunkCount: 0,
  indexing: false,
  headDocumentId: "x",
  entitiesState: null,
  ...p,
});

describe("kindItemStage", () => {
  it("says the hub's Stage word for a saved Source", () => {
    expect(kindItemStage("processed_document", facts({ currentChunkCount: 4 }), false)).toEqual({
      stage: "searchable",
      label: HUB_STAGE_LABEL.searchable,
    });
    expect(kindItemStage("processed_document", facts({ indexing: true }), false)?.label).toBe(
      HUB_STAGE_LABEL.indexing,
    );
    expect(kindItemStage("processed_document", facts({}), false)?.label).toBe(HUB_STAGE_LABEL.not_searchable);
    expect(kindItemStage("processed_document", undefined, true)?.label).toBe(HUB_STAGE_LABEL.failed);
  });

  it("shows nothing while the facts are unread, never a guess", () => {
    expect(kindItemStage("processed_document", undefined, false)).toBeNull();
  });

  it("shows nothing for a kind that has no stage", () => {
    expect(kindItemStage("note", facts({ currentChunkCount: 4 }), false)).toBeNull();
    expect(STAGE_READ_TOKENS.has("processed_document")).toBe(true);
    expect(STAGE_READ_TOKENS.has("note")).toBe(false);
  });
});
