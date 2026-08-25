/**
 * The rank / SERP-landscape kind family — the compiled parser mirrors
 * (Rank Kinds Run, Stage B).
 *
 * PYTHON-OWNED: the registry rows are seeded from the pydantic models in
 * `aidream/aidream/services/rank_kinds/models.py` (the source of truth,
 * distilled 2026-08-24 from 12 real captures). The `KindSchema`s below are the
 * FE parser's mirrors of those models; the generated TS types live in
 * `kinds/generated/kinds.generated.ts` (`pnpm shape:types` — registry→TS
 * codegen). A model change re-publishes the registry
 * (`scripts/publish_kind_catalog.py aidream.services.rank_kinds.models
 * --evolve --apply`) AND regenerates the types AND updates these mirrors in
 * the same change.
 *
 * THIS IS A CONVERGENCE FAMILY. A search results page is made of things the
 * platform ALREADY models, so this family mints only what rank tracking adds —
 * the tracked target, the position reading, the receipt for the paid call, and
 * the placement that says WHERE on the page a result sat. `serp_placement`
 * carries a DISCRIMINATED UNION over the shipped search kinds (`web_result`,
 * `local_place`, `ai_answer`, `entity_card`, `faq_item`, `discussion_result`,
 * `news_result`, `video_result`), and its component delegates every one of
 * them back to the search family's canonical components. Minting a
 * `serp_organic_result` beside `web_result` is exactly the death THE MERGE +
 * TRANSLATION LAW forbids.
 *
 * 🚨 PRE-CUTOVER — `seo_rank_serp_landscape`. The registry row still holds the
 * pre-supersede schema (v4: `snapshot_id` / `observed_at` / `results` only);
 * the model's full shape (query, engine, device, language, country,
 * `location_name`, `total_results`, `signals`, `related_searches`,
 * `rank_basis`, `block_order`) is a BREAKING supersede that rides Stage D with
 * the node repoint, because live nodes verify `output_kind` against the
 * registry schema on every run. The schema below is the NEW shape — it is what
 * the demo endpoint (`POST /api/rank-kinds/landscape`) emits today and what the
 * registry row becomes at cutover. Same posture as `web_search_results` in
 * `search-results.ts`. `seo_rank_history` and `seo_rank_check_result` are
 * cutover-gated in the same way and are deliberately NOT mirrored here yet:
 * they keep the `generic_structured` floor until their emitters move.
 *
 * Bridges are STREAMING and uniform: serverData is `{ value, isComplete }` —
 * the envelope's live value object, verbatim. Components own all reading
 * defensively (a half-arrived value is a NORMAL state), and the same
 * components render nested instances handed to them directly (see
 * `components/mardown-display/blocks/rank-kinds/`).
 */

import type { KindDefinition } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import { makeSearchKindBridge } from "./search-results";

/** The vocabulary the ADAPTER enforces; the schema keeps a free string on
 * purpose — narrowing a live free-text field is a breaking change, and an
 * engine invents a new block type roughly every quarter. */
const RESULT_TYPE_DESCRIPTION =
  "Which block this position was: organic | local_pack | ai_citation | " +
  "ai_overview | entity_card | faq | discussion | news | video | unknown.";

// ---------------------------------------------------------------------------
// System-wide primitive
// ---------------------------------------------------------------------------

export const providerRunReceiptKindSchema: KindSchema = {
  kind: "provider_run_receipt",
  fields: {
    run_id: {
      type: "string",
      required: true,
      description: "The collection run this receipt belongs to.",
    },
    provider: {
      type: "string",
      required: true,
      description: "Provider that served the call, e.g. 'brave' | 'serpapi' | 'dataforseo'.",
    },
    from_cache: {
      type: "boolean",
      description: "Served from a stored payload rather than a fresh paid call.",
    },
    cache_age_seconds: { type: "number", nullable: true },
    freshness_ttl_seconds: { type: "number", nullable: true },
    created_observations: { type: "number" },
    existing_observations: { type: "number" },
    reused_completed_run: { type: "boolean" },
    cost_usd: {
      type: "number",
      nullable: true,
      description: "Reported spend. NULL is UNMEASURED, never zero.",
    },
    input_tokens: { type: "number", nullable: true },
    output_tokens: { type: "number", nullable: true },
    reasoning_tokens: { type: "number", nullable: true },
    latency_seconds: { type: "number", nullable: true },
  },
};

