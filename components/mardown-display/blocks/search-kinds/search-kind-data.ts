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
 * Types: `features/content-ir/kinds/generated/*.gen.ts` (registry→TS codegen)
 * are the complete-instance contracts these readers narrow toward.
 */

export interface SearchKindPayload {
  value: Record<string, unknown>;
  isComplete: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readSearchKindValue(serverData: unknown): SearchKindPayload {
  if (isRecord(serverData)) {
    if (isRecord(serverData.value)) {
      return {
        value: serverData.value,
        isComplete: serverData.isComplete !== false,
      };
    }
    // A bare kind value object (nested render / persisted surface).
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
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim() !== "",
  );
}

export function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

/** The item's date line: formatted `published_at`, else verbatim `age_text`. */
export function dateLine(
  item: Record<string, unknown>,
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
