/**
 * features/file-handler/types.ts
 *
 * The universal file handler. ONE shape goes in (FileSource), ONE shape
 * comes out (FileTarget). Between them, every file in the app — owned
 * cld_files row, blob from a paste, signed URL we found, base64 string,
 * external URL — funnels through the same NormalizedFile representation
 * so the core never branches on origin.
 *
 * Every callsite that touches a file MUST go through this feature. Direct
 * construction of ImageBlock/AudioBlock/VideoBlock/DocumentBlock literals,
 * direct Supabase Storage calls, and ad-hoc useState-based signed-URL
 * timers are all banned by ESLint (see .eslintrc).
 */

import type {
  CloudFile,
  FileUploadResponse,
  MediaRef,
  PermissionLevel,
  Visibility,
} from "@/features/files/types";
import type {
  FileCategory,
  PreviewKind,
  ThumbnailStrategy,
} from "@/features/files/utils/file-types";
import type {
  AudioBlock,
  DocumentBlock,
  ImageBlock,
  VideoBlock,
  YouTubeVideoBlock,
} from "@/features/agents/types/message-types";
import type { MessagePart } from "@/types/python-generated/stream-events";

// ===========================================================================
// FileSource — every shape we accept on the way IN
// ===========================================================================

/**
 * Discriminated union of every file shape that can enter the handler.
 *
 * Resolution priority enforced by the resolver: owned identifiers
 * (`cloud_file`, `file_id`) beat opaque URLs (`signed_url`, `share_link`)
 * beat raw bytes (`blob`, `file`, `data_uri`, ...). Two locators on the
 * same source are tolerated; the resolver picks the best.
 */
export type FileSource =
  // Raw bytes — no server identity yet
  | BlobSource
  | FileObjectSource
  | BufferSource_
  | StreamSource
  | DataUriSource
  | Base64Source

  // External — bytes we don't own
  | ExternalUrlSource
  | YouTubeSource

  // Owned identifiers — preferred
  | CloudFileSource
  | FileIdSource
  | FileUriSource

  // Server-issued, time-bounded
  | SignedUrlSource
  | ShareLinkSource
  | PublicCdnSource

  // Just-completed upload (legacy compat with existing callsites)
  | UploadResultSource

  // Stream events — server-emitted file references arriving mid-stream
  | StreamEventSource;

export interface BlobSource {
  kind: "blob";
  blob: Blob;
  fileName?: string;
  mime?: string;
}

export interface FileObjectSource {
  kind: "file";
  file: File;
}

export interface BufferSource_ {
  kind: "buffer";
  buffer: ArrayBuffer | Uint8Array;
  mime: string;
  fileName?: string;
}

export interface StreamSource {
  kind: "stream";
  stream: ReadableStream<Uint8Array>;
  mime: string;
  fileName?: string;
}

export interface DataUriSource {
  kind: "data_uri";
  dataUri: string;
}

export interface Base64Source {
  kind: "base64";
  base64: string;
  mime: string;
  fileName?: string;
}

export interface ExternalUrlSource {
  kind: "external_url";
  url: string;
  mime?: string;
}

export interface YouTubeSource {
  kind: "youtube";
  url: string;
}

export interface CloudFileSource {
  kind: "cloud_file";
  cloudFile: CloudFile;
}

export interface FileIdSource {
  kind: "file_id";
  fileId: string;
  mime?: string;
}

export interface FileUriSource {
  kind: "file_uri";
  fileUri: string;
  mime?: string;
}

export interface SignedUrlSource {
  kind: "signed_url";
  url: string;
  expiresAt?: number;
  fileId?: string;
  mime?: string;
}

export interface ShareLinkSource {
  kind: "share_link";
  token: string;
  mime?: string;
}

export interface PublicCdnSource {
  kind: "public_cdn";
  url: string;
  fileId?: string;
  mime?: string;
}

