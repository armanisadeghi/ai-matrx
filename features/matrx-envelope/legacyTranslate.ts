/**
 * Matrx Reference — the loud legacy-translation layer (the HARD-CUT seam).
 *
 * The canonical reference item is now PURE FLAT identity ids + display hints
 * (see envelope.ts / docs/protocol/MATRX_REFERENCES.md). Two old encodings still
 * exist in already-persisted values:
 *
 *   1. The nested reference item `{ purpose, slot?, ref:{...}, display:{label} }`.
 *   2. The legacy picklist envelope `{ type:"picklist_ref", list_id, list_item_id, label }`.
 *
 * New writes ONLY emit the flat shape. This module is the single place that
 * detects an old shape, translates it to the canonical flat item, and SCREAMS
 * (`console.error`) so the admin notices and migrates the stored value. There is
 * no silent dual-read anywhere else — every reader routes legacy input here.
 *
 * Loud-recovery doctrine (CLAUDE.md): a recovery firing means a real defect
 * (stale data on the old encoding) got past the proactive layer.
 */

import type { ReferenceItem } from "./envelope";
import {
  isPicklistRef,
  type PicklistRefEnvelope,
} from "@/features/agents/types/agent-definition.types";

// One scream per distinct value per session — keyed by a cheap signature so a
// list rendered repeatedly doesn't flood the console, but every distinct legacy
// value still gets surfaced once.
const screamed = new Set<string>();

function scream(reason: string, detail: Record<string, unknown>): void {
  const sig = `${reason}:${JSON.stringify(detail)}`;
  if (screamed.has(sig)) return;
  screamed.add(sig);
  // eslint-disable-next-line no-console
  console.error(
    `[matrx-reference] LEGACY ${reason} translated on read — this value is stored in a retired shape and MUST be re-saved to the canonical flat reference. Migrate it.`,
    detail,
  );
}

/** True when an item carries any retired nested key (`purpose` / `slot` / `ref` / `display`). */
export function isLegacyNestedItem(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  return "ref" in o || "purpose" in o || "display" in o || "slot" in o;
}

/**
 * Translate ONE reference item to the canonical flat shape. A flat item passes
 * through untouched (no scream). A nested legacy item is flattened (ref ids
 * hoisted to the top, `display.label` → `label`) and screams once.
 */
export function translateLegacyReferenceItem(
  raw: unknown,
  type: string,
): ReferenceItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  if (!isLegacyNestedItem(o)) {
    // Already canonical-flat — pass through.
    return o as unknown as ReferenceItem;
  }

  const ref =
    o.ref && typeof o.ref === "object" && !Array.isArray(o.ref)
      ? (o.ref as Record<string, unknown>)
      : {};
  const display =
    o.display && typeof o.display === "object" && !Array.isArray(o.display)
      ? (o.display as Record<string, unknown>)
      : {};

  // Hoist: every scalar id off `ref`, every display hint off `display`, drop
  // `purpose` / `slot` entirely. Any flat scalar already on `o` is preserved.
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === "ref" || k === "display" || k === "purpose" || k === "slot") {
      continue;
    }
    flat[k] = v;
  }
  for (const [k, v] of Object.entries(ref)) flat[k] = v;
  for (const [k, v] of Object.entries(display)) flat[k] = v;

  scream("nested reference item", { type, item: o });
  return flat as unknown as ReferenceItem;
}

/**
 * Translate the legacy single picklist envelope `{ type:"picklist_ref",
 * list_id, list_item_id, label }` to the canonical flat `picklist_item`.
 */
export function translateLegacyPicklistRef(
  env: PicklistRefEnvelope,
): PicklistItemFlat {
  scream("picklist_ref envelope", { item: env });
  return { list_id: env.list_id, item_id: env.list_item_id, label: env.label };
}

export interface PicklistItemFlat {
  list_id?: string;
  item_id: string;
  label?: string;
}

/** Narrow re-export so callers don't import the deprecated guard directly. */
export function isLegacyPicklistRef(value: unknown): value is PicklistRefEnvelope {
  return isPicklistRef(value);
}
