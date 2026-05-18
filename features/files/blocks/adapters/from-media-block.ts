/**
 * features/files/blocks/adapters/from-media-block.ts
 *
 * THE primary inbound adapter for the new `data.type === "media_block"`
 * stream event (Phase 0 of Python's unified-media rollout — see
 * docs/PYTHON_UPDATES.md).
 *
 * The wire shape (Python's `UnifiedMediaBlock` Pydantic union) is
 * snake_case and nearly identical to our domain shape. This adapter does
 * exactly two things:
 *   1. Rename fields snake_case → camelCase.
 *   2. Enforce invariants:
 *        - matrx → fileId + fileUri non-null
 *        - external → externalUrl non-null
 *      Anything that doesn't satisfy these falls through to an external
 *      "broken" block; the renderer shows an error state.
 *
 * Anything kind-specific (image's `vision_class`, video's `duration_ms`,
 * etc.) is just propagated — no per-kind logic here.
 *
 * Note: Python `main` hasn't deployed yet (as of 2026-05-16). The shape
 * below is what we'll receive once it does. Until then this adapter is
 * cold-path; the existing `image_output` / `partial_image` legacy
 * adapters carry traffic.
 */

import type {
  AudioBlock,
  DocumentBlock,
  ExternalAudioBlock,
  ExternalDocumentBlock,
  ExternalImageBlock,
  ExternalVideoBlock,
  ImageBlock,
  MatrxAudioBlock,
  MatrxDocumentBlock,
  MatrxImageBlock,
  MatrxVideoBlock,
  MediaStatus,
  MediaVisibility,
  UnifiedMediaBlock,
  VideoBlock,
  YouTubeBlock,
} from "../types";

// ─── Wire shape (snake_case mirror of Python's UnifiedMediaBlock) ───────────
//
// Hand-typed because the Python-generated `stream-events.ts` doesn't yet
// emit these — the new types will appear after the backend redeploys.
// This file owns the source-of-truth shape until then.

interface WireMediaBlockBase {
  origin: "matrx" | "external";
  status?: MediaStatus | null;
  progress?: number | null;
  error_message?: string | null;
  mime_type?: string | null;
  file_name?: string | null;
  size_bytes?: number | null;
  base64?: string | null;
  metadata?: Record<string, unknown> | null;

  // Matrx-only
  file_id?: string | null;
  file_uri?: string | null;
  canonical_file_uri?: string | null;
  visibility?: MediaVisibility | null;
  cdn_url?: string | null;
  signed_url?: string | null;
  download_url?: string | null;
  signed_url_expires_at?: number | null;
  parent_file_id?: string | null;
  derivation_kind?: string | null;
  // Phase 1b: `thumbnail_url` + `thumbnail_uri` removed from the wire.
  // The canonical source is `Asset.variants["thumbnail_url"].url`.

  // External-only
  external_url?: string | null;
  source_label?: string | null;
}

interface WireImageBlock extends WireMediaBlockBase {
  kind: "image";
  width?: number | null;
  height?: number | null;
  vision_class?: string | null;
}

interface WireVideoBlock extends WireMediaBlockBase {
  kind: "video";
  width?: number | null;
  height?: number | null;
  duration_ms?: number | null;
  poster_url?: string | null;
}

interface WireAudioBlock extends WireMediaBlockBase {
  kind: "audio";
  duration_ms?: number | null;
  transcript?: string | null;
}

interface WireDocumentBlock extends WireMediaBlockBase {
  kind: "document";
  page_count?: number | null;
  page1_url?: string | null;
}

interface WireYouTubeBlock extends WireMediaBlockBase {
  kind: "youtube";
  video_id?: string | null;
}

export type WireMediaBlock =
  | WireImageBlock
  | WireVideoBlock
  | WireAudioBlock
  | WireDocumentBlock
  | WireYouTubeBlock;

/**
 * Wire shape for the `media_block` stream event envelope. Always has
 * `type: "media_block"` and a `block: WireMediaBlock` payload.
 */
