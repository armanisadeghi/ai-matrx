/**
 * Brand audience personas — `web.brand_persona` (who this brand sells to).
 * Direct, RLS-governed Supabase reads and writes (repo data rules); delete is
 * a soft delete. The persona list also rides into the brand context agents read.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/utils/supabase/client";
import { authenticatedWebDb } from "@/utils/supabase/webDb";
import { assertData, assertMutated } from "@/features/marketing/data/service";
import { marketingKeys } from "@/features/marketing/data/hooks";
import type { Json } from "@/types/database.types";
import {
  PERSONA_DEMOGRAPHIC_FIELDS,
  type BrandPersona,
  type BrandPersonaValues,
  type PersonaDemographics,
} from "@/features/marketing/lib/persona-model";

const PERSONA_COLUMNS =
  "id, organization_id, brand_id, name, summary, demographics, goals, pain_points, objections, channels, is_primary, sort, version";

export async function listBrandPersonas(brandId: string, signal?: AbortSignal): Promise<BrandPersona[]> {
  const response = await (await authenticatedWebDb(supabase))
    .from("brand_persona")
    .select(PERSONA_COLUMNS)
    .eq("brand_id", brandId)
    .is("deleted_at", null)
    .order("is_primary", { ascending: false })
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as BrandPersona[];
}

function demographicsJson(current: Json | undefined, next: PersonaDemographics): Json {
  // Keys this editor does not own (other lanes, agents) survive the save.
  const base: { [key: string]: Json } =
    current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
  for (const field of PERSONA_DEMOGRAPHIC_FIELDS) delete base[field.key];
  for (const field of PERSONA_DEMOGRAPHIC_FIELDS) {
    const value = next[field.key]?.trim();
    if (value) base[field.key] = value;
  }
  return base;
}

export async function createBrandPersona(input: {
  organizationId: string;
  brandId: string;
  values: BrandPersonaValues;
  sort: number;
}): Promise<BrandPersona> {
  const { values } = input;
  const response = await (await authenticatedWebDb(supabase))
    .from("brand_persona")
    .insert({
      organization_id: input.organizationId,
      brand_id: input.brandId,
      name: values.name.trim(),
      summary: values.summary.trim() || null,
      demographics: demographicsJson(undefined, values.demographics),
      goals: values.goals,
      pain_points: values.pain_points,
      objections: values.objections,
      channels: values.channels,
      is_primary: values.is_primary,
      sort: input.sort,
    })
    .select(PERSONA_COLUMNS)
    .single();
  return assertData(response.data, response.error) as BrandPersona;
}

export async function updateBrandPersona(input: {
  persona: BrandPersona;
  values: BrandPersonaValues;
}): Promise<BrandPersona> {
  const { persona, values } = input;
  const response = await (await authenticatedWebDb(supabase))
    .from("brand_persona")
    .update({
      name: values.name.trim(),
      summary: values.summary.trim() || null,
      demographics: demographicsJson(persona.demographics, values.demographics),
      goals: values.goals,
      pain_points: values.pain_points,
      objections: values.objections,
      channels: values.channels,
      is_primary: values.is_primary,
    })
    .eq("id", persona.id)
    .is("deleted_at", null)
    .select(PERSONA_COLUMNS)
    .single();
  return assertData(response.data, response.error) as BrandPersona;
}

export async function deleteBrandPersona(personaId: string): Promise<void> {
  const response = await (await authenticatedWebDb(supabase))
    .from("brand_persona")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", personaId)
    .is("deleted_at", null)
    .select("id");
  assertMutated(response.data, response.error, "delete this persona");
}

export function brandPersonasKey(brandId: string) {
  return [...marketingKeys.root, "brand", brandId, "personas"] as const;
}

export function useBrandPersonas(brandId: string) {
  return useQuery({
    queryKey: brandPersonasKey(brandId),
    queryFn: ({ signal }) => listBrandPersonas(brandId, signal),
    enabled: Boolean(brandId),
  });
}

function usePersonaMutation<TInput>(brandId: string, fn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: brandPersonasKey(brandId) }),
  });
}

export const useCreateBrandPersona = (brandId: string) => usePersonaMutation(brandId, createBrandPersona);
export const useUpdateBrandPersona = (brandId: string) => usePersonaMutation(brandId, updateBrandPersona);
export const useDeleteBrandPersona = (brandId: string) => usePersonaMutation(brandId, deleteBrandPersona);
