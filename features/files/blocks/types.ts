/**
 * features/files/blocks/types.ts
 *
 * THE canonical TypeScript shape for every piece of media (image / video /
 * audio / document / youtube) in the app — the FE mirror of Python's
 * `UnifiedMediaBlock` Pydantic union. See:
 *   - docs/PYTHON_UPDATES.md       — Phase 0/1/2 wire contract & migration plan
 *   - features/files/blocks/image/UNIFIED_IMAGE_BLOCK.md — backstory
 *   - packages/matrx-connect/matrx_connect/context/media_block.py (backend)
 *
 * Naming convention:
 *   - This file uses **camelCase** (TS domain shape).
 *   - The wire shape (`MediaBlockData.block` in stream events,
 *     `cld_files.metadata.generation` on assets) uses **snake_case**.
 *   - The adapter `./adapters/from-media-block.ts` converts the wire shape
 *     to this shape at the boundary. Components only ever see camelCase.
 *
 * Two discriminators:
 *   - `kind`   : "image" | "video" | "audio" | "document" | "youtube"
 *                Narrow on this first to access kind-specific fields
 *                (e.g. `width`/`height` on image, `durationMs` on audio).
 *   - `origin` : "matrx" | "external"
 *                Narrow on this second to access ownership-specific fields
 *                (`fileId` on matrx, `externalUrl` on external).
 *
 * Invariants (enforced at adapter boundary):
 *   1. `origin === "matrx"`  → `fileId` non-null when `status === "complete"`.
 *   2. `origin === "external"` → `externalUrl` non-null OR `base64` non-null.
 *   3. `status === "streaming"` → `base64` non-null (in-flight bytes).
 *   4. `status === "error"` → `errorMessage` non-null.
 */

// ─── Discriminator alphabets ────────────────────────────────────────────────

export type MediaKind = "image" | "video" | "audio" | "document" | "youtube";
export type MediaOrigin = "matrx" | "external";
export type MediaStatus = "complete" | "streaming" | "error";
export type MediaVisibility = "public" | "private" | "shared";

// ─── Cross-cutting base (every block carries these) ─────────────────────────

interface MediaBlockBase {
  /**
   * "complete"   — final media; all configured URLs are valid as of emission
   * "streaming"  — generating; `base64` (partial preview) is the only render source
   * "error"      — generation failed; `errorMessage` carries the reason
   */
  status: MediaStatus;
  /** 0–1 progress. Meaningful only when status === "streaming". */
  progress: number | null;
  /** Populated when status === "error". null otherwise. */
  errorMessage: string | null;

  // ── Bytes-level metadata ─────────────────────────────────────────────────
  /** Canonical MIME `type/subtype`. */
  mimeType: string | null;
  /** Display name (often AI-generated for ai-produced media). */
  fileName: string | null;
  /**
   * File size in bytes (renamed from `file_size` in Phase 0 — see
   * docs/PYTHON_UPDATES.md §3). null when unknown (typical for streaming
   * partials and pre-finalize states).
   */
  sizeBytes: number | null;
  /**
   * Inline base64 bytes. Used for streaming partials and tiny inline assets.
   * Cleared once `status === "complete"` and a URL is available.
   */
  base64: string | null;

  /**
   * Free-form. Phase 2 stamps `metadata.generation` (typed as
   * `MediaGenerationMetadata` below) for any AI-generated asset.
   * Existing top-level keys (`model`, `provider`, `prompt`, `cost`) are
   * preserved for back-compat — new code should read `metadata.generation`.
   */
  metadata: Record<string, unknown> | null;
}

// ─── Origin halves (cross-cut every kind) ───────────────────────────────────

/**
 * Fields present on every matrx-owned (cld_files-backed) media block.
 * Always carries `fileId` + `fileUri` so the URL resolver can re-mint
 * signed URLs on expiry without a server round-trip beyond fileHandler.
 */
interface MatrxOriginFields {
  origin: "matrx";

  /** cld_files.id — the permanent identity. */
  fileId: string;
  /** cld_files.storage_uri — `s3://bucket/key`. Immutable; survives URL churn. */
  fileUri: string;
  /**
   * cld_files.canonical_storage_uri — the editable canonical version when
   * different from `fileUri`. null when no separate canonical exists.
   */
  canonicalFileUri: string | null;
  /**
   * cld_files.visibility — drives URL resolution:
   *   "public"  — prefer cdnUrl; permanent URL, never re-minted
   *   "private" — must use signedUrl; re-minted lazily on next access when expired
   *   "shared"  — same minting rules as private
   */
  visibility: MediaVisibility;

  // ── URL flavors. Resolver picks the best at render time. ─────────────────
  /** Permanent CDN URL — no expiry, no auth required. */
  cdnUrl: string | null;
  /** Short-lived presigned URL (typical TTL: 1h). */
  signedUrl: string | null;
  /** Attachment-disposition variant. Used for the download action. */
  downloadUrl: string | null;
  /**
   * Ms epoch when `signedUrl` becomes invalid. Server now stamps this
   * directly (Phase 0, see docs/PYTHON_UPDATES.md §4). The URL resolver
   * uses this to schedule a refresh ~30s before. null when only a CDN
   * URL was minted (public files served via CDN don't expire).
   */
  signedUrlExpiresAt: number | null;

