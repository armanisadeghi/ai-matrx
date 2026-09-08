/**
 * `media_asset` — ONE durable media handle: the thing an image / video /
 * audio / document / YouTube producing mandate actually delivers.
 *
 * PYTHON-OWNED: the seeded schema is `MediaAssetKind.model_json_schema()`
 * (registry kind `media_asset`, v2, family `media`). The `KindSchema` below
 * mirrors that model; the DB row wins on disagreement (this is the compiled
 * bootstrap floor).
 *
 * 🚨 THE RULING THIS EXISTS TO SERVE (Arman, 2026-09-08). Structured media is
 * a RICHER path, never a replacement: "we don't want to lose the ability to
 * handle text and still process it in the same way… in case those
 * instructions are not included, the system should still do its best to
 * handle them as it does now." Everything the markdown splitter does today
 * for a bare URL (`detectImageMarkdown`, `extractAudioLink`,
 * `detectVideoMarkdown` → the `image`/`audio`/`video` render blocks) is
 * UNTOUCHED. This kind fires only when a producer supplies structured data.
 *
 * 🚨 `media_type: "unknown"` IS THE NORMAL CASE. Real producer data is a bare
 * durable CDN URL with no extension and no mime. Only `__kind` is required.
 * An `unknown` asset renders a WORKING LINK — never a guessed `<img>`, never
 * a dead control. A `file_id`-only instance is valid and simply has no
 * address yet.
 *
 * 🚨 MEDIA DURABILITY. Identity resolution is NOT re-decided here: the value's
 * typed locator fields go straight through the canonical
 * `buildMediaSource` → `fileSourceToMediaRef` pair, which prefers the
 * permanent CDN URL, then `file_id`, then a durable URL — and REFUSES an
 * expiring signed URL with no recoverable identity (rendering it would leak a
 * bearer credential and guarantee a broken historical message). That refusal
 * is preserved, and surfaced honestly as `unresolvable`.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import type { MediaRefLike } from "@ai-matrx/media";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { formatDurationMs, formatFileSize } from "@ai-matrx/kit/format";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { optionalNumber, optionalString } from "./media-io-shared";
import { isRecord } from "./legacy-bridge-utils";
import type { MaterializedKind } from "./kind-payload";
import type { MediaAsset } from "./generated/kinds.generated";
// THE identity adapters. Never duplicated, never re-sniffed here.
import { buildMediaSource } from "@/components/mardown-display/blocks/buildMediaSource";
import { fileSourceToMediaRef } from "@/features/files/media-client/refs";
import { parseYouTubeUrl } from "@/lib/media/youtube";

// ---------------------------------------------------------------------------
// Schema — mirror of MediaAssetKind. SINGLE LEVEL, no nesting.
// ---------------------------------------------------------------------------

export const MEDIA_TYPES = [
  "image",
  "video",
  "audio",
  "document",
  "youtube",
  "unknown",
] as const;

export type MediaAssetType = (typeof MEDIA_TYPES)[number];

export const mediaAssetKindSchema: KindSchema = {
  kind: "media_asset",
  fields: {
    media_type: {
      type: "enum",
      values: [...MEDIA_TYPES],
      default: "unknown",
      description:
        'What this asset is. "unknown" is the NORMAL case — a bare durable URL carries no extension and no mime — and renders as a working link, never a guessed embed.',
    },
    origin: {
      type: "enum",
      values: ["matrx", "external"],
      default: "matrx",
      description: "Whether the bytes are ours or somebody else's.",
    },
    file_id: {
      type: "string",
      nullable: true,
      description:
        "cld_files id — the durable handle. A file_id-only instance is valid and has no address yet.",
    },
    url: { type: "string", nullable: true, description: "Playable/viewable URL." },
    cdn_url: {
      type: "string",
      nullable: true,
      description: "Permanent CDN URL, present only when the asset is public.",
    },
    download_url: {
      type: "string",
      nullable: true,
      description: "Attachment-disposition URL, when the producer minted one.",
    },
    external_url: {
      type: "string",
      nullable: true,
      description: "Third-party address (a YouTube watch page, a source site).",
    },
    source_label: {
      type: "string",
      nullable: true,
      description: "Human label for where this came from.",
    },
    mime_type: { type: "string", nullable: true },
    file_name: { type: "string", nullable: true },
    poster_url: {
      type: "string",
      nullable: true,
      description: "Poster frame for a video.",
    },
    transcript: { type: "string", nullable: true },
    size_bytes: { type: "number", nullable: true },
    width: { type: "number", nullable: true },
    height: { type: "number", nullable: true },
    duration_ms: { type: "number", nullable: true },
    page_count: { type: "number", nullable: true },
    metadata: {
      type: "json",
      default: {},
      description: "Producer-specific extras — opaque by contract.",
    },
  },
};

// ---------------------------------------------------------------------------
// serverData bridge.
// ---------------------------------------------------------------------------

/**
 * THE SHAPE COMES FROM THE REGISTRY (`pnpm shape:types`). The bridge adds only
 * the decisions no component should re-make: the resolved media ref, the
 * address, the effective type, and the honest "nothing safely renderable"
 * verdict.
 */
