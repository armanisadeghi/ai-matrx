/**
 * THE RECORD-DISPOSITION REGISTRY — one entry per kind slug whose instances
 * are RECORDS the organization keeps, not just a pretty block in a chat.
 *
 * ## Why a registry and not an `if`
 *
 * A verified kind block rendered in chat gets chrome: the confirmation badge
 * for the record it produced, the count of that kind's records in the viewer's
 * organization, and the Confirm / Archive doors. None of that is a property of
 * `wine_tasting` — it is a property of a kind whose DISPOSITION is `record`.
 * `wine_tasting` is simply the first kind to declare it. Every kind that
 * declares the disposition inherits the whole mechanism with no new component,
 * no new query, and no new branch anywhere.
 *
 * ## This is NOT the kind actions (`react/actions/kind-action-provider.ts`)
 *
 * Those live on the app's one action registry (`@ai-matrx/alchemy`), keyed by
 * CAPABILITY KEY (`kind.trigger_agent`, …), and exist so a
 * kind COMPONENT's own agent-authored code can reach a platform capability. It
 * answers "what may a component do?".
 *
 * This registry is keyed by KIND SLUG and is read by the HOST that routes a
 * block to its renderer. It answers "what does the host draw AROUND this
 * kind?". THE WRAPPER LAW (see `MarkdownKindBlock.tsx`) is exactly why the two
 * cannot be the same table: a kind component renders bare, and chrome is the
 * host's business. Registering a kind here changes nothing inside its
 * component.
 *
 * ## Where the disposition ultimately belongs
 *
 * On the `content_ir.kind_definition` row, as declared kind metadata, so a
 * Shape a customer builds in the studio can declare itself a record without a
 * deploy. Until that column exists this module is the declaration site, and
 * `resolveKindRecordDisposition` is the ONE lookup every consumer calls — so
 * moving the source to the DB is a change to this file, not to its callers.
 */

import { isTableKind } from "@ai-matrx/records";

/** How a kind's instances are treated once they exist. */
export type KindDisposition = "record";

export interface KindRecordDisposition {
  /** The kind slug — `content_ir.kind_definition.kind`. */
  kind: string;
  disposition: KindDisposition;
  /** Human singular, in the reader's words. e.g. "Wine Tasting". */
  label: string;
  /** Human plural, in the reader's words. e.g. "Wine Tastings". */
  labelPlural: string;
  /**
   * Where the records live. `"table"` (KINDS-GLUE wave 3 §5.3): a `table:<uuid>` kind's records
   * are rows of that Table, so the strip's kind-store reads do not apply; it mounts only once
   * wave 2's landing read (`landingOutcomesFor`) exists. Absent = the kind store.
   */
  storage?: "kind_store" | "table";
}

const registry = new Map<string, KindRecordDisposition>();

/**
 * Declare a kind's disposition. Re-registering a slug REPLACES it (HMR and
 * test resets stay honest); an empty slug is refused because an unaddressable
 * entry is worse than a missing one.
 */
export function registerKindRecordDisposition(
  entry: KindRecordDisposition,
): void {
  const kind = entry.kind.trim();
  if (!kind) {
    throw new Error(
      "registerKindRecordDisposition requires a non-empty kind slug — an unaddressable entry can never be resolved by the host.",
    );
  }
  registry.set(kind, { ...entry, kind });
}

/** The kind's declared disposition, or null when it has none. */
export function resolveKindRecordDisposition(
  kind: string | null | undefined,
): KindRecordDisposition | null {
  if (!kind) return null;
  // Every Table is a kind, and its records are records (design §6.2 item 1, `disposition_of`).
  if (isTableKind(kind)) {
    return { kind, disposition: "record", label: "Record", labelPlural: "Records", storage: "table" };
  }
  return registry.get(kind) ?? null;
}

/** Every declared record kind — the enumerable surface (admin maps, tests). */
export function listKindRecordDispositions(): KindRecordDisposition[] {
  return [...registry.values()];
}

/** Test-only reset. */
export function clearKindRecordDispositions(): void {
  registry.clear();
}