// ---------------------------------------------------------------------------
// The reading — one observation of where we stood
// ---------------------------------------------------------------------------

export const seoRankReadingKindSchema: KindSchema = {
  kind: "seo_rank_reading",
  fields: {
    observed_at: {
      type: "string",
      required: true,
      description: "When the observation was taken.",
    },
    organic_rank: {
      type: "number",
      nullable: true,
      description: "Rank within the organic list. NULL when not present in it.",
    },
    absolute_rank: {
      type: "number",
      nullable: true,
      description: "Position on the whole results page, across every block.",
    },
    matched_url: { type: "string", nullable: true },
    matched_domain: { type: "string", nullable: true },
    result_type: {
      type: "string",
      required: true,
      description: RESULT_TYPE_DESCRIPTION,
    },
    found: {
      type: "boolean",
      description:
        "Whether the target was found at all. Derived — never left to a NULL rank.",
    },
    match_rule: {
      type: "string",
      nullable: true,
      description: "WHY this counted as a match (exact URL, domain, subdomains, alias).",
    },
    movement: {
      type: "number",
      nullable: true,
      description: "Positions gained since the previous reading; positive is an improvement.",
    },
    title: { type: "string", nullable: true },
    snippet: { type: "string", nullable: true },
  },
};

// ---------------------------------------------------------------------------
// The placement — one position on the page, carrying a shipped search kind
// ---------------------------------------------------------------------------

export const serpPlacementKindSchema: KindSchema = {
  kind: "serp_placement",
  fields: {
    absolute_rank: {
      type: "number",
      required: true,
      description: "Position on the whole page, 1-based, across every block.",
    },
    organic_rank: { type: "number", nullable: true },
    result_type: {
      type: "string",
      required: true,
      description: RESULT_TYPE_DESCRIPTION,
    },
    is_tracked_target: {
      type: "boolean",
      description: "Whether this placement is the site being tracked — the 'you are here' flag.",
    },
    // The discriminated union over the SHIPPED search kinds. The parser reads
    // the nested `__kind` and validates against whichever member it names.
    result: {
      type: "union",
      nullable: true,
      scalars: [],
      kinds: [
        "web_result",
        "local_place",
        "ai_answer",
        "entity_card",
        "faq_item",
        "discussion_result",
        "news_result",
        "video_result",
      ],
      description: "The result itself, as one of the shipped search kinds.",
    },
  },
};

// ---------------------------------------------------------------------------
// The tracked target and its portfolio
// ---------------------------------------------------------------------------

export const seoRankTargetKindSchema: KindSchema = {
  kind: "seo_rank_target",
  fields: {
    target_id: { type: "string", required: true },
    site_id: { type: "string", required: true },
    keyword_id: { type: "string", required: true },
    keyword: {
      type: "string",
      required: true,
      description: "The tracked phrase, or the prompt for an AI engine.",
    },
    provider: { type: "string", required: true },
    engine: { type: "string", required: true },
    language: { type: "string", required: true },
    device: { type: "string", required: true, description: "'desktop' | 'mobile'." },
    search_type: {
      type: "string",
      required: true,
      description: "'organic' | 'local_pack' | 'ai_answer'.",
    },
    location_name: { type: "string", nullable: true },
    target_domain: { type: "string", nullable: true },
    target_page_id: { type: "string", nullable: true },
    group: { type: "string", nullable: true },
    tags: { type: "string[]" },
    notes: { type: "string", nullable: true },
    cadence_days: { type: "number", required: true },
    is_active: { type: "boolean", required: true },
    created_at: { type: "string", required: true },
    latest_position: { type: "number", nullable: true },
    latest_absolute_position: { type: "number", nullable: true },
    previous_position: { type: "number", nullable: true },
    movement: { type: "number", nullable: true },
    best_position: { type: "number", nullable: true },
    last_checked_at: { type: "string", nullable: true },
    country: { type: "string", nullable: true },
    include_subdomains: { type: "boolean", nullable: true },
    model_name: { type: "string", nullable: true },
    checks_count: { type: "number", nullable: true },
  },
};

