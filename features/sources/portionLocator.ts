/**
 * features/sources/portionLocator.ts
 *
 * How one portion of a Source (`docproc.processed_document_pages` row) is
 * named to a person (SOURCE-CONVERGENCE §2.2): a page is "Page 12"; a web
 * section is its heading path ("Guide › Setup › Linux"); a transcript segment
 * is its time range and speaker ("1:05–1:32 · Ana"). Pure — the viewer, the
 * Sources screen and any agent-facing citation read the same words.
 */

import { formatDurationMs } from "@ai-matrx/kit/format";

export type PortionKind =
  "page" | "section" | "segment" | "message" | "sheet" | "slide";

export interface PortionLocatorRow {
  page_index: number;
  page_number: number;
  portion_kind: string;
  locator: unknown;
  speaker?: string | null;
}

export const PORTION_KIND_WORD: Record<PortionKind, string> = {
  page: "Page",
  section: "Section",
  segment: "Segment",
  message: "Message",
  sheet: "Sheet",
  slide: "Slide",
};

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function portionKindOf(
  row: Pick<PortionLocatorRow, "portion_kind">,
): PortionKind {
  return (Object.keys(PORTION_KIND_WORD) as PortionKind[]).includes(
    row.portion_kind as PortionKind,
  )
    ? (row.portion_kind as PortionKind)
    : "page";
}

/** The portion's name in words, from its locator. Never an empty string. */
export function portionLabel(row: PortionLocatorRow): string {
  const loc = obj(row.locator);
  const ordinal = row.page_number || row.page_index + 1;
  switch (portionKindOf(row)) {
    case "page":
      return `Page ${num(loc.page) ?? ordinal}`;
    case "section": {
      const path = Array.isArray(loc.heading_path)
        ? loc.heading_path
            .filter(
              (h): h is string => typeof h === "string" && h.trim().length > 0,
            )
            .map((h) => h.trim())
        : [];
      if (path.length) return path.join(" › ");
      const fragment =
        typeof loc.text_fragment === "string" ? loc.text_fragment.trim() : "";
      return fragment
        ? `“${fragment.length > 60 ? `${fragment.slice(0, 59)}…` : fragment}”`
        : `Section ${ordinal}`;
    }
    case "segment": {
      const t0 = num(loc.t0_ms);
      const t1 = num(loc.t1_ms);
      const speaker =
        (typeof loc.speaker === "string" && loc.speaker.trim()) ||
        row.speaker?.trim() ||
        "";
      const range =
        t0 !== null
          ? t1 !== null
            ? `${formatDurationMs(t0)}–${formatDurationMs(t1)}`
            : formatDurationMs(t0)
          : `Segment ${ordinal}`;
      return speaker ? `${range} · ${speaker}` : range;
    }
    case "sheet": {
      const sheet =
        typeof loc.sheet === "string" && loc.sheet
          ? loc.sheet
          : `Sheet ${ordinal}`;
      const a = num(loc.row_start);
      const b = num(loc.row_end);
      return a !== null ? `${sheet} · rows ${a}–${b ?? a}` : sheet;
    }
    case "slide":
      return `Slide ${num(loc.slide) ?? ordinal}`;
    case "message":
      return `Message ${ordinal}`;
  }
}