  // ── Lineage hints ────────────────────────────────────────────────────────
  /** cld_files.parent_file_id — derivation lineage. */
  parentFileId: string | null;
  /**
   * cld_files.derivation_kind — how this was produced from `parentFileId`.
   * E.g. "manual_upload", "extracted_pages", "cropped", "rendered_page_image".
   */
  derivationKind: string | null;

  // ── Thumbnails ───────────────────────────────────────────────────────────
  // Phase 1b removed `thumbnail_url` + `thumbnail_uri` from the wire shape.
  // The canonical source is now `Asset.variants["thumbnail_url"].url` via
  // `GET /assets/{file_id}`. See docs/PYTHON_UPDATES.md "Phase 1b".
  //
  // For TOP-LEVEL listings, `FileRecord.thumbnail_url` (one field on the
  // REST response) is still populated by the backend resolver and lifts
  // onto `CloudFile.thumbnailUrl` for grid / picker components. That field
  // lives on `CloudFile`, not on the media block — a block represents an
  // image you're rendering, not a generic file listing.
}

/**
 * Fields present on every external (third-party / user-pasted) media block.
 * We never refresh these and never try to mint fresh URLs.
 */
interface ExternalOriginFields {
  origin: "external";
  /** The external URL. Always present — empty string fallback means broken. */
  externalUrl: string;
  /** Optional provenance label — e.g. "Wikimedia", "Tool: web_search". */
  sourceLabel: string | null;
}

// ─── Kind-specific fields ───────────────────────────────────────────────────

interface ImageKindFields {
  kind: "image";
  /** Pixel width. Null when unknown / pre-finalize. */
  width: number | null;
  /** Pixel height. Null when unknown / pre-finalize. */
  height: number | null;
  /**
   * Optional content-class hint from vision models — e.g. "photograph",
   * "diagram", "ui-screenshot". Free-form; consumers should treat as a UI
   * hint only.
   */
  visionClass: string | null;
}

interface VideoKindFields {
  kind: "video";
  width: number | null;
  height: number | null;
  /** Duration in milliseconds. */
  durationMs: number | null;
  /**
   * Poster/cover frame URL (extracted at ~10% of timeline). Phase 1
   * populates this for matrx-owned videos via `Asset.variants["poster_url"]`.
   */
  posterUrl: string | null;
}

interface AudioKindFields {
  kind: "audio";
  /** Duration in milliseconds. */
  durationMs: number | null;
  /**
   * Inline transcript text when present. Long-form transcripts go in a
   * separate processed_documents row; this carries the short-form summary
   * or null.
   */
  transcript: string | null;
}

interface DocumentKindFields {
  kind: "document";
  /** Page count for paginated documents (PDF, DOCX, …). null otherwise. */
  pageCount: number | null;
  /**
   * Page-1 preview rendered to image. Phase 1 populates this for PDFs.
   * Useful when displaying an inline document chip.
   */
  page1Url: string | null;
}

interface YouTubeKindFields {
  kind: "youtube";
  /** Extracted YouTube video id (the `?v=` token). */
  videoId: string | null;
}

// ─── Cross-product variants (kind × origin) ─────────────────────────────────
// Each kind has matrx + external variants so consumers can narrow on either
// discriminator. YouTube is always external (no FE upload path).

export type MatrxImageBlock = MediaBlockBase &
  MatrxOriginFields &
  ImageKindFields;
export type ExternalImageBlock = MediaBlockBase &
  ExternalOriginFields &
  ImageKindFields;
export type ImageBlock = MatrxImageBlock | ExternalImageBlock;

export type MatrxVideoBlock = MediaBlockBase &
  MatrxOriginFields &
  VideoKindFields;
export type ExternalVideoBlock = MediaBlockBase &
  ExternalOriginFields &
  VideoKindFields;
export type VideoBlock = MatrxVideoBlock | ExternalVideoBlock;

export type MatrxAudioBlock = MediaBlockBase &
  MatrxOriginFields &
  AudioKindFields;
export type ExternalAudioBlock = MediaBlockBase &
  ExternalOriginFields &
  AudioKindFields;
export type AudioBlock = MatrxAudioBlock | ExternalAudioBlock;

export type MatrxDocumentBlock = MediaBlockBase &
  MatrxOriginFields &
  DocumentKindFields;
export type ExternalDocumentBlock = MediaBlockBase &
  ExternalOriginFields &
  DocumentKindFields;
export type DocumentBlock = MatrxDocumentBlock | ExternalDocumentBlock;

/** YouTube is always external per the Python contract. */
export type YouTubeBlock = MediaBlockBase &
  ExternalOriginFields &
  YouTubeKindFields;