export const seoRankPortfolioKindSchema: KindSchema = {
  kind: "seo_rank_portfolio",
  fields: {
    targets: { type: "array", itemKinds: ["seo_rank_target"] },
    site_id: { type: "string", nullable: true },
    active_count: { type: "number", nullable: true },
    improved_count: { type: "number", nullable: true },
    declined_count: { type: "number", nullable: true },
  },
};

export const seoRankTargetRemovalKindSchema: KindSchema = {
  kind: "seo_rank_target_removal",
  fields: {
    removed: { type: "boolean", required: true },
    target_id: { type: "string", nullable: true },
  },
};

// ---------------------------------------------------------------------------
// The landscape — PRE-CUTOVER shape (see the module header)
// ---------------------------------------------------------------------------

export const seoRankSerpLandscapeKindSchema: KindSchema = {
  kind: "seo_rank_serp_landscape",
  fields: {
    snapshot_id: { type: "string", nullable: true },
    observed_at: { type: "string", nullable: true },
    results: {
      type: "array",
      itemKinds: ["serp_placement"],
      description: "The page in order, one entry per position.",
    },
    query: { type: "string", nullable: true },
    engine: { type: "string", nullable: true },
    provider: { type: "string", nullable: true },
    device: { type: "string", nullable: true },
    language: { type: "string", nullable: true },
    country: { type: "string", nullable: true },
    location_name: { type: "string", nullable: true },
    total_results: { type: "number", nullable: true },
    // QuerySignals is a plain sub-structure (no independent identity → no
    // kind): { is_geolocal, is_navigational, is_news_breaking, local_decision,
    // more_results_available, bad_results, spellcheck_off, altered_query }.
    signals: {
      type: "inline_object",
      nullable: true,
      fields: {
        is_geolocal: { type: "boolean", nullable: true },
        is_navigational: { type: "boolean", nullable: true },
        is_news_breaking: { type: "boolean", nullable: true },
        local_decision: { type: "string", nullable: true },
        more_results_available: { type: "boolean", nullable: true },
        bad_results: { type: "boolean", nullable: true },
        spellcheck_off: { type: "boolean", nullable: true },
        altered_query: { type: "string", nullable: true },
      },
    },
    related_searches: { type: "string[]" },
    rank_basis: {
      type: "string",
      description:
        "How absolute_rank was derived. 'engine_reported' — the engine gave the " +
        "whole-page block order. 'platform_convention' — it did not, and we laid " +
        "the blocks out ourselves. A consumer must be able to tell an observation " +
        "from a convention.",
    },
    block_order: { type: "string[]" },
  },
};

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// The bridge is the search family's: ONE uniform `{ value, isComplete }`
// streaming wrapper for every kind in both families (never a second copy).
// ---------------------------------------------------------------------------

const RANK_KIND_SCHEMAS: KindSchema[] = [
  providerRunReceiptKindSchema,
  seoRankReadingKindSchema,
  serpPlacementKindSchema,
  seoRankTargetKindSchema,
  seoRankPortfolioKindSchema,
  seoRankTargetRemovalKindSchema,
];

export const RANK_KINDS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "seo_rank_serp_landscape",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "seo_rank_serp_landscape",
    toLegacyServerData: makeSearchKindBridge("seo_rank_serp_landscape"),
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: seoRankSerpLandscapeKindSchema,
  },
  ...RANK_KIND_SCHEMAS.map(
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
