// TASK-003 MUST-FIX 2 guard: the audit editor's Save must be a canonical
// MERGE, never a flat-projection overwrite. The invariant under test:
//   mergeAuditRecordIntoCapabilities(raw, toAuditRecord(parseCapabilities(raw)))
// is lossless — interaction / multilingual / non-text output / extended
// features / unknown keys all survive an untouched Save.

import {
  mergeAuditRecordIntoCapabilities,
  parseCapabilities,
  toAuditRecord,
} from "../parse";

/**
 * Mirrors the live shape of the 5 `interaction: "extraction"` rows
 * (fastino / GLiNER2 family) in ai.model_definition.capabilities —
 * the exact rows one audit-tab Save used to lobotomize.
 */
const EXTRACTION_ROW = {
  input: ["text"],
  output: ["entities"],
  features: ["ner", "classification", "structured_extraction", "relation_extraction"],
  interaction: "extraction",
  multilingual: true,
};

describe("mergeAuditRecordIntoCapabilities", () => {
  it("preserves the canonical embedding vocabulary", () => {
    expect(
      parseCapabilities({
        input: ["text"],
        output: ["embedding"],
        features: ["embeddings", "dimension_reduction"],
        interaction: "embedding",
        multilingual: false,
      }),
    ).toEqual({
      input: ["text"],
      output: ["embedding"],
      features: ["embeddings", "dimension_reduction"],
      interaction: "embedding",
      multilingual: false,
    });
  });

  it("preserves Kimi-K3's live caching and partial-response capabilities", () => {
    expect(
      parseCapabilities({
        input: ["text", "image", "video"],
        output: ["text"],
        features: ["context_caching", "partial_mode"],
        interaction: "turn",
        multilingual: true,
      }),
    ).toEqual({
      input: ["text", "image", "video"],
      output: ["text"],
      features: ["context_caching", "partial_mode"],
      interaction: "turn",
      multilingual: true,
    });
  });

  it("untouched Save is lossless on an extraction-model row", () => {
    const edited = toAuditRecord(parseCapabilities(EXTRACTION_ROW));
    const merged = mergeAuditRecordIntoCapabilities(EXTRACTION_ROW, edited);
    expect(merged).toEqual(EXTRACTION_ROW);
  });

  it("preserves unknown top-level keys and unknown array members verbatim", () => {
    const raw = {
      ...EXTRACTION_ROW,
      features: [...EXTRACTION_ROW.features, "some_future_feature"],
      some_future_key: { nested: true },
    };
    const edited = toAuditRecord(parseCapabilities(raw));
    const merged = mergeAuditRecordIntoCapabilities(raw, edited);
    expect(merged).toEqual(raw);
  });

  it("applies a toggled flag to the canonical location without touching the rest", () => {
    const edited = {
      ...toAuditRecord(parseCapabilities(EXTRACTION_ROW)),
      json_mode: true, // turn ON a feature flag
      text_input: false, // turn OFF an input modality
    };
    const merged = mergeAuditRecordIntoCapabilities(EXTRACTION_ROW, edited);
    expect(merged).toEqual({
      ...EXTRACTION_ROW,
      input: [],
      features: [...EXTRACTION_ROW.features, "json_mode"],
    });
    // Original row untouched (no mutation).
    expect(EXTRACTION_ROW.input).toEqual(["text"]);
  });

  it("never writes a flag with no canonical mapping", () => {
    const merged = mergeAuditRecordIntoCapabilities(EXTRACTION_ROW, {
      // video_output / document_output do not exist in the audit record type;
      // vision maps to the feature only.
      vision: false,
    });
    // vision=false removes the (absent) feature — a no-op; nothing else moves.
    expect(merged).toEqual(EXTRACTION_ROW);
  });
});
