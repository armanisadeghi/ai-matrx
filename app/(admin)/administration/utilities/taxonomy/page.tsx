// Feature Registry admin — CRUD + visual map over platform.taxonomy_node.
// Super-admin gated by the (admin) layout; data via public.admin_taxonomy_* RPCs.
// Doctrine: common-docs/policies/feature-registry.md (the DB is the source of truth).

import type { Metadata } from "next";
import TaxonomyAdminClient from "@/features/admin/taxonomy/TaxonomyAdminClient";

export const metadata: Metadata = {
  title: "Feature Registry",
  description:
    "Manage the platform taxonomy — Domains, Features, and Sub-features — live from platform.taxonomy_node.",
};

export default function TaxonomyAdminPage() {
  return <TaxonomyAdminClient />;
}
