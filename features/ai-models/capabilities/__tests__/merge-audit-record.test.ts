// TASK-003 MUST-FIX 2 guard: the audit editor's Save must be a canonical
// MERGE, never a flat-projection overwrite. The invariant under test:
//   mergeAuditRecordIntoCapabilities(raw, toAuditRecord(parseCapabilities(raw)))
// is lossless — interaction / multilingual / non-text output / extended
// features / unknown keys all survive an untouched Save.

import {
  findNonCanonicalCapabilityValues,
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

  it("preserves the complete provider-agent capability vocabulary", () => {
    const features = [
      "file_search",
      "mcp",
      "background_execution",
      "collaborative_planning",
      "visualization",
      "citations",
      "sandboxed_execution",
      "live_api",
      "url_context",
      "grounding_maps",
      "multimodal_embedding",
      "music_generation",
      "real_time_translation",
    ] as const;

    expect(
      parseCapabilities({
        input: ["text"],
        output: ["text"],
        features,
        interaction: "agent",
        multilingual: true,
      }),
    ).toEqual({
      input: ["text"],
      output: ["text"],
      features,
      interaction: "agent",
      multilingual: true,
    });
  });

  it("still refuses provider alias spellings — the write boundary owns them", () => {
    // The other half of the 2026-09-12 fix. gpt-6-astra and claude-fable-5-1
    // landed with these spellings; the answer is to normalize them BEFORE the
    // write (aidream capability_vocabulary.py) and repair the rows, never to
    // widen this list. If this test ever goes green with these accepted, the
    // database vocabulary has been allowed to fork again.
    const aliases = [
      "structured_outputs",
      "reasoning",
      "code_interpreter",
      "batch",
      "pdf_input",
    ];

    const parsed = parseCapabilities({
      input: ["text"],
      output: ["text"],
      features: aliases,
      interaction: "turn",
    });

    expect(parsed.features).toEqual([]);

  });

  it("parses the repaired 2026-09-12 rows with nothing lost", () => {
    expect(
      parseCapabilities({
        input: ["text", "image"],
        output: ["text"],
        features: [
          "function_calling",
          "structured_output",
          "streaming",
          "vision",
          "web_search",
          "file_search",
          "code_execution",
          "computer_use",
          "prompt_caching",
          "thinking",
        ],
        interaction: "turn",
        multilingual: true,
      }).features,
    ).toContain("structured_output");

    expect(
      parseCapabilities({
        input: ["image", "text", "document"],
        output: ["text"],
        features: ["batch_api", "context_management", "citations"],
        interaction: "turn",
      }),
    ).toEqual({
      input: ["image", "text", "document"],
      output: ["text"],
      features: ["batch_api", "context_management", "citations"],
      interaction: "turn",
      multilingual: false,
    });
  });

  it("accepts the canonical additions without dropping features", () => {
    // Regression guard for the model-catalog incidents recorded on 2026-09-12.
    // These are canonical stored feature keys, shared with aidream's
    // capability_vocabulary.py. Provider aliases are normalized before write;
    // accepting them here would let the database vocabulary drift again.
    const features = [
      "inpainting",
      "context_management",
    ] as const;

    expect(
      parseCapabilities({
        input: ["text", "image"],
        output: ["text", "image"],
        features,
        interaction: "turn",
        multilingual: false,
      }),
    ).toEqual({
      input: ["text", "image"],
      output: ["text", "image"],
      features,
      interaction: "turn",
      multilingual: false,
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

describe("findNonCanonicalCapabilityValues", () => {
  // The admin raw-JSON editor writes the column straight to Supabase, so the
  // server-side write guard never sees it. This is that door's lock.
  it("passes a canonical object", () => {
    expect(
      findNonCanonicalCapabilityValues({
        input: ["text", "image", "document"],
        output: ["text"],
        features: ["structured_output", "thinking", "context_management"],
        interaction: "single",
        multilingual: true,
      }),
    ).toEqual([]);
  });

  it("names every provider alias rather than accepting it", () => {
    const problems = findNonCanonicalCapabilityValues({
      input: ["text"],
      output: ["text"],
      features: ["structured_outputs", "reasoning", "pdf_input"],
      interaction: "turn",
    });
    expect(problems).toHaveLength(3);
    expect(problems.join(" ")).toContain("structured_outputs");
  });

  it("catches the flat legacy shape and bad scalars", () => {
    expect(findNonCanonicalCapabilityValues({ text_input: true })).toContain(
      'unknown key "text_input"',
    );
    expect(findNonCanonicalCapabilityValues(null).length).toBe(1);
    expect(
      findNonCanonicalCapabilityValues({ interaction: "chat", multilingual: "yes" }),
    ).toHaveLength(2);
  });
});