export type MediaAssetData = MaterializedKind<Omit<MediaAsset, "__kind">> & {
  /**
   * What `<InlineMediaRef ref={…}>` resolves — built by the canonical
   * adapters from the typed locator fields. `null` when the only locator is
   * an expiring URL with no recoverable identity (see `unresolvable`).
   */
  mediaRef: MediaRefLike | null;
  /** The renderer contract's address: `url || cdn_url || external_url`. */
  address: string | null;
  /**
   * The effective media type: the declared one, or — when it is `"unknown"` —
   * what the DECLARED `mime_type` / a YouTube address says. Never a guess off
   * a URL's shape; if nothing declares it, this stays `"unknown"`.
   */
  effectiveMediaType: MediaAssetType;
  /** YouTube video id, when this asset is a YouTube address. */
  youtubeId: string | null;
  /** A durable href safe to hand a user. `null` → use `file_id`, or say so. */
  linkHref: string | null;
  /**
   * TRUE when the asset carries a locator but none of it is safely
   * renderable — an expiring signed URL with no recoverable identity. The
   * component states this instead of leaking the credential or drawing a dead
   * player.
   */
  unresolvable: boolean;
  isComplete: boolean;
};

function mediaTypeFromMime(mime: string | null): MediaAssetType | null {
  if (!mime) return null;
  const lower = mime.toLowerCase();
  if (lower.startsWith("image/")) return "image";
  if (lower.startsWith("video/")) return "video";
  if (lower.startsWith("audio/")) return "audio";
  if (lower === "application/pdf" || lower.startsWith("application/vnd."))
    return "document";
  if (lower.startsWith("text/")) return "document";
  return null;
}

function readMediaType(value: unknown): MediaAssetType {
  return typeof value === "string" &&
    (MEDIA_TYPES as readonly string[]).includes(value)
    ? (value as MediaAssetType)
    : "unknown";
}