export interface WireMediaBlockData {
  type: "media_block";
  block: WireMediaBlock;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pickStatus(s?: MediaStatus | null): MediaStatus {
  return s === "streaming" || s === "error" ? s : "complete";
}

function pickVisibility(v?: MediaVisibility | null): MediaVisibility {
  // Default unknown/null visibility to `private` — matches the
  // `dbRowToCloudFile` and `from-cld-files-row.ts` defaults so a matrx
  // block arriving with a missing visibility doesn't get accidentally
  // promoted to public.
  if (v === "public" || v === "shared") return v;
  return "private";
}

/**
 * Pull the fields shared by every kind, regardless of origin.
 */
function commonFields(wire: WireMediaBlockBase) {
  return {
    status: pickStatus(wire.status),
    progress: wire.progress ?? null,
    errorMessage: wire.error_message ?? null,
    mimeType: wire.mime_type ?? null,
    fileName: wire.file_name ?? null,
    sizeBytes: wire.size_bytes ?? null,
    base64: wire.base64 ?? null,
    metadata: wire.metadata ?? null,
  };
}

/**
 * Pull every matrx-origin field. Returns null when the wire block isn't
 * a complete matrx record (fileId / fileUri missing).
 */
function matrxFields(wire: WireMediaBlockBase): {
  origin: "matrx";
  fileId: string;
  fileUri: string;
  canonicalFileUri: string | null;
  visibility: MediaVisibility;
  cdnUrl: string | null;
  signedUrl: string | null;
  downloadUrl: string | null;
  signedUrlExpiresAt: number | null;
  parentFileId: string | null;
  derivationKind: string | null;
} | null {
  if (wire.origin !== "matrx") return null;
  if (!wire.file_id || !wire.file_uri) return null;
  return {
    origin: "matrx",
    fileId: wire.file_id,
    fileUri: wire.file_uri,
    canonicalFileUri: wire.canonical_file_uri ?? null,
    visibility: pickVisibility(wire.visibility),
    cdnUrl: wire.cdn_url ?? null,
    signedUrl: wire.signed_url ?? null,
    downloadUrl: wire.download_url ?? null,
    signedUrlExpiresAt: wire.signed_url_expires_at ?? null,
    parentFileId: wire.parent_file_id ?? null,
    derivationKind: wire.derivation_kind ?? null,
  };
}

function externalFields(wire: WireMediaBlockBase): {
  origin: "external";
  externalUrl: string;
  sourceLabel: string | null;
} {
  return {
    origin: "external",
    externalUrl: wire.external_url ?? "",
    sourceLabel: wire.source_label ?? null,
  };
}

// ─── Kind-specific lifting ──────────────────────────────────────────────────

function liftImage(wire: WireImageBlock): ImageBlock {
  const common = commonFields(wire);
  const matrx = matrxFields(wire);
  const imageBits = {
    kind: "image" as const,
    width: wire.width ?? null,
    height: wire.height ?? null,
    visionClass: wire.vision_class ?? null,
  };
  if (matrx) {
    const block: MatrxImageBlock = { ...common, ...matrx, ...imageBits };
    return block;
  }
  const block: ExternalImageBlock = {
    ...common,
    ...externalFields(wire),
    ...imageBits,
  };
  return block;
}

function liftVideo(wire: WireVideoBlock): VideoBlock {
  const common = commonFields(wire);
  const matrx = matrxFields(wire);
  const videoBits = {
    kind: "video" as const,
    width: wire.width ?? null,
    height: wire.height ?? null,
    durationMs: wire.duration_ms ?? null,
    posterUrl: wire.poster_url ?? null,
  };
  if (matrx) {
    const block: MatrxVideoBlock = { ...common, ...matrx, ...videoBits };
    return block;
  }
  const block: ExternalVideoBlock = {
    ...common,
    ...externalFields(wire),
    ...videoBits,
  };
  return block;
}

function liftAudio(wire: WireAudioBlock): AudioBlock {
  const common = commonFields(wire);
  const matrx = matrxFields(wire);
  const audioBits = {
    kind: "audio" as const,
    durationMs: wire.duration_ms ?? null,
    transcript: wire.transcript ?? null,
  };
  if (matrx) {
    const block: MatrxAudioBlock = { ...common, ...matrx, ...audioBits };
    return block;
  }
  const block: ExternalAudioBlock = {
    ...common,
    ...externalFields(wire),
    ...audioBits,
  };
  return block;
}

function liftDocument(wire: WireDocumentBlock): DocumentBlock {
  const common = commonFields(wire);
  const matrx = matrxFields(wire);
  const docBits = {
    kind: "document" as const,
    pageCount: wire.page_count ?? null,
    page1Url: wire.page1_url ?? null,
  };
  if (matrx) {
    const block: MatrxDocumentBlock = { ...common, ...matrx, ...docBits };
    return block;
  }
  const block: ExternalDocumentBlock = {
    ...common,
    ...externalFields(wire),
    ...docBits,
  };
  return block;
}

function liftYouTube(wire: WireYouTubeBlock): YouTubeBlock {
  // YouTube is always external per the Python contract.
  const common = commonFields(wire);
  const block: YouTubeBlock = {
    ...common,
    ...externalFields(wire),
    kind: "youtube",
    videoId: wire.video_id ?? null,
  };
  return block;
}

// ─── Public entry point ─────────────────────────────────────────────────────

/**
 * Lift a wire-shape `UnifiedMediaBlock` (as emitted by Python's new
 * `media_block` data event) into our domain `UnifiedMediaBlock` shape.
 *
 * Discriminates on `kind` and delegates to the kind-specific lifter.
 * Each lifter handles the matrx-vs-external origin split internally.
 */
export function fromMediaBlock(wire: WireMediaBlock): UnifiedMediaBlock {
  switch (wire.kind) {
    case "image":
      return liftImage(wire);
    case "video":
      return liftVideo(wire);
    case "audio":
      return liftAudio(wire);
    case "document":
      return liftDocument(wire);
    case "youtube":
      return liftYouTube(wire);
    default: {
      // Defensive fallback — Python adds a new kind we don't know yet.
      // Surface it as an external image with the original metadata so
      // nothing is dropped silently.
      const base = wire as WireMediaBlockBase;
      const unknownKind = (wire as { kind: string }).kind;
      const fallback: ExternalImageBlock = {
        ...commonFields(base),
        ...externalFields(base),
        kind: "image",
        width: null,
        height: null,
        visionClass: null,
        metadata: {
          ...(base.metadata ?? {}),
          _unknown_media_kind: unknownKind,
        },
        errorMessage: `Unsupported media kind: ${unknownKind}`,
        status: "error",
      };
      return fallback;
    }
  }
}

/**
 * Predicate for narrowing a raw `data` payload (typed as
 * `Record<string, unknown>` in Redux) down to a `media_block` event.
 *
 * Use at the stream-event boundary:
 *   if (isMediaBlockData(d)) { upsert(fromMediaBlock(d.block)); }
 */
export function isMediaBlockData(value: unknown): value is WireMediaBlockData {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.type !== "media_block") return false;
  if (!v.block || typeof v.block !== "object") return false;
  const b = v.block as Record<string, unknown>;
  return typeof b.kind === "string" && typeof b.origin === "string";
}