/**
 * The unified discriminated union for every media reference in the app.
 *
 * Narrowing recipe:
 *   if (block.kind === "image") {
 *     if (block.origin === "matrx") {
 *       // block.fileId, block.fileUri, block.visibility, block.cdnUrl, ...
 *     } else {
 *       // block.externalUrl, block.sourceLabel
 *     }
 *     // block.width, block.height (image-specific)
 *   }
 */
export type UnifiedMediaBlock =
  | ImageBlock
  | VideoBlock
  | AudioBlock
  | DocumentBlock
  | YouTubeBlock;

// ─── Generation metadata (Phase 2 contract) ─────────────────────────────────
//
// Provider-agnostic shape stamped onto `metadata.generation` for every
// AI-generated media file. Read directly from `block.metadata?.generation`.
//
// Field names are camelCase here (domain shape); the wire shape uses
// snake_case. See `MediaGenerationMetadataWire` below for the raw wire
// shape and the FE convenience converter `parseGenerationMetadata`.

export type MediaGenerationKind =
  | "image"
  | "video"
  | "audio"
  | "speech"
  | "music";

export interface MediaGenerationMetadata {
  // ── Identity ────────────────────────────────────────────────────────────
  kind: MediaGenerationKind;
  provider: string;
  model: string;

  // ── Request ─────────────────────────────────────────────────────────────
  prompt: string;
  negativePrompt: string | null;
  /**
   * Provider's rewrite of the user's prompt (OpenAI's `revised_prompt`).
   * Surface to the user — improves transparency and trust.
   */
  revisedPrompt: string | null;

  // ── Output shape (normalized across providers) ──────────────────────────
  width: number | null;
  height: number | null;
  /** Free-form, e.g. "16:9", "1:1", "9:16". */
  aspectRatio: string | null;
  durationSeconds: number | null;

  // ── Generation knobs (provider support varies) ──────────────────────────
  quality: string | null;
  style: string | null;
  seed: number | null;
  steps: number | null;
  cfgScale: number | null;
  nRequested: number;
  nReturned: number;

  // ── Operational ─────────────────────────────────────────────────────────
  responseId: string | null;
  durationMs: number | null;
  costUsd: number | null;
  /** E.g. "completed", "content_filter", "error". */
  finishReason: string | null;
  safetyFlagged: boolean;

  /** Catch-all for provider-native fields we haven't canonicalized yet. */
  providerExtras: Record<string, unknown>;
}

/**
 * Wire shape (snake_case) as Python emits it. Adapters read this; consumers
 * generally don't.
 */
export interface MediaGenerationMetadataWire {
  kind: MediaGenerationKind;
  provider: string;
  model: string;
  prompt: string;
  negative_prompt?: string | null;
  revised_prompt?: string | null;
  width?: number | null;
  height?: number | null;
  aspect_ratio?: string | null;
  duration_seconds?: number | null;
  quality?: string | null;
  style?: string | null;
  seed?: number | null;
  steps?: number | null;
  cfg_scale?: number | null;
  n_requested?: number;
  n_returned?: number;
  response_id?: string | null;
  duration_ms?: number | null;
  cost_usd?: number | null;
  finish_reason?: string | null;
  safety_flagged?: boolean;
  provider_extras?: Record<string, unknown>;
}

/**
 * Pull the typed `MediaGenerationMetadata` out of a block's free-form
 * metadata bag. Returns null when no `generation` key is present.
 *
 * Usage:
 *   const gen = parseGenerationMetadata(block.metadata);
 *   if (gen?.revisedPrompt) { renderRevisedPromptBanner(gen.revisedPrompt); }
 */
export function parseGenerationMetadata(
  metadata: Record<string, unknown> | null | undefined,
): MediaGenerationMetadata | null {
  if (!metadata) return null;
  const raw = metadata.generation;
  if (!raw || typeof raw !== "object") return null;
  const w = raw as MediaGenerationMetadataWire;
  if (typeof w.kind !== "string") return null;
  if (typeof w.provider !== "string") return null;
  if (typeof w.model !== "string") return null;
  if (typeof w.prompt !== "string") return null;
  return {
    kind: w.kind,
    provider: w.provider,
    model: w.model,
    prompt: w.prompt,
    negativePrompt: w.negative_prompt ?? null,
    revisedPrompt: w.revised_prompt ?? null,
    width: w.width ?? null,
    height: w.height ?? null,
    aspectRatio: w.aspect_ratio ?? null,
    durationSeconds: w.duration_seconds ?? null,
    quality: w.quality ?? null,
    style: w.style ?? null,
    seed: w.seed ?? null,
    steps: w.steps ?? null,
    cfgScale: w.cfg_scale ?? null,
    nRequested: w.n_requested ?? 1,
    nReturned: w.n_returned ?? 1,
    responseId: w.response_id ?? null,
    durationMs: w.duration_ms ?? null,
    costUsd: w.cost_usd ?? null,
    finishReason: w.finish_reason ?? null,
    safetyFlagged: w.safety_flagged ?? false,
    providerExtras: w.provider_extras ?? {},
  };
}
