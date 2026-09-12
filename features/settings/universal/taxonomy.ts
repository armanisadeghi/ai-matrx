// features/settings/universal/taxonomy.ts
//
// The left nav's vocabulary comes from `platform.taxonomy_node` — the SAME
// registry the rest of the product is organised by (23 domains, 175 features).
// Nothing here coins a name, a slug, or a grouping. The complete canonical
// taxonomy is navigable even before a control is registered under a node.
//
// Two ways a setting reaches its domain, in this order:
//   1. `knob.taxonomy` — `platform.knob_index` reads `feature_knob.taxonomy_node_id`
//      and walks up to the domain. This is the real answer (0631 mapped 404 keys).
//   2. Exact slug identity — the key's feature root matched, character for
//      character (with `_` read as `-`), against a registered node's slug.
//      That is identity, not a guess: `education.*` keys belong to the
//      `education` domain because the two names ARE the same name.
// A key neither answers for is NOT invented into a domain. It is listed under
// a plainly-named "not filed yet" section, which empties itself as the
// registry rows get their `taxonomy_node_id` (the 39 commerce.* keys today —
// naming that domain is Arman's call, per 0631).

import { readAllRows } from "@ai-matrx/data/db";
import { createClient } from "@/utils/supabase/client";
import type { KnobTaxonomy, ScopedKnob } from "@/lib/scoped-config/types";

export type TaxonomyNode = {
  id: string;
  slug: string;
  name: string;
  level: string;
  parent_id: string | null;
};

export type TaxonomyIndex = {
  byId: Map<string, TaxonomyNode>;
  bySlug: Map<string, TaxonomyNode>;
};

/** The bucket a key falls into when nothing can say which domain it belongs to. */
export const UNFILED_DOMAIN_SLUG = "not-filed-yet";
export const UNFILED_DOMAIN_NAME = "Not filed under a domain yet";

export async function fetchTaxonomyIndex(): Promise<TaxonomyIndex> {
  const supabase = createClient();
  const rows = await readAllRows<TaxonomyNode>(
    ({ from, to }) =>
      supabase
        .schema("platform")
        .from("taxonomy_node")
        .select("id, slug, name, level, parent_id", { count: "exact" })
        // `id` is the stable primary key required for safe pagination.
        .order("id", { ascending: true })
        .range(from, to)
        .returns<TaxonomyNode[]>(),
    { label: "platform.taxonomy_node (universal settings)" },
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  return { byId, bySlug };
}

/** The canonical feature ancestor for a node, including a sub-feature node. */
export function featureOf(
  node: TaxonomyNode,
  index: TaxonomyIndex,
): TaxonomyNode | null {
  let current: TaxonomyNode | undefined = node;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.level === "feature") return current;
    seen.add(current.id);
    current = current.parent_id ? index.byId.get(current.parent_id) : undefined;
  }
  return null;
}

function domainOf(
  node: TaxonomyNode,
  index: TaxonomyIndex,
): TaxonomyNode | null {
  let current: TaxonomyNode | undefined = node;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.level === "domain") return current;
    seen.add(current.id);
    current = current.parent_id
      ? index.byId.get(current.parent_id)
      : undefined;
  }
  return null;
}

/**
 * Where one key is filed. `null` when neither the registry row nor exact slug
 * identity can say — the caller must render it as unfiled, never guess.
 */
export function resolveKnobTaxonomy(
  knob: ScopedKnob,
  index: TaxonomyIndex,
): KnobTaxonomy | null {
  if (knob.taxonomy) return knob.taxonomy;

  const root = knob.feature.split(".")[0]?.replace(/_/g, "-");
  if (!root) return null;
  const node = index.bySlug.get(root);
  if (!node) return null;

  const domain = domainOf(node, index);
  if (!domain) return null;
  const feature = featureOf(node, index);
  return {
    node_id: node.id,
    node_level: node.level,
    node_slug: node.slug,
    node_name: node.name,
    domain_slug: domain.slug,
    domain_name: domain.name,
    // A sub-feature remains grouped under its registered feature. The settings
    // tree does not invent a second product grouping just to expose a knob.
    feature_slug: feature?.slug ?? null,
    feature_name: feature?.name ?? null,
  };
}

/** Converts a registry `taxonomy_node_id` into the same filing used by knob_index. */
export function taxonomyForNodeId(
  taxonomyNodeId: string | null,
  index: TaxonomyIndex,
): KnobTaxonomy | null {
  if (!taxonomyNodeId) return null;
  const node = index.byId.get(taxonomyNodeId);
  if (!node) return null;
  const domain = domainOf(node, index);
  if (!domain) return null;
  const feature = featureOf(node, index);
  return {
    node_id: node.id,
    node_level: node.level,
    node_slug: node.slug,
    node_name: node.name,
    domain_slug: domain.slug,
    domain_name: domain.name,
    feature_slug: feature?.slug ?? null,
    feature_name: feature?.name ?? null,
  };
}
