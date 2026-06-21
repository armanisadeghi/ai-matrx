/**
 * features/files/handler/output/target.ts
 *
 * Render a `NormalizedFile` for a specific consumer. Each branch is the
 * ONLY place in the codebase that knows how to build that consumer's
 * shape — the duplication clusters in conversation/agents/RAG/tasks all
 * collapse here.
 */

import type {
  AudioBlock,
  DocumentBlock,
  ImageBlock,
  VideoBlock,
  YouTubeVideoBlock,
} from "@/features/agents/types/message-types";
import type { MediaRef } from "@/features/files/types";
import type {
  ImageMediaPart,
  AudioMediaPart,
  VideoMediaPart,
  DocumentMediaPart,
  YouTubeMediaPart,
  MessagePart,
} from "@/types/python-generated/stream-events";
import {
  preferDisplayUrl,
  preferFetchableUrl,
  preferIdentityLocator,
} from "../utils/prefer-locator";
import { pythonShareUrl } from "../utils/python-base";
import { isSignedUrl } from "@/lib/media/signed-url";
import type {
  FileTarget,
  MediaBlock,
  NormalizedFile,
  RagIngestSource,
  RenderedFor,
} from "../types";

// `unknown` because the generic specialization happens at the callsite.
export async function toTarget<T extends FileTarget>(
  file: NormalizedFile,
  target: T,
): Promise<RenderedFor<T>> {
  switch (target.kind) {
    case "media_block":
      return toMediaBlock(file) as RenderedFor<T>;
    case "media_ref":
      return toMediaRef(file) as RenderedFor<T>;
    case "html_src":
      return toHtmlSrc(file) as RenderedFor<T>;
    case "fetchable_url":
      return toFetchableUrl(file) as RenderedFor<T>;
    case "blob":
      return (await toBlob(file)) as RenderedFor<T>;
    case "data_uri":
      return (await toDataUri(file)) as RenderedFor<T>;
    case "form_data_part":
      return (await toFormDataPart(file, target.field)) as RenderedFor<T>;
    case "anchor_download":
      return toAnchorDownload(file, target.suggestedName) as RenderedFor<T>;
    case "og_image":
      return toOgImage(file) as RenderedFor<T>;
    case "jsonb_content_part":
      return toJsonbContentPart(file) as RenderedFor<T>;
    case "rag_ingest_source":
      return toRagIngestSource(file) as RenderedFor<T>;
  }
}

// ---------------------------------------------------------------------------
// AI media blocks (outbound)
// ---------------------------------------------------------------------------

function toMediaBlock(file: NormalizedFile): MediaBlock {
  if (file.youtubeUrl) {
    const block: YouTubeVideoBlock = {
      type: "youtube_video",
      url: file.youtubeUrl,
    };
    return block;
  }

  const locator = preferIdentityLocator(file);
  const mime = file.meta.mime;
  const category = file.meta.category;

  if (category === "IMAGE") {
    const block: ImageBlock = { type: "image", ...locator };
    if (mime) block.mime_type = mime;
    return block;
  }
  if (category === "AUDIO") {
    const block: AudioBlock = { type: "audio", ...locator };
    if (mime) block.mime_type = mime;
    return block;
  }
  if (category === "VIDEO") {
    const block: VideoBlock = { type: "video", ...locator };
    if (mime) block.mime_type = mime;
    return block;
  }
  const block: DocumentBlock = { type: "document", ...locator };
  if (mime) block.mime_type = mime;
  return block;
}

/**
 * Build a `MediaRef` from a normalized file. Exported so the agent slice
 * (and any other sync code path) can produce the SAME shape `as` produces,
 * without going through the async `fileHandler.use(...).as(...)` chain.
 * Anyone duplicating this logic is the doctrine violation that produced
 * the worst bugs in the file system; consume this helper instead.
 */
export function toMediaRef(file: NormalizedFile): MediaRef {
  const locator = preferIdentityLocator(file);
  const ref: MediaRef = {};
  if (locator.file_id) ref.file_id = locator.file_id;
  if (locator.file_uri) ref.file_uri = locator.file_uri;
  if (locator.url) ref.url = locator.url;
  if (file.meta.mime) ref.mime_type = file.meta.mime;
  return ref;
}

