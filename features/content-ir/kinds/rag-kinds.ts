/**
 * The RAG retrieval + citation kind family — the compiled parser mirrors
 * (RAG Kinds Run, Stage B).
 *
 * PYTHON-OWNED: the registry rows are seeded from the pydantic models in
 * `aidream/aidream/services/rag_kinds/models.py` (the source of truth,
 * distilled 2026-08-24 from 6 real captures of the live retrieval engine).
 * The `KindSchema`s below are the FE parser's mirrors of those models; the
 * generated TS types live in `kinds/generated/kinds.generated.ts`
 * (`pnpm shape:types` — registry→TS codegen). A model change re-publishes the
 * registry (`scripts/publish_kind_catalog.py aidream.services.rag_kinds.models
 * --evolve --apply`) AND regenerates the types AND updates these mirrors in the
 * same change.
 *
 * 🚨 `source_ref` IS THE PRIZE, AND IT IS A SYSTEM-WIDE PRIMITIVE, not a RAG
 * kind. "Here is a fact, and here is where it came from" had been built FOUR
 * times in four vocabularies before this run (`citation`, `evidence_source`,
 * `ai_answer.references`, and the RAG citation, which was not a kind at all).
 * `source_ref` is the one shape all four describe. It will be nested by
 * document extraction, by legal, and by every grounded answer — so its
 * component must read well BOTH standalone and inline inside another kind.
 * Retiring the older two is a SEPARATE, open decision with Arman; nothing here
 * depends on the answer.
 *
 * 🚨 PRE-CUTOVER — `rag_search_result` and `rag_cross_doc_search_result`. Their
 * registry rows still hold the pre-supersede schema (v4: `hits` as an anonymous
 * object, no `diagnostics`); the models' full shape is a BREAKING supersede
 * (`hits` becomes the `retrieved_chunk` kind, which declares a `__kind` const
 * the live schema has none of) that rides Stage D with the node repoint,
 * because live nodes verify `output_kind` against the registry schema on every
 * run. The publisher REFUSED both on 2026-08-24 — correctly, and the refusal is
 * the gate working. The schemas below are the NEW shape: what the demo endpoint
 * (`POST /api/rag-kinds/search`) emits today and what the registry rows become
 * at cutover. Same posture as `seo_rank_serp_landscape` in `rank-kinds.ts` and
 * `web_search_results` in `search-results.ts`. Consequence to hold: there is no
 * per-slug `.gen.ts` for either, and `kinds.generated.ts` types them at the OLD
 * shape — components read `diagnostics` defensively, never off the generated
 * interface.
 *
 * Sub-structures that are NOT kinds are `inline_object` on purpose:
 *   - `SourceLocator` (source_ref.locator) — a locator has no identity apart
 *     from the source it points into;
 *   - `RetrievalDiagnostics` / `RetrievalEntity` — a registered
 *     `entity_mention` already exists and means something else, and the
 *     knowledge-graph family is its own queue row. Minting a near-duplicate
 *     here to avoid reading that row later is how a registry fills with
 *     synonyms.
 *
 * Bridges are STREAMING and uniform: serverData is `{ value, isComplete }` —
 * the envelope's live value object, verbatim. Components own all reading
 * defensively (a half-arrived value is a NORMAL state), and the same components
 * render nested instances handed to them directly (see
 * `components/mardown-display/blocks/rag-kinds/`).
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { makeSearchKindBridge } from "./search-results";

/**
 * WHERE in the source a citation points. One locator rather than a page field
 * here and a timecode field there: a PDF cites pages, a video cites seconds, a
 * long document cites a character span, and a consumer that wants "take me to
 * the exact spot" should not have to know which kind of source it is holding.
 */
const SOURCE_LOCATOR_FIELDS: KindSchema["fields"] = {
  first_page: { type: "number", nullable: true },
  last_page: { type: "number", nullable: true },
  start_seconds: {
    type: "number",
    nullable: true,
    description: "Offset into a time-based source (audio, video).",
  },
  end_seconds: { type: "number", nullable: true },
  start_index: {
    type: "number",
    nullable: true,
    description: "Character offset into the source text.",
  },
  end_index: { type: "number", nullable: true },
  section: {
    type: "string",
    nullable: true,
    description: "Named section, heading or clause, when the source has them.",
  },
  section_subtype: {
    type: "string",
    nullable: true,
    description:
      "Finer classification of the section, when the corpus declares one. " +
      "Measured empty on every capture to date and MAPPED anyway rather than " +
      "dropped — a field that is empty today and populated next quarter must " +
      "not need a schema change to start arriving.",
  },
  display: {
    type: "string",
    nullable: true,
    description:
      "Human rendering when the source's own convention is not numeric ('§ 4.2(a)').",
  },
};

