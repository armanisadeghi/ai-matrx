/**
 * Shared human/agent copy formatters for the CMS surfaces.
 *
 * SECURITY POSTURE: the list API already returns `ClientSiteSummary`, which
 * carries `has_data_api_key` and never the key itself. These builders take the
 * SUMMARY shape for exactly that reason — copy the row the list rendered, not a
 * refetched full `ClientSite` (which does carry `data_api_key`). The masked key
 * card on the collections tab keeps its own reveal/rotate affordances; nothing
 * here widens them.
 */

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import type { ClientSiteSummary } from "@/features/cms/types";

export function cmsLocation(surface: string): string {
  return `AI Matrx — CMS — ${surface}`;
}

export function siteSummary(s: ClientSiteSummary): string {
  return humanLines([
    ["Site", s.name],
    ["Slug", s.slug],
    ["Domain", s.domain],
    ["Active", s.is_active ? "yes" : "no"],
    ["Has data key", s.has_data_api_key ? "yes" : "no"],
    ["Created", s.created_at],
    ["Updated", s.updated_at],
  ]);
}

/** Allowlist projection — never spread a site row into a payload. */
export function siteBrief(s: ClientSiteSummary) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    domain: s.domain,
    is_active: s.is_active,
    // The FACT of a key, never the key. Matches ClientSiteSummary's contract.
    has_data_api_key: s.has_data_api_key,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

export function sitesListSummary(sites: ClientSiteSummary[]): string {
  return sites
    .map(
      (s) =>
        `${s.name} · ${s.slug}${s.domain ? ` · ${s.domain}` : ""} · ${
          s.is_active ? "active" : "inactive"
        }`,
    )
    .join("\n");
}

/** The counts a user reads this page for. */
export function siteCounts(sites: ClientSiteSummary[]) {
  const active = sites.filter((s) => s.is_active).length;
  return {
    total: sites.length,
    active,
    inactive: sites.length - active,
    with_domain: sites.filter((s) => !!s.domain).length,
  };
}

export const SITE_CSV_COLUMNS = [
  { key: "id", header: "ID" },
  { key: "slug", header: "Slug" },
  { key: "name", header: "Name" },
  { key: "domain", header: "Domain" },
  { key: "is_active", header: "Active" },
  { key: "has_data_api_key", header: "Has data key" },
  { key: "created_at", header: "Created" },
  { key: "updated_at", header: "Updated" },
];
