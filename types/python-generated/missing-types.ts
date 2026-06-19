/**
 * missing-types.ts — Temporary home for block types not yet in the auto-generated stream-events.ts
 *
 * TWO CATEGORIES live here:
 *
 * 1. CLIENT-ONLY block types — produced by the markdown splitter, never by Python.
 *    When Python needs to send these, add them to Python and delete them from here.
 *
 * 2. SERVER-ONLY render block types — Python sends them but they are NOT yet in
 *    TypedRenderBlock in stream-events.ts. They ARE in TypedDataPayload as data-event
 *    payloads, but the render-block wrapper interfaces are missing.
 *    Once Python regenerates stream-events.ts with these as proper render block
 *    interfaces, delete the duplicates from here.
 *
 * FIELD NAMING RULE:
 *   Python sends snake_case. Components want camelCase.
 *   The normalizer in EnhancedChatMarkdown (renderBlockToContentBlock) is responsible
 *   for any field remapping. Document the mismatch with a TODO comment.
 *
 * HOW TO USE:
 *   Import RenderBlockType from here when you need to reference ALL block types.
 *   Import ClientOnlyBlockType for the client-splitter-only types.
 */

// ============================================================================
// CATEGORY 1: CLIENT-ONLY BLOCK TYPES
// These are produced by the markdown splitter and rendered by BlockRenderer.
// Python does not send these. If Python ever needs to, move them to stream-events.ts.
// ============================================================================

/** A directory/file tree rendered from box-drawing or ASCII connectors. */
export interface TreeRenderBlock {
  type: "tree";
  content: string;
  metadata?: Record<string, unknown>;
}

/** A styled accent divider (*** pattern). */
export interface AccentDividerRenderBlock {
  type: "accent-divider";
  content: string;
  metadata?: Record<string, unknown>;
}

