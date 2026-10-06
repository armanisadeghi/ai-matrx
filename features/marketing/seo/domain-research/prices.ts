// features/marketing/seo/domain-research/prices.ts — what each `seo_domain`
// action costs, READ FROM THE LIVE TOOL DEFINITION (`tool.definition` row
// `seo_domain`, `parameters.$variants.<action>.description`), never a constant
// here. The definition says it as "Paid — about $0.04 per call; reuses a result
// up to 7 days old for free". A description that stops saying it yields `null`
// and the screen shows "cost unknown" instead of inventing a number.

import { supabase } from "@/utils/supabase/client";
import { DOMAIN_ACTIONS, type DomainAction } from "./types";

export interface ActionPrice {
  /** Dollars per call when nothing stored can be reused; null = the definition does not say. */
  costUsd: number | null;
  /** How old a stored result may be and still be reused free; null = not stated. */
  reuseDays: number | null;
}

export type DomainPrices = Record<DomainAction, ActionPrice>;

const COST = /about\s+\$\s*([0-9]+(?:\.[0-9]+)?)\s+per\s+call/i;
const REUSE = /up\s+to\s+([0-9]+)\s+days?\s+old/i;

export function priceFromDescription(description: unknown): ActionPrice {
  if (typeof description !== "string") return { costUsd: null, reuseDays: null };
  const cost = COST.exec(description);
  const reuse = REUSE.exec(description);
  return {
    costUsd: cost ? Number(cost[1]) : null,
    reuseDays: reuse ? Number(reuse[1]) : null,
  };
}

export function pricesFromParameters(parameters: unknown): DomainPrices {
  const variants =
    parameters && typeof parameters === "object"
      ? ((parameters as Record<string, unknown>)["$variants"] as Record<string, unknown> | undefined)
      : undefined;
  return Object.fromEntries(
    DOMAIN_ACTIONS.map((action) => {
      const variant = variants?.[action] as { description?: unknown } | undefined;
      return [action, priceFromDescription(variant?.description)];
    }),
  ) as DomainPrices;
}

/** One read of the live definition (public tool rows are readable by everyone). */
export async function readDomainPrices(): Promise<DomainPrices> {
  const { data, error } = await supabase
    .schema("tool")
    .from("definition")
    .select("parameters")
    .eq("name", "seo_domain")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Could not read the seo_domain tool definition: ${error.message}`);
  return pricesFromParameters(data?.parameters ?? null);
}