// ---------------------------------------------------------------------------
// The system-wide primitive
// ---------------------------------------------------------------------------

export const sourceRefKindSchema: KindSchema = {
  kind: "source_ref",
  fields: {
    source_kind: {
      type: "string",
      required: true,
      description:
        "What the source is. Documented vocabulary: web_page, library_doc, " +
        "file, note, message, transcript, dataset_row, opinion, docket, unknown. " +
        "Deliberately an open string — a new source type must not require a " +
        "schema change.",
    },
    source_id: {
      type: "string",
      nullable: true,
      description: "Our internal id for the source, when it is ours.",
    },
    title: { type: "string", nullable: true },
    url: { type: "string", nullable: true, description: "Where a reader can open it." },
    site_name: { type: "string", nullable: true },
    favicon: { type: "string", nullable: true },
    excerpt: {
      type: "string",
      nullable: true,
      description: "The quoted passage this reference supports.",
    },
    locator: {
      type: "inline_object",
      nullable: true,
      fields: SOURCE_LOCATOR_FIELDS,
      description: "Where in the source the citation points.",
    },
    published_at: {
      type: "string",
      nullable: true,
      description: "ISO-8601 date(time); may be approximate.",
    },
    author: { type: "string", nullable: true },
    publisher: { type: "string", nullable: true },
    short_code: {
      type: "string",
      nullable: true,
      description: "Canonical short handle, e.g. 'NIST-SP-800-61r3'.",
    },
    version: {
      type: "string",
      nullable: true,
      description: "Edition or revision of the source.",
    },
    jurisdiction: { type: "string", nullable: true },
    authority: {
      type: "string",
      nullable: true,
      description: "How authoritative the source is, as the corpus declares it.",
    },
    effective_from: { type: "string", nullable: true },
    effective_to: {
      type: "string",
      nullable: true,
      description: "When it stopped being in force. NULL means still current.",
    },
    origin: {
      type: "string",
      nullable: true,
      description:
        "How we came to cite this — 'retrieval', 'model_citation', 'user_supplied'.",
    },
  },
};

// ---------------------------------------------------------------------------
// One retrieved passage
// ---------------------------------------------------------------------------

export const retrievedChunkKindSchema: KindSchema = {
  kind: "retrieved_chunk",
  fields: {
    chunk_id: { type: "string", required: true },
    content_text: {
      type: "string",
      required: true,
      description: "The matched passage itself.",
    },
    source: {
      type: "object",
      kind: "source_ref",
      nullable: true,
      description: "What this passage came from — the durable pointer.",
    },
    chunk_kind: { type: "string", nullable: true, description: "text | table | code | …" },
    parent_chunk_id: { type: "string", nullable: true },
    score: { type: "number", nullable: true, description: "The final ranking score." },
    vector_rank: {
      type: "number",
      nullable: true,
      description: "Rank in the embedding lane.",
    },
    lexical_rank: {
      type: "number",
      nullable: true,
      description: "Rank in the keyword lane.",
    },
    entity_rank: {
      type: "number",
      nullable: true,
      description: "Rank in the knowledge-graph lane.",
    },
    rerank_score: { type: "number", nullable: true },
    entities: {
      type: "string[]",
      description: "Entity names present in this passage.",
    },
    derivation_kind: {
      type: "string",
      nullable: true,
      description:
        "How this passage came to exist, e.g. 'initial_extract'. Lets a reader " +
        "tell 'the document said this' from 'an agent concluded this from the " +
        "document', which is not a small difference.",
    },
    agent_id: { type: "string", nullable: true },
    extraction_run_id: { type: "string", nullable: true },
    priority: { type: "number", nullable: true },
  },
};

/**
 * Why these results, and how hard we looked. Every field exists in the live
 * retrieval envelope today and reaches NO consumer at all — measured. "Why
 * didn't it find my document?" is asking exactly this, and
 * `lexical_candidates: 0` is frequently the answer.
 */
const RETRIEVAL_DIAGNOSTICS_FIELDS: KindSchema["fields"] = {
  total_candidates: { type: "number", nullable: true },
  vector_candidates: { type: "number", nullable: true },
  lexical_candidates: { type: "number", nullable: true },
  entity_candidates: { type: "number", nullable: true },
  embedding_model: { type: "string", nullable: true },
  reranker_model: { type: "string", nullable: true },
  rerank_status: {
    type: "string",
    nullable: true,
    description: "applied | off | failed — never silently absent.",
  },
  latency_ms: { type: "number", nullable: true },
  matched_entities: { type: "string[]" },
  entity_map: {
    type: "json[]",
    description:
      "The graph neighbourhood the query touched — one entry per entity " +
      "(entity_id, name, entity_kind, mention_count, artifact_count, " +
      "importance, is_concept, top_chunk_id). NOT a kind: the registered " +
      "`entity_mention` means something else, and the knowledge-graph family " +
      "is its own queue row with its own renderer decision still open.",
  },
};

