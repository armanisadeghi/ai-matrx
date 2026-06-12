/**
 * features/files/handler/input/normalize.ts
 *
 * Pure first-pass: turn a `FileSource` into a partial `NormalizedFile`.
 * "Pure" means no I/O, no Redux. Anything that needs the network or auth
 * runs in the resolver, not here.
 *
 * Each `FileSource` kind gets its own arm. Adding a new shape is a single
 * edit in this file plus a `FileSource` variant in `../types.ts`.
 */

import type { CloudFile } from "@/features/files/types";
import { classify } from "../utils/classify";
import { pythonShareUrl } from "../utils/python-base";
import { createTrackedObjectUrl } from "../utils/object-url-registry";
import {
  EPHEMERAL_CAPS,
  EXTERNAL_CAPS,
  PUBLIC_CAPS,
} from "../intelligence/access";
import type { FileSource, NormalizedFile } from "../types";

const STREAM_RENDER_TYPES = new Set([
  "image",
  "audio",
  "video",
  "document",
]);

export function normalize(source: FileSource): NormalizedFile {
  switch (source.kind) {
    case "blob":
      return fromBlob(source);
    case "file":
      return fromFile(source);
    case "buffer":
      return fromBuffer(source);
    case "stream":
      return fromStream(source);
    case "data_uri":
      return fromDataUri(source);
    case "base64":
      return fromBase64(source);
    case "external_url":
      return fromExternalUrl(source);
    case "youtube":
      return fromYouTube(source);
    case "cloud_file":
      return fromCloudFile(source.cloudFile, source);
    case "file_id":
      return fromFileId(source);
    case "file_uri":
      return fromFileUri(source);
    case "signed_url":
      return fromSignedUrl(source);
    case "share_link":
      return fromShareLink(source);
    case "public_cdn":
      return fromPublicCdn(source);
    case "upload_result":
      return fromUploadResult(source);
    case "stream_event":
      return fromStreamEvent(source);
  }
}

// ---------------------------------------------------------------------------
// Ephemeral / raw bytes
// ---------------------------------------------------------------------------

function fromBlob(source: Extract<FileSource, { kind: "blob" }>): NormalizedFile {
  const url = createTrackedObjectUrl(source.blob);
  const meta = classify({
    fileName: source.fileName,
    mime: source.mime ?? source.blob.type,
    sizeBytes: source.blob.size,
  });
  return {
    url,
    origin: "ephemeral",
    capabilities: EPHEMERAL_CAPS,
    meta,
    lifecycle: { refreshable: false, persisted: false },
    scope: {},
    __source: source,
  };
}

function fromFile(source: Extract<FileSource, { kind: "file" }>): NormalizedFile {
  const url = createTrackedObjectUrl(source.file);
  const meta = classify({
    fileName: source.file.name,
    mime: source.file.type,
    sizeBytes: source.file.size,
  });
  return {
    url,
    origin: "ephemeral",
    capabilities: EPHEMERAL_CAPS,
    meta,
    lifecycle: { refreshable: false, persisted: false },
    scope: {},
    __source: source,
  };
}

function fromBuffer(
  source: Extract<FileSource, { kind: "buffer" }>,
): NormalizedFile {
  const blob = bufferToBlob(source.buffer, source.mime);
  const url = createTrackedObjectUrl(blob);
  const meta = classify({
    fileName: source.fileName,
    mime: source.mime,
    sizeBytes: blob.size,
  });
  return {
    url,
    origin: "ephemeral",
    capabilities: EPHEMERAL_CAPS,
    meta,
    lifecycle: { refreshable: false, persisted: false },
    scope: {},
    __source: source,
  };
}

function fromStream(
  source: Extract<FileSource, { kind: "stream" }>,
): NormalizedFile {
  // Stream sources can't produce a synchronous URL — output adapters that
  // need bytes will tee the stream in `to-blob.ts`. The normalized form
  // carries no URL at this stage; consumers that need one will be fed a
  // blob URL after the stream is consumed.
  return {
    origin: "ephemeral",
    capabilities: EPHEMERAL_CAPS,
    meta: classify({ fileName: source.fileName, mime: source.mime }),
    lifecycle: { refreshable: false, persisted: false },
    scope: {},
    __source: source,
  };
}

