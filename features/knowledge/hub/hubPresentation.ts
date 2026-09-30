/**
 * features/knowledge/hub/hubPresentation.ts — how the hub NAMES things: a
 * hit's kind label and icon (the registry's, never a second table), its
 * origin in words, where "Open full" goes, and the facet values it reports.
 */

import {
  AudioLines,
  Boxes,
  FileText,
  Film,
  Globe,
  MessagesSquare,
  Mic,
  MonitorPlay,
  Podcast,
  TextCursorInput,
  Users,
  type LucideIcon,
} from "lucide-react";
import { getFileTypeDetails } from "@/features/files/utils/file-types";
import { getContentRoleMeta, tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import { RELATIVE_DATE_LABEL } from "@/features/knowledge/api/knowledgeQueryText";

export const SOURCE_KIND_WORDS: Record<string, string> = {
  web_page: "Web page",
  scrape_parsed_page: "Web page (parsed)",
  cld_file: "Document",
  transcript: "Transcript",
  inline: "Pasted text",
  youtube_video: "YouTube video",
};

export const ORIGIN_WORDS: Record<string, string> = {
  web: "Web app",
  extension: "Chrome extension",
  local: "Desktop app",
  agent: "Agent",
  research: "Research",
  crawl: "Crawl",
  upload: "Upload",
  youtube: "YouTube",
};

const SOURCE_KIND_ICON: Record<string, LucideIcon> = {
  web_page: Globe,
  scrape_parsed_page: Globe,
  inline: TextCursorInput,
  legacy: FileText,
  youtube_video: MonitorPlay,
};

/**
 * What a transcript IS, from its own record (census 2026-09-27 of
 * transcripts.transcripts: audio 1,249 · YouTube 273 · podcast 13 · interview
 * 34 · meeting 1 · other 1). Each gets its own glyph — never one mic for all.
 */
export type TranscriptMediaKind = "youtube" | "podcast" | "video" | "meeting" | "interview" | "recording" | "text";

export const TRANSCRIPT_MEDIA_ICON: Record<TranscriptMediaKind, LucideIcon> = {
  youtube: MonitorPlay,
  podcast: Podcast,
  video: Film,
  meeting: Users,
  interview: MessagesSquare,
  recording: Mic,
  text: FileText,
};

export const TRANSCRIPT_MEDIA_LABEL: Record<TranscriptMediaKind, string> = {
  youtube: "YouTube",
  podcast: "Podcast",
  video: "Video",
  meeting: "Meeting",
  interview: "Interview",
  recording: "Recording",
  text: "Transcript",
};

/** "Web page" for a Source, else the registry label ("Chat", "Note"…). */
export function kindLabel(hit: Pick<KnowledgeHit, "entity" | "source_kind">): string {
  if (hit.entity === "segment") return "Passage";
  if (hit.source_kind && SOURCE_KIND_WORDS[hit.source_kind]) return SOURCE_KIND_WORDS[hit.source_kind];
  return tokenLabel(hit.entity);
}

export function tokenLabel(token: string): string {
  if (token === "tag") return "Tag";
  if (token === "conversation") return "Chat";
  return tryGetEntityInfo(token)?.label ?? token.replace(/_/g, " ");
}

/** A file's own type (the Files system's table): PDF, sheet, image, audio… by its name. */
function fileTypeIcon(name: string): { Icon: LucideIcon; className: string } | null {
  const d = getFileTypeDetails(name);
  return d.category === "UNKNOWN" ? null : { Icon: d.icon, className: d.color };
}

/**
 * The glyph a row wears, and its tint. Each kind its own: a file by its type,
 * a web page a globe, pasted text a cursor, a transcript by what it came from
 * (a YouTube capture before its record is read; the record decides after —
 * see TRANSCRIPT_MEDIA_ICON); everything else the registry's own icon.
 */
export function hitIcon(
  hit: Pick<KnowledgeHit, "entity" | "source_kind" | "title" | "origin">,
): { Icon: LucideIcon; className?: string } {
  if (hit.entity === "file" || hit.source_kind === "cld_file") {
    const f = fileTypeIcon(hit.title);
    if (f) return f;
    return { Icon: FileText };
  }
  if (hit.source_kind === "transcript" || hit.entity === "transcript") {
    if (hit.origin === "youtube") return { Icon: MonitorPlay };
    // Not read yet: the transcript glyph, until its record says recording / meeting / video.
    return { Icon: AudioLines };
  }
  if (hit.source_kind && SOURCE_KIND_ICON[hit.source_kind]) return { Icon: SOURCE_KIND_ICON[hit.source_kind] };
  if (hit.entity === "segment") return { Icon: FileText };
  return { Icon: tryGetEntityInfo(hit.entity)?.Icon ?? Boxes };
}

export function kindIcon(hit: Pick<KnowledgeHit, "entity" | "source_kind" | "title" | "origin">): LucideIcon {
  return hitIcon(hit).Icon;
}

/** Titles that are a placeholder, not a name ("unlabeled", "Untitled transcript"). */
export function isPlaceholderTitle(title: string | null | undefined): boolean {
  const t = (title ?? "").trim().toLowerCase();
  return !t || /^(unlabeled|unlabelled|untitled|untitled transcript|untitled session|new transcript|no title|null|undefined)$/.test(t);
}

export function originLabel(origin: string | null | undefined): string {
  if (!origin) return "Not reported";
  // An origin this table has not named yet still reads as words ("transcription" → "Transcription"), never a raw code.
  return ORIGIN_WORDS[origin] ?? origin.charAt(0).toUpperCase() + origin.slice(1).replace(/_/g, " ");
}

/** "Open full" — the item's own route (server href wins, then the registry). */
export function openFullHref(hit: KnowledgeHit): string | null {
  // A transcript opens on its own page in the Knowledge area (its text and player), not the
  // transcripts module's processor.
  if (hit.entity === "transcript") return `/knowledge/transcripts/${encodeURIComponent(hit.id)}`;
  if (hit.href) return hit.href;
  if (hit.entity === "segment" && hit.segment?.source_id)
    return tryGetEntityInfo("processed_document")?.hrefFor?.(hit.segment.source_id) ?? null;
  return tryGetEntityInfo(hit.entity)?.hrefFor?.(hit.id) ?? null;
}

export function dateLabel(relative: string | undefined): string {
  return relative ? (RELATIVE_DATE_LABEL[relative] ?? relative.replace(/_/g, " ")) : "Custom range";
}

export function hitKey(hit: Pick<KnowledgeHit, "entity" | "id">): string {
  return `${hit.entity}:${hit.id}`;
}

export function capturedByLabel(hit: KnowledgeHit): string {
  return hit.captured_by?.name ?? (hit.captured_by ? "Someone" : "Not reported");
}

// ─── Display text ───────────────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Text as a person should read it: tags stripped and entities decoded (a title
 * captured from a page arrives as "Why <b>OpenAI</b> &amp; …"). Plain text is
 * returned untouched.
 */