// ---------------------------------------------------------------------------
// Browser-facing URLs
// ---------------------------------------------------------------------------

function toHtmlSrc(file: NormalizedFile): string {
  const url = preferDisplayUrl(file);
  if (!url) {
    throw new Error("file-handler: no displayable URL for this file");
  }
  return url;
}

function toFetchableUrl(file: NormalizedFile): string {
  const url = preferFetchableUrl(file);
  if (!url) {
    throw new Error("file-handler: no fetchable URL for this file");
  }
  return url;
}

async function toBlob(file: NormalizedFile): Promise<Blob> {
  const url = preferFetchableUrl(file);
  if (!url) {
    throw new Error("file-handler: cannot produce a Blob for this file");
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`file-handler: blob fetch failed (${res.status})`);
  }
  return res.blob();
}

async function toDataUri(file: NormalizedFile): Promise<string> {
  if (file.base64 && file.meta.mime) {
    return `data:${file.meta.mime};base64,${file.base64}`;
  }
  const blob = await toBlob(file);
  return blobToDataUri(blob);
}

async function toFormDataPart(
  file: NormalizedFile,
  field: string,
): Promise<{ value: Blob; filename: string }> {
  const blob = await toBlob(file);
  return {
    value: blob,
    filename: file.meta.fileName ?? guessFilename(field, file.meta.mime),
  };
}

function toAnchorDownload(
  file: NormalizedFile,
  suggested?: string,
): { url: string; filename: string } {
  const url = preferDisplayUrl(file) ?? preferFetchableUrl(file);
  if (!url) throw new Error("file-handler: no URL to download");
  return {
    url,
    filename: suggested ?? file.meta.fileName ?? "download",
  };
}

function toOgImage(file: NormalizedFile): string {
  // OG previews are scraped offline by social platforms — never use a
  // signed URL (it'll expire before the scrape) and never use a same-origin
  // proxy (auth-required). Prefer permanent CDN > share-link bytes endpoint.
  if (file.url && !isSignedUrl(file.url)) return file.url;
  if (file.shareToken) return pythonShareUrl(file.shareToken);
  throw new Error("file-handler: no permanent URL available for OG image");
}

// ---------------------------------------------------------------------------
// Persistence (cx_message.content[])
// ---------------------------------------------------------------------------

function toJsonbContentPart(file: NormalizedFile): MessagePart {
  if (file.youtubeUrl) {
    const part: YouTubeMediaPart = {
      type: "media",
      kind: "youtube",
      url: file.youtubeUrl,
    };
    return part;
  }

  const locator = preferIdentityLocator(file);
  const base = {
    type: "media" as const,
    url: locator.url ?? null,
    file_uri: locator.file_uri ?? null,
    mime_type: file.meta.mime ?? null,
  };
  switch (file.meta.category) {
    case "IMAGE": {
      const part: ImageMediaPart = { ...base, kind: "image" };
      return part;
    }
    case "AUDIO": {
      const part: AudioMediaPart = { ...base, kind: "audio" };
      return part;
    }
    case "VIDEO": {
      const part: VideoMediaPart = { ...base, kind: "video" };
      return part;
    }
    default: {
      const part: DocumentMediaPart = { ...base, kind: "document" };
      return part;
    }
  }
}

// ---------------------------------------------------------------------------
// RAG ingest
// ---------------------------------------------------------------------------

function toRagIngestSource(file: NormalizedFile): RagIngestSource {
  if (file.fileId) return { source_kind: "cld_file", source_id: file.fileId };
  if (file.url) return { source_kind: "external_url", url: file.url };
  if (file.base64 && file.meta.mime) {
    const bytes = base64ToBytes(file.base64);
    return { source_kind: "inline", inline: { mime: file.meta.mime, bytes } };
  }
  throw new Error("file-handler: no RAG-ingestable form for this file");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function guessFilename(field: string, mime?: string): string {
  const ext = mime?.split("/")[1]?.split(";")[0] ?? "bin";
  return `${field}.${ext}`;
}
