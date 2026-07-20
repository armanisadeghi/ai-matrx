/**
 * client-blocks.ts — the CLIENT-ONLY render-block vocabulary.
 *
 * OWNER: the markdown splitter (content-splitter-v2.ts, this directory).
 * These block types are produced ONLY by the frontend splitter from streamed/
 * persisted markdown — Python never emits them. If Python ever needs to send
 * one, add it to the server vocabulary
 * (aidream `matrx_connect/context/data_render_blocks.py` or
 * `render_blocks.py`), regenerate stream-events.ts, and delete it here.
 *
 * This file is deliberately hand-maintained (there is no server source to
 * generate it from) but it is NOT free-form: every type token here is
 * classified by the content-vocab crosswalk
 * (scripts/shape/content-vocab-crosswalk.json — regenerate with
 * `pnpm check:shapes:crosswalk:refresh`). Adding a type without a crosswalk
 * classification rule fails `pnpm check:shapes:crosswalk`.
 *
 * The server-synthesized twin vocabulary (audio_output, function_result, …)
 * is GENERATED into types/python-generated/stream-events.ts
 * (ServerOnlyRenderBlock / ServerOnlyBlockType) — both replaced the retired
 * hand-maintained types/python-generated/missing-types.ts drift patch.
 */

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
 * (e.g. `[Audio URL: …]` or a standalone `….mp3` link). Mirrors the typed
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

/** Interactive Leaflet map from a ```map JSON spec (markers/places). Client-only. */
export interface MapRenderBlock {
  type: "map";
  content: string;
  metadata?: Record<string, unknown>;
}

/** KPI / headline-metric cards from a ```stats JSON spec. Client-only. */
export interface StatsRenderBlock {
  type: "stats";
  content: string;
  metadata?: Record<string, unknown>;
}

/** Before/after diff from a ```diff JSON spec ({old,new}). Client-only. */
export interface DiffRenderBlock {
  type: "diff";
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
 * A playable YouTube embed parsed from a YouTube link in streamed/persisted
 * text — a linked thumbnail `[![alt](thumb)](yt-url)`, a plain `[text](yt-url)`
 * link, or a bare YouTube URL on its own line. The splitter extracts the video
 * id + start offset onto `metadata` (videoId/start/title/poster) and keeps the
 * original line on `content` so it survives the DB round-trip. The server twin
 * is the `media_block(kind: "youtube")` render block — both render through the
 * single `features/files/blocks/youtube/YouTubeEmbed` component. See
 * content-splitter-v2.ts `detectYoutubeMarkdown`.
 */
export interface YoutubeRenderBlock {
  type: "youtube";
  content: string;
  src?: string;
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
 * Classified PROTOCOL in the crosswalk (drives a side-effecting apply flow).
 * See features/agents/components/schema-proposal/.
 */
export interface SchemaProposalRenderBlock {
  type: "schema_proposal";
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * A reference to one of OUR OWN files (a cld_files-backed signed S3 URL, a
 * public CDN URL or a share-link byte endpoint)
 * found as a plain markdown link / bare URL in streamed/persisted text. Unlike
 * `image`/`audio`/`video` blocks this carries NO declared type — the renderer
 * recovers a `file_id` (or other `FileSource`) via `recognizeOurFileUrl`,
 * discovers the real file type (sniffed from the URL or by hydrating the
 * cld_files row), and renders the universal inline previewer. Signed URLs
 * auto-re-mint through the file handler. On any failure it degrades to the
 * original markdown link. The original line stays on `content` so it survives
 * the DB round-trip and re-detects on reload. Client-only — see
 * content-splitter-v2.ts `detectMatrxFileMarkdown` +
 * components/mardown-display/blocks/matrx-file/MatrxFileBlock.tsx.
 */
export interface MatrxFileRenderBlock {
  type: "matrx_file";
  content: string;
  src?: string;
  alt?: string;
  metadata?: Record<string, unknown>;
}

export type ClientOnlyRenderBlock =
  | TreeRenderBlock
  | AccentDividerRenderBlock
  | HeavyDividerRenderBlock
  | AudioRenderBlock
  | SvgRenderBlock
  | ChartRenderBlock
  | MapRenderBlock
  | StatsRenderBlock
  | DiffRenderBlock
  | ItemPresentationRenderBlock
  | YoutubeRenderBlock
  | MatrxEnvelopeRenderBlock
  | SchemaProposalRenderBlock
  | MatrxFileRenderBlock;

export type ClientOnlyBlockType = ClientOnlyRenderBlock["type"];