export function plainText(value: string | null | undefined): string {
  const s = value ?? "";
  if (!/[<&]/.test(s)) return s;
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return NAMED_ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** A snippet without transcript scaffolding: "[Music]", "[Applause]", "Speaker 1:", "Unknown:". */
export function cleanSnippet(value: string | null | undefined): string {
  return plainText(value)
    .replace(/\[(?:music|applause|laughter|laughs|inaudible|silence|noise|crosstalk|foreign)\]/gi, " ")
    .replace(/(?:^|\s)(?:speaker[ _]?\d+|unknown|SPEAKER_\d+)\s*:\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Kind colour ────────────────────────────────────────────────────────────

/**
 * A kind's colour: the tile behind its glyph and the glyph's own tint. One
 * source per kind, never a second palette — a file wears the Files system's own
 * type colour (PDF red, sheet green…), a transcript and a YouTube capture their
 * own, and everything else the registry's content-role accent (source / output /
 * workspace / utility) that the resource surfaces already use. Tint only: the
 * surfaces around a tile stay semantic tokens.
 */
export interface HubKindTone {
  /** The tile's fill (a wash of the hue, readable on a white card and on the dark one). */
  tile: string;
  /** The glyph's colour, light and dark. */
  icon: string;
}

// Full class strings, so Tailwind sees every one (a class built from a hue name is never generated).
export const HUB_HUE_TONE: Record<string, HubKindTone> = {
  amber: { tile: "bg-amber-500/15", icon: "text-amber-600 dark:text-amber-400" },
  blue: { tile: "bg-blue-500/15", icon: "text-blue-600 dark:text-blue-400" },
  cyan: { tile: "bg-cyan-500/15", icon: "text-cyan-600 dark:text-cyan-400" },
  emerald: { tile: "bg-emerald-500/15", icon: "text-emerald-600 dark:text-emerald-400" },
  fuchsia: { tile: "bg-fuchsia-500/15", icon: "text-fuchsia-600 dark:text-fuchsia-400" },
  indigo: { tile: "bg-indigo-500/15", icon: "text-indigo-600 dark:text-indigo-400" },
  orange: { tile: "bg-orange-500/15", icon: "text-orange-600 dark:text-orange-400" },
  pink: { tile: "bg-pink-500/15", icon: "text-pink-600 dark:text-pink-400" },
  purple: { tile: "bg-purple-500/15", icon: "text-purple-600 dark:text-purple-400" },
  red: { tile: "bg-red-500/15", icon: "text-red-600 dark:text-red-400" },
  rose: { tile: "bg-rose-500/15", icon: "text-rose-600 dark:text-rose-400" },
  sky: { tile: "bg-sky-500/15", icon: "text-sky-600 dark:text-sky-400" },
  slate: { tile: "bg-slate-500/15", icon: "text-slate-600 dark:text-slate-400" },
  teal: { tile: "bg-teal-500/15", icon: "text-teal-600 dark:text-teal-400" },
  violet: { tile: "bg-violet-500/15", icon: "text-violet-600 dark:text-violet-400" },
  yellow: { tile: "bg-yellow-500/15", icon: "text-yellow-600 dark:text-yellow-400" },
};

const NEUTRAL_TONE: HubKindTone = { tile: "bg-muted", icon: "text-muted-foreground" };

function toneForHue(text: string | undefined): HubKindTone | null {
  const hue = text?.match(/text-([a-z]+)-\d{3}/)?.[1];
  return hue ? (HUB_HUE_TONE[hue] ?? null) : null;
}

export function hitTone(
  hit: Pick<KnowledgeHit, "entity" | "source_kind" | "title" | "origin">,
): HubKindTone {
  if (hit.source_kind === "transcript" || hit.entity === "transcript")
    return hit.origin === "youtube" ? HUB_HUE_TONE.red : HUB_HUE_TONE.rose;
  if (hit.source_kind === "youtube_video") return HUB_HUE_TONE.red;
  if (hit.entity === "file" || hit.source_kind === "cld_file") {
    const fromFile = toneForHue(hitIcon(hit).className);
    if (fromFile) return fromFile;
    return HUB_HUE_TONE.slate;
  }
  if (hit.source_kind === "web_page" || hit.source_kind === "scrape_parsed_page") return HUB_HUE_TONE.sky;
  if (hit.entity === "segment") return HUB_HUE_TONE.sky;
  const role = tryGetEntityInfo(hit.entity)?.contentRole;
  if (!role) return NEUTRAL_TONE;
  const meta = getContentRoleMeta(role as Parameters<typeof getContentRoleMeta>[0]);
  return { tile: meta.accentBg, icon: meta.accentText };
}