function fromDataUri(
  source: Extract<FileSource, { kind: "data_uri" }>,
): NormalizedFile {
  const match = /^data:([^;,]+)(;base64)?,(.+)$/i.exec(source.dataUri);
  const mime = match?.[1];
  const isBase64 = !!match?.[2];
  const payload = match?.[3] ?? "";
  return {
    url: source.dataUri,
    base64: isBase64 ? payload : undefined,
    origin: "ephemeral",
    capabilities: EPHEMERAL_CAPS,
    meta: classify({ mime }),
    lifecycle: { refreshable: false, persisted: false },
    scope: {},
    __source: source,
  };
}

function fromBase64(
  source: Extract<FileSource, { kind: "base64" }>,
): NormalizedFile {
  return {
    url: `data:${source.mime};base64,${source.base64}`,
    base64: source.base64,
    origin: "ephemeral",
    capabilities: EPHEMERAL_CAPS,
    meta: classify({ fileName: source.fileName, mime: source.mime }),
    lifecycle: { refreshable: false, persisted: false },
    scope: {},
    __source: source,
  };
}

// ---------------------------------------------------------------------------
// External
// ---------------------------------------------------------------------------

function fromExternalUrl(
  source: Extract<FileSource, { kind: "external_url" }>,
): NormalizedFile {
  return {
    url: source.url,
    origin: "external",
    capabilities: EXTERNAL_CAPS,
    meta: classify({ mime: source.mime, fileName: filenameFromUrl(source.url) }),
    lifecycle: { refreshable: false, persisted: true },
    scope: {},
    __source: source,
  };
}

function fromYouTube(
  source: Extract<FileSource, { kind: "youtube" }>,
): NormalizedFile {
  return {
    url: source.url,
    youtubeUrl: source.url,
    origin: "external",
    capabilities: EXTERNAL_CAPS,
    meta: classify({ mime: "video/youtube", fileName: "youtube.video" }),
    lifecycle: { refreshable: false, persisted: true },
    scope: {},
    __source: source,
  };
}

// ---------------------------------------------------------------------------
// Owned / identifier-bearing
// ---------------------------------------------------------------------------

export function fromCloudFile(
  cloudFile: CloudFile,
  source: FileSource,
): NormalizedFile {
  const meta = classify({
    fileName: cloudFile.fileName,
    mime: cloudFile.mimeType ?? undefined,
    sizeBytes: cloudFile.fileSize ?? undefined,
    checksum: cloudFile.checksum ?? undefined,
  });
  // Prefer the PERMANENT URL flavours for public files (cdn_url → canonical
  // url → legacy public_url). These never expire, so they're safe to seed
  // directly. For private/shared files we deliberately leave `url` empty
  // and let the resolver mint a fresh signed URL through its TTL-aware
  // cache — the signed URL the REST response carried may already be stale,
  // and the FileRecord doesn't include an expiry we could trust. This is
  // the fix for "we issue expiring signed URLs for public files that have
  // a permanent cdn_url."
  const isPublic = cloudFile.visibility === "public";
  const bestUrl = isPublic
    ? (cloudFile.cdnUrl ?? cloudFile.url ?? cloudFile.publicUrl ?? undefined)
    : (cloudFile.publicUrl ?? undefined);
  // A CDN/public URL is CORS-safe for fetch; a raw signed S3 URL is not.
  const isCdnOrPublic =
    !!(isPublic && (cloudFile.cdnUrl ?? cloudFile.url)) || !!cloudFile.publicUrl;
  return {
    fileId: cloudFile.id,
    fileUri: cloudFile.storageUri,
    url: bestUrl,
    origin: cloudFile.visibility === "public" ? "public" : "owned",
    capabilities: {
      canRead: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
      requiresAuth: cloudFile.visibility !== "public",
      transportSafeForFetch: isCdnOrPublic,
    },
    meta,
    lifecycle: {
      refreshable: true,
      persisted: !cloudFile.deletedAt,
    },
    scope: {
      ownerId: cloudFile.ownerId,
      organizationId: readOrgScope(cloudFile),
      projectId: readProjectScope(cloudFile),
      taskId: readTaskScope(cloudFile),
    },
    derivedFrom: cloudFile.parentFileId
      ? { fileId: cloudFile.parentFileId, kind: cloudFile.derivationKind ?? "" }
      : undefined,
    __source: source,
  };
}

