// features/marketing/local/rank-grid/prices.ts — what a `seo_local` action
// costs, read from the LIVE tool definition (`tool.definition` row
// `seo_local`, `parameters.$variants.<action>.description`), parsed by the same
// reader the domain page uses. A description that stops saying it yields null
// and the screen shows "cost unknown".

import { supabase } from "@/utils/supabase/client";
import { priceFromDescription, type ActionPrice } from "@/features/marketing/seo/domain-research/prices";
import { SEO_LOCAL_TOOL } from "./types";

export async function readSeoLocalPrice(action: string): Promise<ActionPrice> {
  const { data, error } = await supabase
    .schema("tool")
    .from("definition")
    .select("parameters")
    .eq("name", SEO_LOCAL_TOOL)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Could not read the seo_local tool definition: ${error.message}`);
  const variants = (data?.parameters as { $variants?: Record<string, { description?: unknown }> } | null)
    ?.$variants;
  return priceFromDescription(variants?.[action]?.description);
}
