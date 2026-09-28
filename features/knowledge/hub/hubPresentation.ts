/**
 * features/knowledge/hub/hubPresentation.ts — how the hub NAMES things: a
 * hit's kind label and icon (the registry's, never a second table), its
 * origin in words, where "Open full" goes, and the facet values it reports.
 */

import { Boxes, FileText, Globe, Mic, TextCursorInput, type LucideIcon } from "lucide-react";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
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
  cld_file: FileText,
  transcript: Mic,
  inline: TextCursorInput,
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

export function kindIcon(hit: Pick<KnowledgeHit, "entity" | "source_kind">): LucideIcon {
  if (hit.source_kind && SOURCE_KIND_ICON[hit.source_kind]) return SOURCE_KIND_ICON[hit.source_kind];
  if (hit.entity === "segment") return FileText;
  return tryGetEntityInfo(hit.entity)?.Icon ?? Boxes;
}

export function originLabel(origin: string | null | undefined): string {
  if (!origin) return "Not reported";
  // An origin this table has not named yet still reads as words ("transcription" → "Transcription"), never a raw code.
  return ORIGIN_WORDS[origin] ?? origin.charAt(0).toUpperCase() + origin.slice(1).replace(/_/g, " ");
}

/** "Open full" — the item's own route (server href wins, then the registry). */
export function openFullHref(hit: KnowledgeHit): string | null {
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
