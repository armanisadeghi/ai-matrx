import type { Json } from "@/types/database.types";
import { isJsonRecord } from "@/features/marketing/types";

/**
 * Typed narrowing over the scraper-persisted `web.snapshot` JSON columns
 * (`headings`, `links_summary`, `extracted`, `images`). Companion to
 * `lib/head-tags.ts` — components never poke raw snapshot JSON.
 */

export interface SnapshotHeadingEntry {
  text: string;
  level: number;
}

export interface ParsedSnapshotHeadings {
  /** Document-ordered outline. */
  all: SnapshotHeadingEntry[];
  h1Count: number;
}

/** Normalize `web.snapshot.headings` (`{ all: [{text, level}], h1_count }`). */
export function parseSnapshotHeadings(headings: Json): ParsedSnapshotHeadings {
  if (!isJsonRecord(headings)) return { all: [], h1Count: 0 };
  const all = Array.isArray(headings.all)
    ? headings.all.flatMap((entry): SnapshotHeadingEntry[] => {
        if (!isJsonRecord(entry)) return [];
        const text = typeof entry.text === "string" ? entry.text.trim() : "";
        const level =
          typeof entry.level === "number" && Number.isInteger(entry.level)
            ? entry.level
            : null;
        return text && level !== null && level >= 1 && level <= 6
          ? [{ text, level }]
          : [];
      })
    : [];
  const h1Count =
    typeof headings.h1_count === "number" &&
    Number.isInteger(headings.h1_count)
      ? headings.h1_count
      : all.filter((entry) => entry.level === 1).length;
  return { all, h1Count };
}

export interface ParsedSnapshotLinksSummary {
  total: number | null;
  internal: number | null;
  external: number | null;
}

function finiteNumber(
  record: { [key: string]: Json | undefined },
  key: string,
): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Normalize `web.snapshot.links_summary` (`{ total, internal, external }`). */
export function parseSnapshotLinksSummary(
  linksSummary: Json,
): ParsedSnapshotLinksSummary {
  if (!isJsonRecord(linksSummary)) {
    return { total: null, internal: null, external: null };
  }
  return {
    total: finiteNumber(linksSummary, "total"),
    internal: finiteNumber(linksSummary, "internal"),
    external: finiteNumber(linksSummary, "external"),
  };
}

export interface SnapshotRedirectHop {
  url: string;
  status: number | null;
}

export interface ParsedSnapshotExtracted {
  sentenceCount: number | null;
  fleschReadingEase: number | null;
  redirectChain: SnapshotRedirectHop[];
}

/** Normalize `web.snapshot.extracted` (readability + redirect evidence). */
export function parseSnapshotExtracted(
  extracted: Json,
): ParsedSnapshotExtracted {
  if (!isJsonRecord(extracted)) {
    return { sentenceCount: null, fleschReadingEase: null, redirectChain: [] };
  }
  const redirectChain = Array.isArray(extracted.redirect_chain)
    ? extracted.redirect_chain.flatMap((hop): SnapshotRedirectHop[] => {
        if (!isJsonRecord(hop)) return [];
        const url = typeof hop.url === "string" ? hop.url : null;
        if (!url) return [];
        return [{ url, status: finiteNumber(hop, "status") }];
      })
    : [];
  return {
    sentenceCount: finiteNumber(extracted, "sentence_count"),
    fleschReadingEase: finiteNumber(extracted, "flesch_reading_ease"),
    redirectChain,
  };
}

export interface ParsedSnapshotImages {
  count: number | null;
  missingAlt: number | null;
}

/** Normalize `web.snapshot.images` (`{ count, missing_alt }`). */
export function parseSnapshotImages(images: Json): ParsedSnapshotImages {
  if (!isJsonRecord(images)) return { count: null, missingAlt: null };
  return {
    count: finiteNumber(images, "count"),
    missingAlt: finiteNumber(images, "missing_alt"),
  };
}
