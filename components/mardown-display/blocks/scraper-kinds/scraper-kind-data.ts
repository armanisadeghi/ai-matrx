/**
 * Read helpers for the scraper kind family blocks.
 *
 * TYPES COME FROM THE REGISTRY, NOWHERE ELSE. Every slug this family renders —
 * `scraped_page`, `page_link`, `page_metadata`, `link_buckets`,
 * `page_cleaning_report` and the rest — IS an independently registered kind
 * with generated types, so `readScraperKindValue<"page_link">` hands back the
 * mid-stream view generated from `content_ir.kind_definition` and a field
 * these renderers read that the registry does not declare is a COMPILE error
 * rather than a silently-undefined box on the screen. These files must never
 * declare a payload interface of their own — that is the twin the
 * `check:kind-type-twins` gate fails on.
 *
 * Every block receives `serverData` from one of two paths: the streaming
 * bridge (`{ value, isComplete }`) or a nested/persisted caller handing the
 * bare kind value object (carrying `__kind`). Values are PARTIAL mid-stream —
 * a scrape of a large page arrives in pieces — so every field read stays
 * defensive and a half-arrived page is a NORMAL state, never an error.
 */

import type {
  GeneratedKindSlug,
  PartialKind,
  PartialKindPayload,
} from "@/features/content-ir/kinds/kind-payload";

export interface ScraperKindPayload<S extends GeneratedKindSlug> {
  value: PartialKindPayload<S>;
  isComplete: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readScraperKindValue<S extends GeneratedKindSlug>(
  serverData: unknown,
): ScraperKindPayload<S> {
  if (isRecord(serverData)) {
    if (isRecord(serverData.value)) {
      return {
        value: serverData.value,
        isComplete: serverData.isComplete !== false,
      };
    }
    return { value: serverData, isComplete: true };
  }
  return { value: {}, isComplete: true };
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((i): i is string => typeof i === "string" && i.trim() !== "");
}

/** The present object elements of a mid-stream array. */
export function items(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

/** Untyped escape hatch for genuinely open payload corners. */
export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

export function compactNumber(value: number): string {
  return Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

/**
 * Minutes to read, at 230 wpm. Derived from the character count because the
 * kind carries one — never from re-splitting the whole body on every render.
 */
export function readingMinutes(chars: number | null): number | null {
  if (!chars || chars <= 0) return null;
  return Math.max(1, Math.round(chars / 5 / 230));
}

/** An ISO instant as a short human date. Returns null rather than "Invalid Date". */
export function shortDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * How an HTTP status should read. `null` status is "not measured", which is
 * NOT the same as a failure — a mid-stream page has not reported one yet.
 */
export function statusTone(
  status: number | null,
  success: boolean | null | undefined,
): "ok" | "redirect" | "error" | "unknown" {
  if (success === false) return "error";
  if (status === null || status === 0) return "unknown";
  if (status >= 200 && status < 300) return "ok";
  if (status >= 300 && status < 400) return "redirect";
  return "error";
}