export function readMediaAsset(
  value: Record<string, unknown>,
): MediaAssetData {
  const url = optionalString(value.url);
  const cdnUrl = optionalString(value.cdn_url);
  const downloadUrl = optionalString(value.download_url);
  const externalUrl = optionalString(value.external_url);
  const fileId = optionalString(value.file_id);
  const mimeType = optionalString(value.mime_type);

  // The renderer contract from the server lane, verbatim.
  const address = url ?? cdnUrl ?? externalUrl;

  // THE canonical identity path — no second sniffing heuristic lives here.
  // The typed field names ARE buildMediaSource's snake_case vocabulary.
  const source = buildMediaSource(
    {
      file_id: fileId,
      url,
      cdn_url: cdnUrl,
      download_url: downloadUrl,
      external_url: externalUrl,
    },
    mimeType ?? undefined,
  );
  const mediaRef = fileSourceToMediaRef(source);

  const declared = readMediaType(value.media_type);
  const youtube = parseYouTubeUrl(externalUrl ?? url ?? cdnUrl ?? "");
  const effectiveMediaType: MediaAssetType =
    declared !== "unknown"
      ? declared
      : youtube
        ? "youtube"
        : (mediaTypeFromMime(mimeType) ?? "unknown");

  // A link we can honestly hand a user: only a durable URL the adapters
  // already blessed. A file_id-only asset has no href — the component opens
  // the file preview instead of drawing a dead anchor.
  const linkHref =
    source && (source.kind === "external_url" || source.kind === "public_cdn")
      ? source.url
      : null;

  const hasLocator = Boolean(fileId ?? url ?? cdnUrl ?? downloadUrl ?? externalUrl);

  return {
    file_id: fileId,
    url,
    cdn_url: cdnUrl,
    download_url: downloadUrl,
    external_url: externalUrl,
    source_label: optionalString(value.source_label),
    mime_type: mimeType,
    file_name: optionalString(value.file_name),
    poster_url: optionalString(value.poster_url),
    transcript: optionalString(value.transcript),
    media_type: declared,
    origin: value.origin === "external" ? "external" : "matrx",
    size_bytes: optionalNumber(value.size_bytes),
    width: optionalNumber(value.width),
    height: optionalNumber(value.height),
    duration_ms: optionalNumber(value.duration_ms),
    page_count: optionalNumber(value.page_count),
    metadata: isRecord(value.metadata) ? value.metadata : {},
    mediaRef,
    address,
    effectiveMediaType,
    youtubeId: youtube?.videoId ?? null,
    linkHref,
    unresolvable: hasLocator && mediaRef === null,
    isComplete: false,
  };
}

export function mediaAssetServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (MediaAssetData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "media_asset") return undefined;
  return {
    ...readMediaAsset(envelope.root.value),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "media_type",
  "origin",
  "file_id",
  "url",
  "cdn_url",
  "download_url",
  "external_url",
  "source_label",
  "mime_type",
  "file_name",
  "poster_url",
  "transcript",
  "size_bytes",
  "width",
  "height",
  "duration_ms",
  "page_count",
  "metadata",
  KIND_KEY,
];

const MD_HEADING: Record<MediaAssetType, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  document: "Document",
  youtube: "YouTube video",
  unknown: "Media",
};

export function mediaAssetMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const asset = readMediaAsset(value);
  const label =
    asset.file_name ?? asset.source_label ?? MD_HEADING[asset.effectiveMediaType];

  const facts = [
    asset.mime_type ? `Type: \`${asset.mime_type}\`` : null,
    asset.size_bytes !== null ? `Size: ${formatFileSize(asset.size_bytes)}` : null,
    asset.duration_ms !== null
      ? `Duration: ${formatDurationMs(asset.duration_ms)}`
      : null,
    asset.width !== null && asset.height !== null
      ? `${asset.width}×${asset.height}`
      : null,
    asset.page_count !== null ? `Pages: ${asset.page_count}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // An image with a durable address embeds; everything else — including an
  // "unknown" asset — gets a plain working link. Nothing is ever emitted for
  // an address we refused to resolve.
  const body = asset.linkHref
    ? asset.effectiveMediaType === "image"
      ? `![${label}](${asset.linkHref})`
      : `[${label}](${asset.linkHref})`
    : asset.file_id
      ? `File \`${asset.file_id}\``
      : asset.unresolvable
        ? "_The only address for this media expires and carries no file id, so it is not linked here._"
        : null;

  return joinBlocks([
    `# ${MD_HEADING[asset.effectiveMediaType]}`,
    facts || null,
    body,
    asset.transcript ? `## Transcript\n\n${asset.transcript}` : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definition.
// ---------------------------------------------------------------------------

export const MEDIA_ASSET_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "media_asset",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "media_asset",
    toLegacyServerData: mediaAssetServerDataFromEnvelope,
    toMarkdown: mediaAssetMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "media",
    schema: mediaAssetKindSchema,
  },
];
