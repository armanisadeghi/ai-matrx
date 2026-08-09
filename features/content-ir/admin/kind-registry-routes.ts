/**
 * Kind Registry route builders — one authority for every door onto a kind.
 *
 * Pure, no JSX: the Catalog table and the status Board both link kinds, and
 * neither should pull the other in just to agree on a URL.
 *
 * THE LIVENESS RULE (common-docs/policies/no-dead-ends.md): a `snapshot-only`
 * row is a kind that is GONE from the live DB. `gatherKindDetail` reads live
 * `content_ir.kind_definition`, finds nothing, and the detail route calls
 * `notFound()` — so a link on that row ships a guaranteed 404. These builders
 * return `undefined` for it, and the row keeps its "gone from live DB" flag,
 * which is the honest answer. A door that 404s is worse than no door.
 */

import type { KindBoardRow } from "@/features/content-ir/admin/kind-detail-types";

const KIND_REGISTRY_BASE = "/administration/utilities/kind-registry";

/** The kind's detail page, or `undefined` when the record no longer exists. */
export function kindDetailHref(row: KindBoardRow): string | undefined {
  if (row.presence === "snapshot-only") return undefined;
  return `${KIND_REGISTRY_BASE}/${encodeURIComponent(row.kind)}`;
}

/**
 * A COUNT IS A DOOR. `3 components`, `2 surfaces`, `4 examples` each describe
 * live rows the detail page already lists — `assets` for components/surfaces,
 * `examples` for examples. The detail route reads `?tab=` server-side.
 */
export function kindTabHref(
  row: KindBoardRow,
  tab: "preview" | "examples" | "assets" | "gate" | "schema",
): string | undefined {
  const base = kindDetailHref(row);
  return base ? `${base}?tab=${tab}` : undefined;
}
