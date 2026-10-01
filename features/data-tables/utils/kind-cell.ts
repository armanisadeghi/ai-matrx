/**
 * Does a data-table cell hold a KIND? (Arman, 2026-09-30: a kind is never
 * drawn as raw JSON.) A json/array cell whose value carries `__kind` — stored
 * as an object, or as JSON text — displays as a compact kind label that opens
 * the value in its window; only the explicit edit mode works on its JSON.
 * Kindless JSON stays JSON. The detector is the one in content-ir.
 */

import {
  firstKindSlug,
  hasKindKey,
} from "@/features/content-ir/surfaces/json-kind-signal";

export type KindCell =
  | { state: "kind"; kind: string; value: Record<string, unknown> }
  | { state: "broken"; kind: string | null };

function ownKind(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = (value as Record<string, unknown>).__kind;
  return typeof kind === "string" && kind.trim() ? kind : null;
}

export function kindCell(raw: unknown): KindCell | null {
  const direct = ownKind(raw);
  if (direct) return { state: "kind", kind: direct, value: raw as Record<string, unknown> };
  if (typeof raw !== "string" || !hasKindKey(raw)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: "broken", kind: firstKindSlug(raw) };
  }
  const kind = ownKind(parsed);
  return kind
    ? { state: "kind", kind, value: parsed as Record<string, unknown> }
    : null;
}