/** A styled heavy divider (#=== pattern). */
export interface HeavyDividerRenderBlock {
  type: "heavy-divider";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * An audio player parsed from a markdown audio link in streamed/persisted text
 * (e.g. `[Audio URL: …]` or a standalone `…​.mp3` link). Mirrors the typed
 * `image`/`video` render blocks: the URL travels on the splitter block's `src`
 * field, not here. This is the streaming-text twin of the server-side
 * `audio_output` block — see content-splitter-v2.ts `detectAudioMarkdown`.
 */
export interface AudioRenderBlock {
  type: "audio";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * A raw SVG illustration emitted by an agent in a ```svg fence — rendered
 * sandboxed (no scripts) and responsively from its viewBox. Client-only for
 * now; promote to Python's stream-events.ts when the server emits a typed svg
 * block. See components/mardown-display/blocks/svg/SvgBlock.tsx.
 */
export interface SvgRenderBlock {
  type: "svg";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * A data chart emitted by an agent in a ```chart fence — a small JSON spec
 * (type + data) rendered with recharts (loaded via next/dynamic ssr:false).
 * Client-only for now. See components/mardown-display/blocks/chart/ChartBlock.tsx.
 */
export interface ChartRenderBlock {
  type: "chart";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * A clickable reference to a platform entity (agent, note, task, file, etc.).
 * Emitted by an agent as a ```json fence keyed by `item_presentation`:
 *   { "item_presentation": { "id": "...", "type": "agent", "name": "...", "about": "..." } }
 * Client-only for now (detected by the splitter's JSON_BLOCK_PATTERNS). The
 * renderer auto-enriches recognized types from the DB and opens the matching
 * window panel on click. See features/item-presentation/.
 */
export interface ItemPresentationRenderBlock {
  type: "item_presentation";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * A Matrx Envelope embedded in content via a ```matrx fence. The `content`
 * is the raw envelope JSON `{ matrx_version, kind, type, items: [...] }`.
 * In-content position only resolves `reference` / `secret` kinds (an action in
 * prose is shown, never executed). Rendered by features/matrx-envelope/
 * MatrxEnvelopeBlock — chips for references, a muted card otherwise.
 * See docs/protocol/MATRX_ENVELOPE.md + MATRX_REFERENCES.md.
 */
export interface MatrxEnvelopeRenderBlock {
  type: "matrx";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * An output-schema proposal emitted by the "JSON Schema Generator" agent as a
 * ```json fence: `{ name: string, schema: object, strict?: boolean }`. The FE
 * recognizes it (see content-splitter-v2 JSON_BLOCK_PATTERNS) and offers
 * "Apply to an agent" (writes agx_agent.output_schema). Client-only.
 * See features/agents/components/schema-proposal/.
 */
export interface SchemaProposalRenderBlock {
  type: "schema_proposal";
  content: string;
  metadata?: Record<string, unknown>;
}

export type ClientOnlyRenderBlock =
  | TreeRenderBlock
  | AccentDividerRenderBlock
  | HeavyDividerRenderBlock
  | AudioRenderBlock
  | SvgRenderBlock
  | ChartRenderBlock
  | ItemPresentationRenderBlock
  | MatrxEnvelopeRenderBlock
  | SchemaProposalRenderBlock;

export type ClientOnlyBlockType = ClientOnlyRenderBlock["type"];

// ============================================================================
// CATEGORY 2: SERVER-ONLY RENDER BLOCK DATA SHAPES
// Python sends these as render_block events. The data types already exist in
// stream-events.ts as TypedDataPayload members (AudioOutputData, etc.) but
// the render block wrapper interfaces are not yet in TypedRenderBlock.
//
// FIELD NAMING NOTE:
//   Python uses snake_case. Components use camelCase. Until Python changes,
//   the normalizer must remap. Each block below is annotated with the mismatch.
// ============================================================================

/**
 * Audio output from the AI (TTS or file).
 * Python data shape: AudioOutputData { url: string; mime_type: string }
 * Component wants: AudioOutputBlockProps { url: string; mimeType?: string }
 * TODO(python): rename mime_type → mimeType, or update component to use mime_type.
 */
export interface AudioOutputRenderBlock {
  type: "audio_output";
  content: string;
  /** Python sends: { url: string; mime_type: string } — see AudioOutputData in stream-events.ts */
  data: {
    url: string;
    mime_type: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Image output from the AI (generated or returned image).
 * Python data shape: ImageOutputData { url: string; mime_type: string }
 * Component wants: ImageOutputBlockProps { url: string; mimeType?: string }
 * TODO(python): rename mime_type → mimeType, or update component to use mime_type.
 */
export interface ImageOutputRenderBlock {
  type: "image_output";
  content: string;
  /**
   * Python sends ImageOutputData — see stream-events.ts.
   * Canonical S3 key is <owner>/<file_id> (no subfolder, no extension) so
   * file_id is self-identifying from the URL path when present.
   * Priority for display: cdn_url → file handler (via file_id) → signed_url → url
   */
  data: {
    url: string;
    mime_type: string;
    /** cloud_files UUID. S3 key is <owner>/<file_id>. */
    file_id?: string | null;
    /** Permanent CDN URL (public files). Prefer over signed_url when present. */
    cdn_url?: string | null;
    /** Presigned S3 URL (~1h expiry). */
    signed_url?: string | null;
    /** Download-disposition URL. */
    download_url?: string | null;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Video output from the AI.
 * Python data shape: VideoOutputData { url: string; mime_type: string }
 * Component wants: VideoOutputBlockProps { url: string; mimeType?: string }
 * TODO(python): rename mime_type → mimeType, or update component to use mime_type.
 */
export interface VideoOutputRenderBlock {
  type: "video_output";
  content: string;
  /** Python sends: { url: string; mime_type: string } — see VideoOutputData in stream-events.ts */
  data: {
    url: string;
    mime_type: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Web search results block.
 * Python data shape: SearchResultsData — see stream-events.ts
 */
export interface SearchResultsRenderBlock {
  type: "search_results";
  content: string;
  data: {
    results?: Array<{
      url?: string;
      title?: string;
      snippet?: string;
      published?: string | null;
      source?: string | null;
    }>;
    metadata?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Web search error block.
 * Python data shape: SearchErrorData — see stream-events.ts
 */
export interface SearchErrorRenderBlock {
  type: "search_error";
  content: string;
  data: {
    error: string;
    metadata?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Tool/function execution result.
 * Python data shape: FunctionResultData — see stream-events.ts
 * Component wants snake_case: function_name, duration_ms
 */
export interface FunctionResultRenderBlock {
  type: "function_result";
  content: string;
  data: {
    function_name: string;
    success: boolean;
    result?: unknown;
    error?: string | null;
    duration_ms?: number | null;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Workflow step status block.
 * Python data shape: WorkflowStepData — see stream-events.ts
 * Component wants snake_case: step_name
 */
export interface WorkflowStepRenderBlock {
  type: "workflow_step";
  content: string;
  data: {
    step_name: string;
    status: string;
    data?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Prompt categorization result.
 * Python data shape: CategorizationResultData — see stream-events.ts
 * Component wants snake_case: prompt_id, dry_run
 */
export interface CategorizationResultRenderBlock {
  type: "categorization_result";
  content: string;
  data: {
    prompt_id: string;
    category: string;
    tags?: string[];
    description?: string;
    dry_run?: boolean;
    metadata?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * URL fetch results.
 * Python data shape: FetchResultsData — see stream-events.ts
 */
export interface FetchResultsRenderBlock {
  type: "fetch_results";
  content: string;
  data: {
    results?: Array<{
      url?: string;
      title?: string;
      content?: string;
      status?: string;
    }>;
    metadata?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Podcast generation complete.
 * Python data shape: PodcastCompleteData — see stream-events.ts
 * Component wants snake_case: show_id, episode_count
 */
export interface PodcastCompleteRenderBlock {
  type: "podcast_complete";
  content: string;
  data: {
    show_id: string;
    success: boolean;
    episode_count?: number;
    error?: string | null;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Podcast generation stage.
 * Python data shape: PodcastStageData — see stream-events.ts
 * Component wants snake_case: result_keys
 */
export interface PodcastStageRenderBlock {
  type: "podcast_stage";
  content: string;
  data: {
    stage: string;
    success: boolean;
    error?: string | null;
    result_keys?: string[];
  };
  metadata?: Record<string, unknown>;
}

/**
 * Web scrape batch completion.
 * Python data shape: ScrapeBatchCompleteData — see stream-events.ts
 * Component wants snake_case: total_scraped
 */
export interface ScrapeBatchCompleteRenderBlock {
  type: "scrape_batch_complete";
  content: string;
  data: {
    total_scraped: number;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Warning about malformed structured input blocks.
 * Python data shape: StructuredInputWarningData — see stream-events.ts
 * Component wants snake_case: block_type
 */
export interface StructuredInputWarningRenderBlock {
  type: "structured_input_warning";
  content: string;
  data: {
    block_type: string;
    failures?: Array<{ url?: string; reason?: string }>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Questionnaire to display to the user (server-side rendered, not markdown-parsed).
 * Python data shape: QuestionnaireDisplayData — see stream-events.ts
 */
export interface DisplayQuestionnaireRenderBlock {
  type: "display_questionnaire";
  content: string;
  data: {
    introduction: string;
    questions?: Array<{
      id: string;
      prompt: string;
      component_type: string;
      options?: string[];
      min?: number | null;
      max?: number | null;
      step?: number | null;
      default?: unknown;
      required?: boolean;
    }>;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Fallback for data events whose type is not recognized.
 * The _dataType field preserves the original type string.
 */
export interface UnknownDataEventRenderBlock {
  type: "unknown_data_event";
  content: string;
  data: {
    _dataType: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Search-and-replace block for code editing.
 */
export interface SearchReplaceRenderBlock {
  type: "search_replace";
  content: string;
  data?: {
    search: string;
    replace: string;
    searchComplete: boolean;
    replaceComplete: boolean;
    isComplete: boolean;
    language?: string;
  };
  metadata?: Record<string, unknown>;
}

export type ServerOnlyRenderBlock =
  | AudioOutputRenderBlock
  | ImageOutputRenderBlock
  | VideoOutputRenderBlock
  | SearchResultsRenderBlock
  | SearchErrorRenderBlock
  | FunctionResultRenderBlock
  | WorkflowStepRenderBlock
  | CategorizationResultRenderBlock
  | FetchResultsRenderBlock
  | PodcastCompleteRenderBlock
  | PodcastStageRenderBlock
  | ScrapeBatchCompleteRenderBlock
  | StructuredInputWarningRenderBlock
  | DisplayQuestionnaireRenderBlock
  | UnknownDataEventRenderBlock
  | SearchReplaceRenderBlock;

export type ServerOnlyBlockType = ServerOnlyRenderBlock["type"];

/**
 * All block types that are NOT yet in TypedRenderBlock from stream-events.ts.
 * Use this in SplitterBlock and BlockWithServerData to cover the full type space.
 */
export type MissingRenderBlock = ClientOnlyRenderBlock | ServerOnlyRenderBlock;
export type MissingBlockType = MissingRenderBlock["type"];