/** Legacy-compat shape from `components/ui/file-upload/useFileUploadWithStorage`. */
export interface UploadResultSource {
  kind: "upload_result";
  uploadResult: {
    fileId?: string;
    url: string;
    pageUrl?: string;
    type?: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Stream event payload. The handler unwraps RenderBlock/data/tool-output
 * envelopes and produces a NormalizedFile. The shape mirrors the
 * `TypedDataPayload` discriminator for image_output/audio_output/video_output
 * plus the structured render-block payload for type=image/video/document.
 */
export interface StreamEventSource {
  kind: "stream_event";
  payload: unknown;
}

// ===========================================================================
// NormalizedFile — the one shape the core operates on
// ===========================================================================

/**
 * The canonical internal shape. After normalization, every code path past
 * the resolver sees only this. There is no second internal shape — adding
 * one would defeat the entire purpose of the handler.
 */
export interface NormalizedFile {
  /** cld_files UUID — set whenever known. */
  fileId?: string;
  /** Native cloud URI — `s3://`, `gs://`, `supabase://`. */
  fileUri?: string;
  /** Any URL safe to hand to the browser. */
  url?: string;
  /** Inline base64. Last resort. Always include `meta.mime`. */
  base64?: string;
  /** Resolved share-link token, when the source was a share link. */
  shareToken?: string;
  /** YouTube videos are first-class — backend has dedicated handling. */
  youtubeUrl?: string;

  origin: FileOrigin;
  capabilities: FileCapabilities;
  meta: FileMeta;
  lifecycle: FileLifecycle;
  scope: FileScope;
  derivedFrom?: { fileId: string; kind: string };

  /**
   * Original input — kept so we can re-resolve, refresh, or diagnose.
   * Never read this from a render path; use the normalized fields.
   */
  __source: FileSource;
}

export type FileOrigin =
  | "owned"
  | "shared"
  | "public"
  | "external"
  | "ephemeral"
  | "anonymous_public";

export interface FileCapabilities {
  canRead: boolean;
  canEdit: boolean;
  canShare: boolean;
  canDelete: boolean;
  /** True when the consumer needs to hold a JWT to open this URL. */
  requiresAuth: boolean;
  /**
   * False for raw signed S3 URLs (CORS-blocked for `fetch()`). Output
   * adapters that need bytes route through the same-origin proxy when
   * this is false.
   */
  transportSafeForFetch: boolean;
}

export interface FileMeta {
  fileName?: string;
  mime?: string;
  sizeBytes?: number;
  checksum?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  pageCount?: number;
  category: FileCategory;
  previewKind: PreviewKind;
  thumbnailStrategy: ThumbnailStrategy;
}

export interface FileLifecycle {
  /** ms epoch — only set for time-bounded references. */
  expiresAt?: number;
  /** True if we have enough identity to re-mint a fresh URL. */
  refreshable: boolean;
  /** ms epoch of the last full re-validation. */
  lastVerifiedAt?: number;
  /** True once the file is durably persisted (vs in-flight upload). */
  persisted: boolean;
}

export interface FileScope {
  ownerId?: string;
  organizationId?: string;
  projectId?: string;
  taskId?: string;
}

// ===========================================================================
// FileTarget — every shape we emit on the way OUT
// ===========================================================================

/**
 * Discriminated union of every consumer surface. The output dispatcher picks
 * the optimal locator on the NormalizedFile for each target — `<img src>`
 * prefers a permanent CDN URL, `fetchable_url` prefers the same-origin proxy
 * for CORS safety, AI media blocks prefer `file_id`.
 */
export type FileTarget =
  | { kind: "media_block" }
  | { kind: "media_ref" }
  | { kind: "html_src" }
  | { kind: "fetchable_url" }
  | { kind: "blob" }
  | { kind: "data_uri" }
  | { kind: "form_data_part"; field: string }
  | { kind: "anchor_download"; suggestedName?: string }
  | { kind: "og_image" }
  | { kind: "jsonb_content_part" }
  | { kind: "rag_ingest_source" };

export type RenderedFor<T extends FileTarget> = T extends { kind: "media_block" }
  ? MediaBlock
  : T extends { kind: "media_ref" }
    ? MediaRef
    : T extends { kind: "html_src" }
      ? string
      : T extends { kind: "fetchable_url" }
        ? string
        : T extends { kind: "blob" }
          ? Blob
          : T extends { kind: "data_uri" }
            ? string
            : T extends { kind: "form_data_part" }
              ? { value: Blob; filename: string }
              : T extends { kind: "anchor_download" }
                ? { url: string; filename: string }
                : T extends { kind: "og_image" }
                  ? string
                  : T extends { kind: "jsonb_content_part" }
                    ? MessagePart
                    : T extends { kind: "rag_ingest_source" }
                      ? RagIngestSource
                      : never;

/** All four media block types plus YouTube — what AI APIs accept. */
export type MediaBlock =
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | DocumentBlock
  | YouTubeVideoBlock;

export interface RagIngestSource {
  source_kind: "cld_file" | "external_url" | "inline";
  source_id?: string;
  url?: string;
  inline?: { mime: string; bytes: Uint8Array };
}

// ===========================================================================
// Upload options — Phase 3 write path
// ===========================================================================

export interface UploadOpts {
  /**
   * Logical folder path. Backend creates intermediate folders atomically.
   * If omitted, defaults to a per-feature inbox like "Inbox/Pasted".
   */
  folderPath?: string;
  /** Visibility on the new cld_files row. Default "private". */
  visibility?: Visibility;
  /** Initial sharing grants. */
  shareWith?: string[];
  shareLevel?: PermissionLevel;
  /** Free-form metadata stored on the row. */
  metadata?: Record<string, unknown>;
  /** Override filename when source has no inherent name. */
  fileName?: string;
  /**
   * When true, scope columns (organization_id/project_id/task_id) are read
   * from `appContext` and stamped into `metadata.scope` so the row carries
   * its scope context. Default true.
   */
  inheritActiveScope?: boolean;
  /** Per-byte progress callback. */
  onProgress?: (loaded: number, total: number) => void;
}

// ===========================================================================
// Telemetry — every interesting handler event written to public.file_handler_events
// ===========================================================================

export type TelemetryEvent =
  | "resolve"
  | "upload_started"
  | "upload_completed"
  | "upload_failed"
  | "signed_url_minted"
  | "signed_url_refreshed"
  | "signed_url_expired"
  | "access_denied"
  | "share_link_invalid"
  | "external_fetch_failed"
  | "cors_fallback_to_proxy"
  | "mime_sniff"
  | "magic_bytes_unknown"
  | "stream_event_normalized";

export interface TelemetryPayload {
  event: TelemetryEvent;
  fileId?: string;
  origin?: FileOrigin;
  mime?: string;
  durationMs?: number;
  error?: string;
  meta?: Record<string, unknown>;
}

// ===========================================================================
// Re-exports so callsites import from one place
// ===========================================================================

export type { FileUploadResponse };
