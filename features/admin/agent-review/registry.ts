import { createClient } from "@/utils/supabase/client";
import { readAllRows } from "@/lib/supabase/readAllRows";
import type { Database } from "@/types/database.types";

export type TaxonomyNodeRow =
  Database["platform"]["Tables"]["taxonomy_node"]["Row"];
export type RepoRow = Database["platform"]["Tables"]["repo"]["Row"];

/** A domain with the features that hang off it, in display order. */
export type RegistryDomain = {
  id: string;
  slug: string;
  name: string;
  status: string;
  features: RegistryFeature[];
};

export type RegistryFeature = {
  id: string;
  slug: string;
  name: string;
  status: string;
  domainId: string;
};

export type ReviewRegistry = {
  domains: RegistryDomain[];
  /** Every feature, keyed by id — the card renders a classification without
   * walking the domain tree. */
  featuresById: Map<string, RegistryFeature>;
  domainsById: Map<string, RegistryDomain>;
  repos: RepoRow[];
};

export const EMPTY_REVIEW_REGISTRY: ReviewRegistry = {
  domains: [],
  featuresById: new Map(),
  domainsById: new Map(),
  repos: [],
};

/**
 * The registry IS the classification vocabulary (Arman, 2026-08-20) — read it
 * whole, never a page of it, because the filter lists are treated as complete.
 */
export async function loadReviewRegistry(): Promise<ReviewRegistry> {
  const supabase = createClient();

  const [nodes, repos] = await Promise.all([
    readAllRows<TaxonomyNodeRow>(
      ({ from, to }) =>
        supabase
          .schema("platform")
          .from("taxonomy_node")
          .select("*", { count: "exact" })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "platform.taxonomy_node" },
    ),
    readAllRows<RepoRow>(
      ({ from, to }) =>
        supabase
          .schema("platform")
          .from("repo")
          .select("*", { count: "exact" })
          .eq("is_active", true)
          .order("slug", { ascending: true })
          .range(from, to),
      { label: "platform.repo" },
    ),
  ]);

  const domainsById = new Map<string, RegistryDomain>();
  for (const node of nodes) {
    if (node.level !== "domain") continue;
    domainsById.set(node.id, {
      id: node.id,
      slug: node.slug,
      name: node.name,
      status: node.status,
      features: [],
    });
  }

  const featuresById = new Map<string, RegistryFeature>();
  for (const node of nodes) {
    if (node.level !== "feature" || !node.parent_id) continue;
    const domain = domainsById.get(node.parent_id);
    if (!domain) continue;
    const feature: RegistryFeature = {
      id: node.id,
      slug: node.slug,
      name: node.name,
      status: node.status,
      domainId: node.parent_id,
    };
    featuresById.set(node.id, feature);
    domain.features.push(feature);
  }

  const domains = Array.from(domainsById.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const domain of domains) {
    domain.features.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    domains,
    featuresById,
    domainsById,
    repos: repos.sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}
