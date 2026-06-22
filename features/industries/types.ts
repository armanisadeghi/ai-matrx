/**
 * Industries — a faceted, platform-curated taxonomy (NOT per-tenant scopes).
 *
 * Industry is an access-control input (it gates Shared Knowledge Resources) and
 * a classification spine (it seeds default scope templates and structures
 * per-industry tooling / public pages). It is admin-curated — tenants cannot
 * edit it — and lives in `public.industries` + `public.org_industries`.
 *
 * Faceted, not a rigid tree: each node carries a `facet` and an optional
 * `parentId` for nesting WITHIN a facet, so the same leaf ("Legal → Workers'
 * Comp → California") is reachable by any ordering as a navigation path.
 */

export type IndustryFacet =
  | "domain"
  | "practice_area"
  | "jurisdiction"
  | "specialty";

export interface Industry {
  id: string;
  slug: string;
  name: string;
  facet: IndustryFacet;
  parentId: string | null;
  defaultTemplateId: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface OrgIndustry {
  organizationId: string;
  industryId: string;
  isPrimary: boolean;
}

export const INDUSTRY_FACETS: { value: IndustryFacet; label: string }[] = [
  { value: "domain", label: "Domain" },
  { value: "practice_area", label: "Practice area" },
  { value: "jurisdiction", label: "Jurisdiction" },
  { value: "specialty", label: "Specialty" },
];
