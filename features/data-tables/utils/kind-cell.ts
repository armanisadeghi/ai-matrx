/**
 * Does a data-table cell hold a KIND? (Arman, 2026-09-30: a kind is never
 * drawn as raw JSON.) A json/array cell whose value carries `__kind` — stored
 * as an object, or as JSON text — displays as a compact kind label that opens
 * the value in its window; only the explicit edit mode works on its JSON.
 * Kindless JSON stays JSON. The detector is the one in content-ir.
 */

import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";
import { unfinishedKindLabel } from "@/features/content-ir/surfaces/kind-text-to-markdown";
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

/**
 * What a COPY of this cell puts on a person's clipboard, when the cell holds a
 * kind: the kind's markdown (the same text the display's kind chip opens), or
 * the one-line "did not finish" note for a kind that never completed. `null`
 * for every other cell — the caller copies it as it always did. Display and
 * copy read the cell through the SAME `kindCell` door, so they cannot
 * disagree. The stored value is never touched.
 */
export function kindCellCopyText(raw: unknown): string | null {
  const cell = kindCell(raw);
  if (!cell) return null;
  return cell.state === "kind"
    ? kindValueToMarkdown(cell.value)
    : unfinishedKindLabel(cell.kind);
}
