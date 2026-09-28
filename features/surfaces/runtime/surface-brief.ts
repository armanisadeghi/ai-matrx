/**
 * features/surfaces/runtime/surface-brief.ts
 *
 * THE BRIEF — what one copy of a surface IS, in a few bounded values, so a
 * host that lists many records (the board's item list) can tell an agent what
 * every item is without sending each one's whole surface.
 *
 * The values come from the surface's own scope: the manifest's `briefValues`
 * (in order), else its first non-empty declared values. Each is projected
 * small (`briefValue`): a long or multi-line text becomes its first line and a
 * word count, a list its count, a record its title and field count. The
 * caller owns the overall budget; every cap here is exported so the payload
 * can state it.
 */

import {
  AMBIENT_VALUES,
  BASELINE_VALUES,
  PLATFORM_CONTEXT_VALUES,
} from "@/features/surfaces/manifests/_baseline.manifest";
import type { SurfaceManifest, SurfaceScopePayload } from "@/features/surfaces/types";

/** At most this many values in one brief. */
export const SURFACE_BRIEF_MAX_VALUES = 4;
/** A text value in a brief is cut to this many characters. */
export const SURFACE_BRIEF_TEXT_CHARS = 160;

const PLATFORM_NAMES = new Set<string>([
  ...Object.keys(BASELINE_VALUES),
  ...Object.keys(AMBIENT_VALUES),
  ...Object.keys(PLATFORM_CONTEXT_VALUES),
]);

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as object).length === 0;
  return false;
}

function cut(text: string): string {
  return text.length > SURFACE_BRIEF_TEXT_CHARS
    ? `${text.slice(0, SURFACE_BRIEF_TEXT_CHARS)}…`
    : text;
}

const TITLE_KEYS = ["title", "name", "label"] as const;

/** One value, projected small enough for a list of many items. */
export function briefValue(value: unknown): unknown {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text.includes("\n") && text.length <= SURFACE_BRIEF_TEXT_CHARS) return text;
    const firstLine = text.split("\n").find((line) => line.trim())?.trim() ?? "";
    return { first_line: cut(firstLine), words: text.split(/\s+/).filter(Boolean).length };
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return { count: value.length };
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const titleKey = TITLE_KEYS.find((key) => typeof record[key] === "string");
    return {
      ...(titleKey ? { [titleKey]: cut(String(record[titleKey])) } : {}),
      fields: Object.keys(record).length,
    };
  }
  return null;
}

export interface SurfaceBrief {
  /** Value name → its small projection. */
  values: Record<string, unknown>;
  /** True when the manifest chose these values (`briefValues`). */
  declared: boolean;
}

/** The brief of one surface's live scope (`manifest` = its registered manifest). */
export function surfaceBrief(
  manifest: Pick<SurfaceManifest, "briefValues" | "values"> | null | undefined,
  scope: SurfaceScopePayload,
): SurfaceBrief {
  const declared = manifest?.briefValues;
  const names = declared?.length
    ? declared
    : (manifest?.values ?? [])
        .map((entry) => entry.name)
        .filter((name) => !PLATFORM_NAMES.has(name));
  const values: Record<string, unknown> = {};
  for (const name of names) {
    if (Object.keys(values).length >= SURFACE_BRIEF_MAX_VALUES) break;
    const value = scope[name];
    if (isEmpty(value)) continue;
    values[name] = briefValue(value);
  }
  return { values, declared: Boolean(declared?.length) };
}
