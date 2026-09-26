/**
 * features/source-studio/sourceStudioModel.ts
 *
 * The Source screen's decisions, pure (SOURCE-CONVERGENCE §8.2). No React, no
 * Supabase: what the Original pane shows for a Source, where an old viewer URL
 * lands, which portion a `?page=` / `?chunk=` deep link opens on, and where a
 * click on a portion or a chunk seeks a player. Tested directly so the route,
 * the redirects and the panes can never disagree.
 */

import type { PortionLocatorRow } from "@/features/sources/portionLocator";

// ── Routes ────────────────────────────────────────────────────────────────

/** The one Source screen. */
export const SOURCE_STUDIO_ROOT = "/knowledge/sources";

/** Search params an old viewer URL may carry that the Source screen honours. */
export const SOURCE_STUDIO_PARAMS = ["page", "chunk", "assets"] as const;
export type SourceStudioParam = (typeof SOURCE_STUDIO_PARAMS)[number];

type ParamBag =
  | Record<string, string | string[] | undefined>
  | URLSearchParams
  | null
  | undefined;

function readParam(params: ParamBag, key: string): string | undefined {
  if (!params) return undefined;
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

/**
 * `/knowledge/sources/<id>` plus whichever of `page`, `chunk`, `assets` the
 * caller carried — every old viewer route redirects through this, so a
 * citation deep link (`/knowledge/viewer/<id>?page=12&chunk=<c>`) still opens
 * on its passage.
 */
export function sourceStudioPath(id: string, params?: ParamBag): string {
  const qs = new URLSearchParams();
  for (const key of SOURCE_STUDIO_PARAMS) {
    const value = readParam(params, key)?.trim();
    if (value) qs.set(key, value);
  }
  const tail = qs.toString();
  return `${SOURCE_STUDIO_ROOT}/${encodeURIComponent(id)}${tail ? `?${tail}` : ""}`;
}

// ── Deep link → opening portion ───────────────────────────────────────────

export interface SourceDeepLink {
  /** 1-based page number from `?page=`, when valid. */
  page: number | null;
  /** Chunk id from `?chunk=`, when present. */
  chunkId: string | null;
  /** `?assets=1` — open the Knowledge Assets drawer. */
  assets: boolean;
}

export function parseSourceDeepLink(params: ParamBag): SourceDeepLink {
  const rawPage = readParam(params, "page");
  const page = rawPage ? Number.parseInt(rawPage, 10) : NaN;
  const chunk = readParam(params, "chunk")?.trim() || null;
  return {
    page: Number.isFinite(page) && page > 0 ? page : null,
    chunkId: chunk,
    assets: readParam(params, "assets") === "1",
  };
}

/**
 * The portion (`page_index`) a page number names. Portions carry their own
 * `page_number` (a web section's ordinal, a transcript segment's ordinal), so
 * it is looked up — `page - 1` only when no locator row says otherwise.
 */
export function portionIndexForPage(
  page: number,
  portions: ReadonlyArray<Pick<PortionLocatorRow, "page_index" | "page_number">>,
): number {
  const hit = portions.find((p) => p.page_number === page);
  return hit ? hit.page_index : Math.max(0, page - 1);
}

/** The portion a chunk sits in: its first page number, resolved as above. */
export function portionIndexForChunk(
  chunk: { page_numbers: number[] | null },
  portions: ReadonlyArray<Pick<PortionLocatorRow, "page_index" | "page_number">>,
): number | null {
  const first = chunk.page_numbers?.length
    ? Math.min(...chunk.page_numbers)
    : null;
  return first == null ? null : portionIndexForPage(first, portions);
}

// ── Seek ──────────────────────────────────────────────────────────────────

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Where a portion starts in the media, in ms — null for anything untimed. */
export function portionStartMs(
  portion: Pick<PortionLocatorRow, "locator"> | null | undefined,
): number | null {
  if (!portion) return null;
  const t0 = obj(portion.locator).t0_ms;
  return typeof t0 === "number" && Number.isFinite(t0) && t0 >= 0 ? t0 : null;
}

/** A request to move a player (the one shape every seekable player takes). */
export type { SeekRequest } from "@/lib/media/seek-request";

// ── Original pane ─────────────────────────────────────────────────────────

/** The columns the Original resolver reads off `docproc.processed_documents`. */
export interface SourceOriginalFacts {
  source_kind: string;
  source_id: string;
  mime_type: string | null;
  original_file_id: string | null;
  canonical_identity: string | null;
  metadata: unknown;
}

/** Media a transcript Source was made from (`transcripts.transcripts`). */
export interface SourceMediaFacts {
  audioFileId: string | null;
  videoFileId: string | null;
}

export type OriginalView =
  /** The PDF the Source was extracted from (a `cld_file`). */
  | { kind: "pdf"; fileId: string }
  /** A video / audio file with a seekable player. */
  | { kind: "video"; fileId: string }
  | { kind: "audio"; fileId: string }
  /** A YouTube (or other embeddable) video, seeked by embed start time. */
  | { kind: "youtube"; videoId: string; url: string }
  /** A transcript with no media on record: segments with times, no player. */
  | { kind: "transcript-no-media" }
  /** The web page as captured (gzipped snapshot in S3), with the live address beside it. */
  | { kind: "web-snapshot"; fileId: string; url: string | null }
  /** A web page whose snapshot is not stored: the live address, opened at the passage. */
  | { kind: "web-live"; url: string }
  /** Any other file the Source came from (shown by the file viewer). */
  | { kind: "file"; fileId: string; mimeType: string | null }
  /** Pasted text or anything without separate original bytes: the text is the original. */
  | { kind: "text" };

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

const YOUTUBE_RE =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export function youtubeVideoId(url: string): string | null {
  return YOUTUBE_RE.exec(url)?.[1] ?? null;
}

/** The web address a Source was captured from, if it has one. */
export function sourceUrl(doc: SourceOriginalFacts): string | null {
  const meta = obj(doc.metadata);
  for (const candidate of [
    meta.final_url,
    meta.url,
    meta.source_url,
    doc.canonical_identity,
  ]) {
    if (isHttpUrl(candidate)) return candidate.trim();
  }
  return null;
}

function mimeFamily(mime: string | null): "pdf" | "video" | "audio" | null {
  if (!mime) return null;
  const m = mime.toLowerCase();
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return null;
}

/**
 * What the Original pane shows. One rule for every kind: a file Source shows
 * its file (PDF viewer, player, file viewer); a transcript shows its media
 * with a seekable player — or says it has none; a web Source shows its stored
 * snapshot, else the live address; anything else is its own text.
 */
export function resolveOriginalView(
  doc: SourceOriginalFacts,
  media: SourceMediaFacts | null = null,
): OriginalView {
  const url = sourceUrl(doc);
  switch (doc.source_kind) {
    case "cld_file": {
      const fileId = doc.original_file_id ?? doc.source_id;
      const family = mimeFamily(doc.mime_type);
      if (family === "pdf") return { kind: "pdf", fileId };
      if (family === "video") return { kind: "video", fileId };
      if (family === "audio") return { kind: "audio", fileId };
      return { kind: "file", fileId, mimeType: doc.mime_type };
    }
    case "transcript": {
      if (media?.videoFileId) return { kind: "video", fileId: media.videoFileId };
      if (media?.audioFileId) return { kind: "audio", fileId: media.audioFileId };
      const vid = url ? youtubeVideoId(url) : null;
      if (vid && url) return { kind: "youtube", videoId: vid, url };
      return { kind: "transcript-no-media" };
    }
    case "scrape_parsed_page": {
      const vid = url ? youtubeVideoId(url) : null;
      if (vid && url) return { kind: "youtube", videoId: vid, url };
      if (doc.original_file_id)
        return { kind: "web-snapshot", fileId: doc.original_file_id, url };
      if (url) return { kind: "web-live", url };
      return { kind: "text" };
    }
    default: {
      if (doc.original_file_id) {
        const family = mimeFamily(doc.mime_type);
        if (family === "pdf") return { kind: "pdf", fileId: doc.original_file_id };
        return {
          kind: "file",
          fileId: doc.original_file_id,
          mimeType: doc.mime_type,
        };
      }
      if (url) return { kind: "web-live", url };
      return { kind: "text" };
    }
  }
}

/** True when the Original pane can move to a time (portion clicks seek it). */
export function originalSeeks(view: OriginalView): boolean {
  return view.kind === "video" || view.kind === "audio" || view.kind === "youtube";
}

/**
 * A live page opened at a passage — a text fragment (`#:~:text=`) of the
 * portion's first words. Browsers without fragment support open the page top.
 */
export function textFragmentUrl(url: string, passage: string | null): string {
  const words = (passage ?? "")
    .replace(/[#*_`>[\]()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
  if (!words) return url;
  const base = url.split("#")[0];
  return `${base}#:~:text=${encodeURIComponent(words)}`;
}

// ── Web snapshot ──────────────────────────────────────────────────────────

/**
 * The HTML a stored web original holds, or null. The door keeps either the
 * fetched page HTML (server scrapes) or the extension's capture JSON; an
 * extension capture carries the article HTML, never a full page.
 */
export function snapshotHtml(text: string): string | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) return text;
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = obj(JSON.parse(trimmed));
    for (const candidate of [
      parsed.html,
      parsed.raw_html,
      obj(parsed.article).content,
      obj(parsed.article).html,
    ]) {
      if (typeof candidate === "string" && candidate.includes("<"))
        return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

// ── Edit and export ───────────────────────────────────────────────────────

/** One portion as the screen holds it (pages hook + locator row). */
export interface StudioPortion {
  pageIndex: number;
  pageNumber: number;
  rawText: string;
  cleanedText: string;
  /** `portion_kind` + `locator` from `processed_document_pages`, when read. */
  locator: PortionLocatorRow | null;
}

const PORTION_KINDS = [
  "message",
  "page",
  "section",
  "segment",
  "sheet",
  "slide",
] as const;
type EditPortionKind = (typeof PORTION_KINDS)[number];

export interface EditPortion {
  ordinal: number;
  kind: EditPortionKind;
  text: string;
  locator: Record<string, unknown>;
  method: string;
}

/** The text a person reads for a portion: cleaned when there is any, else raw. */
export function readableText(p: Pick<StudioPortion, "rawText" | "cleanedText">): string {
  return p.cleanedText.trim() ? p.cleanedText : p.rawText;
}

/**
 * The WHOLE body for `POST /sources/{id}/edit` with one portion changed. The
 * door stores exactly what it is given, so every portion goes, in order, with
 * its OWN kind and locator — a transcript segment keeps its times, a web
 * section its heading path (never re-labelled "page").
 */
export function buildEditPortions(
  portions: ReadonlyArray<StudioPortion>,
  editedPageIndex: number,
  text: string,
): EditPortion[] {
  return [...portions]
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((p, i) => {
      const rawKind = p.locator?.portion_kind;
      const kind: EditPortionKind = (PORTION_KINDS as readonly string[]).includes(
        rawKind ?? "",
      )
        ? (rawKind as EditPortionKind)
        : "page";
      const locator = obj(p.locator?.locator);
      return {
        ordinal: i + 1,
        kind,
        text: p.pageIndex === editedPageIndex ? text : readableText(p),
        locator:
          Object.keys(locator).length > 0
            ? locator
            : kind === "page"
              ? { page: p.pageNumber }
              : {},
        method: "manual",
      };
    });
}

/** The Source as one markdown file: each portion under its own name. */
export function sourceAsMarkdown(
  name: string,
  portions: ReadonlyArray<StudioPortion>,
  label: (p: StudioPortion) => string,
): string {
  const body = [...portions]
    .sort((a, b) => a.pageIndex - b.pageIndex)
    .map((p) => `## ${label(p)}\n\n${readableText(p).trim()}`)
    .join("\n\n");
  return `# ${name}\n\n${body}\n`;
}
