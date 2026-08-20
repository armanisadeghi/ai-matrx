// Feature Registry admin — shared types for /administration/utilities/taxonomy.
// Source of truth is platform.taxonomy_node via the public.admin_taxonomy_* RPCs
// (super-admin gated). Doctrine: common-docs/policies/feature-registry.md.

export type TaxonomyLevel = "domain" | "feature" | "subfeature";
export type TaxonomyStatus = "proposed" | "canonical" | "legacy";

export interface TaxonomyRow {
  id: string;
  slug: string;
  name: string;
  level: TaxonomyLevel;
  parent_id: string | null;
  status: TaxonomyStatus;
  anchors: Record<string, unknown>;
  docs_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  child_count: number;
  entity_count: number;
  review_count: number;
}

export interface TaxonomyTreeNode extends TaxonomyRow {
  children: TaxonomyTreeNode[];
}

export function buildTree(rows: TaxonomyRow[]): TaxonomyTreeNode[] {
  const byId = new Map<string, TaxonomyTreeNode>();
  for (const row of rows) byId.set(row.id, { ...row, children: [] });
  const roots: TaxonomyTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const bySlug = (a: TaxonomyTreeNode, b: TaxonomyTreeNode) =>
    a.slug.localeCompare(b.slug);
  for (const node of byId.values()) node.children.sort(bySlug);
  roots.sort(bySlug);
  return roots;
}

export const STATUS_STYLES: Record<
  TaxonomyStatus,
  { badge: string; dot: string; label: string }
> = {
  canonical: {
    badge:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900",
    dot: "bg-emerald-500",
    label: "Canonical",
  },
  proposed: {
    badge:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
    dot: "bg-amber-500",
    label: "Proposed",
  },
  legacy: {
    badge:
      "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800",
    dot: "bg-zinc-400",
    label: "Legacy",
  },
};

/** Stable accent per domain slug so the Map view feels alive but deterministic. */
const DOMAIN_ACCENTS = [
  "from-sky-500/15 to-sky-500/5 border-sky-300/50 dark:border-sky-700/50 text-sky-700 dark:text-sky-300",
  "from-violet-500/15 to-violet-500/5 border-violet-300/50 dark:border-violet-700/50 text-violet-700 dark:text-violet-300",
  "from-emerald-500/15 to-emerald-500/5 border-emerald-300/50 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300",
  "from-amber-500/15 to-amber-500/5 border-amber-300/50 dark:border-amber-700/50 text-amber-700 dark:text-amber-300",
  "from-rose-500/15 to-rose-500/5 border-rose-300/50 dark:border-rose-700/50 text-rose-700 dark:text-rose-300",
  "from-cyan-500/15 to-cyan-500/5 border-cyan-300/50 dark:border-cyan-700/50 text-cyan-700 dark:text-cyan-300",
  "from-fuchsia-500/15 to-fuchsia-500/5 border-fuchsia-300/50 dark:border-fuchsia-700/50 text-fuchsia-700 dark:text-fuchsia-300",
  "from-lime-500/15 to-lime-500/5 border-lime-300/50 dark:border-lime-700/50 text-lime-700 dark:text-lime-300",
  "from-indigo-500/15 to-indigo-500/5 border-indigo-300/50 dark:border-indigo-700/50 text-indigo-700 dark:text-indigo-300",
  "from-orange-500/15 to-orange-500/5 border-orange-300/50 dark:border-orange-700/50 text-orange-700 dark:text-orange-300",
];

export function domainAccent(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  return DOMAIN_ACCENTS[Math.abs(hash) % DOMAIN_ACCENTS.length];
}