// ---------------------------------------------------------------------------
// The collections — PRE-CUTOVER shapes (see the module header)
// ---------------------------------------------------------------------------

export const ragSearchResultKindSchema: KindSchema = {
  kind: "rag_search_result",
  fields: {
    query: { type: "string" },
    hits: {
      type: "array",
      itemKinds: ["retrieved_chunk"],
      description: "The passages that answered, best first.",
    },
    embedding_model: { type: "string" },
    reranker_model: { type: "string", nullable: true },
    total_candidates: { type: "number" },
    latency_ms: { type: "number" },
    diagnostics: {
      type: "inline_object",
      nullable: true,
      fields: RETRIEVAL_DIAGNOSTICS_FIELDS,
      description: "Why these results, and how hard we looked.",
    },
  },
};

export const ragCrossDocSearchResultKindSchema: KindSchema = {
  kind: "rag_cross_doc_search_result",
  fields: {
    library_query: { type: "string" },
    case_query: { type: "string" },
    // SECTIONED, NEVER FLATTENED. Merging the two corpora into one ranked list
    // would answer "which corpus did this come from?" with a guess, and knowing
    // which one answered is the whole point of searching two.
    library_hits: { type: "array", itemKinds: ["retrieved_chunk"] },
    case_hits: { type: "array", itemKinds: ["retrieved_chunk"] },
    library_latency_ms: { type: "number" },
    case_latency_ms: { type: "number" },
    library_diagnostics: {
      type: "inline_object",
      nullable: true,
      fields: RETRIEVAL_DIAGNOSTICS_FIELDS,
    },
    case_diagnostics: {
      type: "inline_object",
      nullable: true,
      fields: RETRIEVAL_DIAGNOSTICS_FIELDS,
    },
  },
};

// ---------------------------------------------------------------------------
// The grounded answer — ADDITIVE supersede, already live at registry v4
// ---------------------------------------------------------------------------

export const ragSynthesizeResultKindSchema: KindSchema = {
  kind: "rag_synthesize_result",
  fields: {
    answer: { type: "string" },
    model: { type: "string" },
    question: { type: "string", nullable: true, description: "The question this answers." },
    // THE HEADLINE. Measured on a real grounded answer: the output carried five
    // bare chunk UUIDs and nothing else — no title, no URL, no page. A reader
    // could not check a single claim without a lookup they had no way to
    // perform. `used_chunk_ids` stays because it is the machine join key;
    // `citations` is what a person reads.
    citations: {
      type: "array",
      itemKinds: ["source_ref"],
      description: "The sources the answer stands on, ready to render.",
    },
    used_chunk_ids: { type: "string[]" },
    unsupported_claims: {
      type: "string[]",
      description: "Claims the writer could not ground. Empty is a claim; absent is not.",
    },
  },
};

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// The bridge is the search family's: ONE uniform `{ value, isComplete }`
// streaming wrapper for every kind in every family (never a second copy).
// ---------------------------------------------------------------------------

const RAG_ITEM_SCHEMAS: KindSchema[] = [sourceRefKindSchema, retrievedChunkKindSchema];

const RAG_COLLECTION_SCHEMAS: KindSchema[] = [
  ragSearchResultKindSchema,
  ragCrossDocSearchResultKindSchema,
  ragSynthesizeResultKindSchema,
];

export const RAG_KINDS_KIND_DEFINITIONS: KindDefinition[] = [
  ...RAG_COLLECTION_SCHEMAS.map(
    (schema): KindDefinition => ({
      kind: schema.kind,
      schemaSource: "system",
      tier: "eager",
      legacyBlockType: schema.kind,
      toLegacyServerData: makeSearchKindBridge(schema.kind),
      persistence: { persistStructured: true },
      loadingComponent: "list",
      schema,
    }),
  ),
  ...RAG_ITEM_SCHEMAS.map(
    (schema): KindDefinition => ({
      kind: schema.kind,
      schemaSource: "system",
      tier: "eager",
      legacyBlockType: schema.kind,
      toLegacyServerData: makeSearchKindBridge(schema.kind),
      persistence: { persistStructured: true },
      schema,
    }),
  ),
];