function fromFileId(
  source: Extract<FileSource, { kind: "file_id" }>,
): NormalizedFile {
  return {
    fileId: source.fileId,
    origin: "owned",
    capabilities: {
      canRead: true,
      canEdit: false,
      canShare: false,
      canDelete: false,
      requiresAuth: true,
      transportSafeForFetch: false,
    },
    meta: classify({ mime: source.mime }),
    lifecycle: { refreshable: true, persisted: true },
    scope: {},
    __source: source,
  };
}

function fromFileUri(
  source: Extract<FileSource, { kind: "file_uri" }>,
): NormalizedFile {
  return {
    fileUri: source.fileUri,
    origin: "owned",
    capabilities: {
      canRead: true,
      canEdit: false,
      canShare: false,
      canDelete: false,
      requiresAuth: true,
      transportSafeForFetch: false,
    },
    meta: classify({ mime: source.mime }),
    lifecycle: { refreshable: false, persisted: true },
    scope: {},
    __source: source,
  };
}

// ---------------------------------------------------------------------------
// Server-issued URLs
// ---------------------------------------------------------------------------

function fromSignedUrl(
  source: Extract<FileSource, { kind: "signed_url" }>,
): NormalizedFile {
  return {
    fileId: source.fileId,
    url: source.url,
    origin: source.fileId ? "owned" : "external",
    capabilities: {
      canRead: true,
      canEdit: false,
      canShare: false,
      canDelete: false,
      requiresAuth: false,
      transportSafeForFetch: false,
    },
    meta: classify({ mime: source.mime, fileName: filenameFromUrl(source.url) }),
    lifecycle: {
      expiresAt: source.expiresAt,
      refreshable: !!source.fileId,
      persisted: true,
    },
    scope: {},
    __source: source,
  };
}

function fromShareLink(
  source: Extract<FileSource, { kind: "share_link" }>,
): NormalizedFile {
  return {
    shareToken: source.token,
    url: pythonShareUrl(source.token),
    origin: "public",
    capabilities: PUBLIC_CAPS,
    meta: classify({ mime: source.mime }),
    lifecycle: { refreshable: true, persisted: true },
    scope: {},
    __source: source,
  };
}

function fromPublicCdn(
  source: Extract<FileSource, { kind: "public_cdn" }>,
): NormalizedFile {
  return {
    fileId: source.fileId,
    url: source.url,
    origin: "public",
    capabilities: { ...PUBLIC_CAPS, transportSafeForFetch: true },
    meta: classify({ mime: source.mime, fileName: filenameFromUrl(source.url) }),
    lifecycle: { refreshable: !!source.fileId, persisted: true },
    scope: {},
    __source: source,
  };
}

function fromUploadResult(
  source: Extract<FileSource, { kind: "upload_result" }>,
): NormalizedFile {
  const r = source.uploadResult;
  return {
    fileId: r.fileId,
    url: r.url,
    origin: "owned",
    capabilities: {
      canRead: true,
      canEdit: !!r.fileId,
      canShare: !!r.fileId,
      canDelete: !!r.fileId,
      requiresAuth: true,
      transportSafeForFetch: true,
    },
    meta: classify({
      mime: typeof r.metadata?.mimetype === "string"
        ? (r.metadata.mimetype as string)
        : undefined,
      fileName: typeof r.metadata?.name === "string"
        ? (r.metadata.name as string)
        : undefined,
    }),
    lifecycle: { refreshable: !!r.fileId, persisted: true },
    scope: {},
    __source: source,
  };
}

