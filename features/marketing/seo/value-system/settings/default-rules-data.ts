/**
 * PLATFORM DEFAULT RULES — data layer.
 *
 * A rule is one meaning row in the `platform-defaults` starter pack: the
 * phrases, how they match, what they MEAN (a dimension value), and what that
 * is worth. Sites adopt the pack, so a default becomes their starting point
 * and stays overridable — Arman's templates-not-enforcements ruling.
 *
 * Everything here is deterministic: `seo.fn_evaluate_matchers` runs these
 * phrases in SQL. No AI reads them, and no AI is charged for them.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";

const assertData = makeAssertData("work with the platform default rules");

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

/** How a phrase is compared to a keyword. Mirrors the engine's own list. */
export const MATCH_KINDS = [
  { value: "word", label: "Whole word", hint: "“free” hits “free pickup”, not “freedom”." },
  { value: "contains", label: "Contains", hint: "Anywhere in the phrase." },
  { value: "starts_with", label: "Starts with", hint: "“how to …”" },
  { value: "ends_with", label: "Ends with", hint: "“… near me”" },
  { value: "exact", label: "Exact phrase", hint: "The whole search, nothing more." },
] as const;

export const EFFECTS = [
  { value: "add", label: "Add points", hint: "± from the 100 baseline. −60 makes it worse." },
  { value: "scale", label: "Multiply", hint: "0.05–5. Use for relative words only." },
  { value: "never", label: "Never valuable", hint: "Forces the score to 0." },
] as const;

export interface DefaultRule {
  id: string;
  label: string;
  dimensionSlug: string;
  valueSlug: string;
  matchKind: string;
  phrases: string[];
  exclusions: string[];
  effect: string;
  amount: number | null;
  notes: string | null;
  sort: number;
  updatedAt: string;
}

export async function listDefaultRules(
  signal?: AbortSignal,
): Promise<DefaultRule[]> {
  const response = await (await seoDb())
    .rpc("platform_default_rules")
    .abortSignal(signal ?? new AbortController().signal);
  const rows = assertData(response.data, response.error) ?? [];
  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label ?? ""),
    dimensionSlug: String(row.dimension_slug ?? ""),
    valueSlug: String(row.value_slug ?? ""),
    matchKind: String(row.match_kind ?? "word"),
    phrases: (row.phrases ?? []) as string[],
    exclusions: (row.exclusions ?? []) as string[],
    effect: String(row.effect ?? "add"),
    amount: row.amount === null ? null : Number(row.amount),
    notes: row.notes === null ? null : String(row.notes),
    sort: Number(row.sort ?? 0),
    updatedAt: String(row.updated_at ?? ""),
  }));
}

export async function saveDefaultRule(input: {
  id: string | null;
  label: string;
  dimensionSlug: string;
  valueSlug: string;
  matchKind: string;
  phrases: string[];
  exclusions: string[];
  effect: string;
  amount: number | null;
  notes?: string | null;
  sort?: number;
}): Promise<string> {
  const response = await (await seoDb()).rpc("platform_default_rule_save", {
    p_label: input.label,
    p_dimension_slug: input.dimensionSlug,
    p_value_slug: input.valueSlug,
    p_match_kind: input.matchKind,
    p_phrases: input.phrases,
    p_effect: input.effect,
    p_exclusions: input.exclusions,
    p_sort: input.sort ?? 0,
    // Omitted rather than sent as null: the RPC defaults them, and a `never`
    // rule genuinely has no amount.
    ...(input.id ? { p_id: input.id } : {}),
    ...(input.amount !== null && input.amount !== undefined
      ? { p_amount: input.amount }
      : {}),
    ...(input.notes ? { p_notes: input.notes } : {}),
  });
  return String(assertData(response.data, response.error));
}

export async function deleteDefaultRule(id: string): Promise<void> {
  const response = await (await seoDb()).rpc("platform_default_rule_delete", {
    p_id: id,
  });
  assertData(response.data ?? null, response.error);
}
