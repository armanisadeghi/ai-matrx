/**
 * Read helpers for the search kind family blocks.
 *
 * Every block receives `serverData` from one of two paths:
 *  - the streaming bridge (`makeSearchKindBridge`): `{ value, isComplete }`
 *  - a nested/persisted caller handing the bare kind value object itself
 *    (carrying `__kind`).
 * `readSearchKindValue` coerces both. Values are PARTIAL mid-stream —
 * every field read stays defensive.
 *
 * TYPES COME FROM THE REGISTRY, NOWHERE ELSE. `readSearchKindValue<"web_result">`
 * hands back `PartialKind<WebResult>` generated from
 * `content_ir.kind_definition` (`features/content-ir/kinds/generated/`), so a
 * field these renderers read that the registry does not declare is a COMPILE
 * error rather than a silently-undefined box on the screen. These files must
 * never declare a payload interface of their own — that is the twin the
 * `check:kind-type-twins` gate fails on.
 */

import type {
  GeneratedKindSlug,
  PartialKind,
  PartialKindPayload,
} from "@/features/content-ir/kinds/kind-payload";

/** The bridge/nested handoff, narrowed to one registered kind. */
export interface SearchKindPayload<S extends GeneratedKindSlug> {
  value: PartialKindPayload<S>;
  isComplete: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Coerce either handoff shape into `{ value, isComplete }`, typed as the
 * mid-stream view of the named kind.
 *
 *   const { value } = readSearchKindValue<"web_result">(serverData);
 *   value.site_name  // string | undefined — from the registry
 */
export function readSearchKindValue<S extends GeneratedKindSlug>(
  serverData: unknown,
): SearchKindPayload<S> {
  if (isRecord(serverData)) {
    if (isRecord(serverData.value)) {
      return {
        value: serverData.value as PartialKindPayload<S>,
        isComplete: serverData.isComplete !== false,
      };
    }
    // A bare kind value object (nested render / persisted surface).
    return { value: serverData as PartialKindPayload<S>, isComplete: true };
  }
  return { value: {} as PartialKindPayload<S>, isComplete: true };
}

/**
 * ESCAPE HATCH — ONE caller, ONE reason. The `web_search_results` SLUG IS
 * COLLIDED on the live registry: the active row is the 2026-08-09 named-shapes
 * `workflow_io` registration (a FLAT `{query, urls, results[]}`, no `data[]`,
 * no `kind_edge` children), while the search pilot's sectioned collection
 * (`news`/`videos`/`faqs`/`discussions`/`places`/`entity`/`ai_answer`, declared
 * TS-owned in `features/content-ir/kinds/search-results.ts`) never landed under
 * that slug. The generated types are CORRECT — they mirror the registry — so
 * typing this collection against them would bind it to the WRONG shape.
 *
 * Until the collision is resolved (KINDS_EVERYWHERE_PLAN §10g GAP 1 follow-on;
 * FOUND_DEFECTS), this ONE collection reads defensively. Every ITEM inside it
 * still renders through a fully registry-typed component. Do not add callers:
 * `check:kind-type-twins` allowlists exactly this file for exactly this reason.
 */
export function readWebSearchCollectionValue(serverData: unknown): {
  value: Record<string, unknown>;
  isComplete: boolean;
} {
  if (!isRecord(serverData)) return { value: {}, isComplete: true };
  if (isRecord(serverData.value)) {
    return {
      value: serverData.value,
      isComplete: serverData.isComplete !== false,
    };
  }
  return { value: serverData, isComplete: true };
}

export function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
}

/**
 * The present elements of a mid-stream array of objects. Generic so a nested
 * list keeps its registry type: `items(value.results)` on a
 * `PartialKind<WebResult>[]` field yields `PartialKind<WebResult>[]`, never
 * `Record<string, unknown>[]`.
 */
export function items<T>(value: PartialKind<T>[] | undefined): PartialKind<T>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PartialKind<T> => isRecord(item));
}

/** Untyped escape hatch for genuinely open payload corners (`Record<string, unknown>`). */
export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

/** The item's date line: formatted `published_at`, else verbatim `age_text`. */
export function dateLine(
  item: { published_at?: string | null; age_text?: string | null },
  formatDate: (value: string | undefined) => string | undefined,
): string | null {
  const published = text(item.published_at);
  if (published) return formatDate(published) ?? published;
  return text(item.age_text);
}

/** "3:47" / "1:02:07" from seconds. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