// ---------------------------------------------------------------------------
// Stream events — server-emitted file references arriving mid-stream
// ---------------------------------------------------------------------------

function fromStreamEvent(
  source: Extract<FileSource, { kind: "stream_event" }>,
): NormalizedFile {
  const payload = source.payload as Record<string, unknown> | null;
  if (!payload || typeof payload !== "object") {
    return emptyEphemeral(source);
  }

  // Two shapes the stream produces:
  //   1. RenderBlock — { type, data: { src }, ... } for type in image/audio/video/document
  //   2. TypedDataPayload — { type: "image_output"|"audio_output"|"video_output", url, mime_type }
  // Both reduce to: a URL + a MIME, with optional fileId.
  const type = String(payload.type ?? "");
  let url: string | undefined;
  let mime: string | undefined;

  if (type === "image_output" || type === "audio_output" || type === "video_output") {
    url = payload.url as string | undefined;
    mime = payload.mime_type as string | undefined;
  } else if (STREAM_RENDER_TYPES.has(type)) {
    const data = payload.data as Record<string, unknown> | undefined;
    url = (data?.src ?? data?.url) as string | undefined;
    const meta = payload.metadata as Record<string, unknown> | undefined;
    mime = (meta?.mime_type ?? meta?.mime) as string | undefined;
  }

  const fileId =
    (payload.file_id as string | undefined) ??
    ((payload.metadata as Record<string, unknown> | undefined)?.file_id as
      | string
      | undefined);

  return {
    fileId,
    url,
    origin: fileId ? "owned" : "external",
    capabilities: {
      canRead: true,
      canEdit: false,
      canShare: false,
      canDelete: false,
      requiresAuth: !!fileId,
      transportSafeForFetch: !fileId,
    },
    meta: classify({ mime, fileName: filenameFromUrl(url ?? "") }),
    lifecycle: { refreshable: !!fileId, persisted: true },
    scope: {},
    __source: source,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filenameFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  try {
    const path = new URL(url, "https://x").pathname;
    const last = path.split("/").pop();
    return last && last.length > 0 ? last : undefined;
  } catch {
    return undefined;
  }
}

function emptyEphemeral(source: FileSource): NormalizedFile {
  return {
    origin: "ephemeral",
    capabilities: EPHEMERAL_CAPS,
    meta: classify({}),
    lifecycle: { refreshable: false, persisted: false },
    scope: {},
    __source: source,
  };
}

function bufferToBlob(
  buffer: ArrayBuffer | Uint8Array | SharedArrayBuffer,
  mime: string,
): Blob {
  if (buffer instanceof Uint8Array) {
    const copy = new Uint8Array(buffer.byteLength);
    copy.set(buffer);
    return new Blob([copy.buffer], { type: mime });
  }
  if (buffer instanceof ArrayBuffer) return new Blob([buffer], { type: mime });
  const view = new Uint8Array(buffer as unknown as ArrayBufferLike);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return new Blob([copy.buffer], { type: mime });
}

function readOrgScope(file: CloudFile): string | undefined {
  const v = file.metadata?.["scope"];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const orgId = (v as Record<string, unknown>).organization_id;
    if (typeof orgId === "string") return orgId;
  }
  return undefined;
}

function readProjectScope(file: CloudFile): string | undefined {
  const v = file.metadata?.["scope"];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const projectId = (v as Record<string, unknown>).project_id;
    if (typeof projectId === "string") return projectId;
  }
  return undefined;
}

function readTaskScope(file: CloudFile): string | undefined {
  const v = file.metadata?.["scope"];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const taskId = (v as Record<string, unknown>).task_id;
    if (typeof taskId === "string") return taskId;
  }
  return undefined;
}
