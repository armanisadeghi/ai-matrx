/**
 * Industries data access. Reads go direct to Supabase (`public.industries` /
 * `public.org_industries` are PostgREST-exposed, read-only taxonomy). WRITES go
 * through the SECURITY DEFINER RPCs (`industry_upsert`, `industry_assign_org`,
 * `industry_unassign_org`) — super-admin gated in the DB — never a raw insert.
 */

import { supabase } from "@/utils/supabase/client";
import type { Industry, IndustryFacet, OrgIndustry } from "./types";

type IndustryRow = {
  id: string;
  slug: string;
  name: string;
  facet: string;
  parent_id: string | null;
  default_template_id: string | null;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

function rowToIndustry(r: IndustryRow): Industry {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    facet: r.facet as IndustryFacet,
    parentId: r.parent_id,
    defaultTemplateId: r.default_template_id,
    description: r.description,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  };
}

export async function fetchIndustries(includeInactive = false): Promise<Industry[]> {
  let q = supabase.schema("iam").from("industries").select("*").order("sort_order");
  if (!includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToIndustry(r as IndustryRow));
}

export async function fetchOrgIndustries(orgId: string): Promise<OrgIndustry[]> {
  const { data, error } = await supabase
    .schema("iam").from("org_industries")
    .select("organization_id, industry_id, is_primary")
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    organizationId: (r as { organization_id: string }).organization_id,
    industryId: (r as { industry_id: string }).industry_id,
    isPrimary: Boolean((r as { is_primary: boolean }).is_primary),
  }));
}

export async function upsertIndustry(input: {
  slug: string;
  name: string;
  facet?: IndustryFacet;
  parentId?: string | null;
  defaultTemplateId?: string | null;
  description?: string | null;
  sortOrder?: number;
}): Promise<Industry> {
  const { data, error } = await supabase.rpc("industry_upsert", {
    p_slug: input.slug,
    p_name: input.name,
    p_facet: input.facet ?? "domain",
    p_parent_id: input.parentId ?? null,
    p_default_template_id: input.defaultTemplateId ?? null,
    p_description: input.description ?? null,
    p_sort_order: input.sortOrder ?? 0,
  });
  if (error) throw new Error(error.message);
  return rowToIndustry(data as IndustryRow);
}

export async function assignOrgIndustry(
  orgId: string,
  industryId: string,
  isPrimary = false,
): Promise<void> {
  const { error } = await supabase.rpc("industry_assign_org", {
    p_organization_id: orgId,
    p_industry_id: industryId,
    p_is_primary: isPrimary,
  });
  if (error) throw new Error(error.message);
}

export async function unassignOrgIndustry(
  orgId: string,
  industryId: string,
): Promise<void> {
  const { error } = await supabase.rpc("industry_unassign_org", {
    p_organization_id: orgId,
    p_industry_id: industryId,
  });
  if (error) throw new Error(error.message);
}
