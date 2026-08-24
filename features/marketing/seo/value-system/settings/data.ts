/**
 * The settings ladder — platform → organization → brand → site.
 *
 * Two numbers cascade: the score BASELINE every keyword starts from, and the
 * LEVEL thresholds that name a score. The nearest scope with an answer wins,
 * and a scope that says nothing is never overwritten from above.
 *
 * Reads `seo.value_settings_scope`, writes `seo.set_value_settings` — the ONE
 * write path for every tier, so a screen can never reach past the guard that
 * decides who may change what. Never resolve the ladder client-side: the server
 * says which tier answered and this layer renders that.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/REGISTER.md (KI-046).
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeAssertData } from "@/utils/errors";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach these value settings");

export type SettingsScope = "platform" | "org" | "brand" | "site";

export interface ValueLevel {
  value: string;
  label?: string | null;
  min_score: number;
  /** Present on inherited rows: which tier it came from. */
  source?: SettingsScope;
}

export interface ValueSettingsSide {
  baseline: number | null;
  levels: ValueLevel[] | null;
}

export interface ValueSettingsScopePayload {
  scope: SettingsScope;
  id: string | null;
  label: string | null;
  may_edit: boolean;
  parent: { scope: SettingsScope; id?: string; label: string } | null;
  /** How many sites this scope's numbers reach. */
  sites_affected: number;
  /** What this scope has said itself — null fields mean "inherits". */
  own: ValueSettingsSide;
  /** What it would use if it said nothing. */
  inherited: ValueSettingsSide;
  /** own ?? inherited — what actually applies today. */
  effective: ValueSettingsSide;
}

export async function getValueSettings(
  scope: SettingsScope,
  id: string | null,
  signal?: AbortSignal,
): Promise<ValueSettingsScopePayload> {
  const response = await (await seoDb())
    .rpc("value_settings_scope", { p_scope: scope, p_id: id ?? undefined })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error) as unknown as ValueSettingsScopePayload;
}

/**
 * `baseline`/`levels` left undefined mean "leave as it is". To hand a setting
 * back to the tier above, name it in `clear` — that is the only way to stop
 * overriding, and it is why "use inherited" is a real action rather than
 * typing the parent's number back in.
 */
export async function setValueSettings(input: {
  scope: SettingsScope;
  id: string | null;
  baseline?: number | null;
  levels?: ValueLevel[] | null;
  clear?: Array<"baseline" | "levels">;
}): Promise<ValueSettingsScopePayload> {
  const response = await (await seoDb()).rpc("set_value_settings", {
    p_scope: input.scope,
    p_id: input.id ?? undefined,
    ...(input.baseline === undefined || input.baseline === null
      ? {}
      : { p_baseline: input.baseline }),
    ...(input.levels === undefined ? {} : { p_levels: input.levels }),
    p_clear: input.clear ?? [],
  });
  return assertData(response.data, response.error) as unknown as ValueSettingsScopePayload;
}

// ── Copying meaning to a sibling site (KI-043) ──────────────────────────────
// Meaning belongs to the SITE and is never inherited from a brand or an org.
// Where two sites of one business genuinely share it, this copies it ONCE, on
// demand, additively — it never overwrites what the target already decided.

export interface MeaningCopySource {
  site_id: string;
  label: string;
  domain: string | null;
  same_brand: boolean;
  /** How much meaning this site has to give — matchers + worth + geo + topics. */
  meaning_rows: number;
}

export type MeaningCopyPart =
  | "matchers"
  | "worth"
  | "geo"
  | "topics"
  | "combos"
  | "guidelines";

export interface MeaningCopyResult {
  dry_run: boolean;
  from: { id: string; label: string };
  to: { id: string; label: string };
  parts: Array<{
    part: MeaningCopyPart;
    copied: number;
    skipped_existing: number;
  }>;
  total_copied: number;
  total_skipped: number;
  next_step: string;
}

export async function getMeaningCopySources(
  siteId: string,
  signal?: AbortSignal,
): Promise<MeaningCopySource[]> {
  const response = await (await seoDb())
    .rpc("site_meaning_copy_sources", { p_to_site: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return (assertData(response.data, response.error) ?? []) as MeaningCopySource[];
}

/**
 * `dryRun` walks the identical server path and rolls back, so the preview can
 * never disagree with what the write actually does.
 */
export async function copySiteMeaning(input: {
  fromSiteId: string;
  toSiteId: string;
  parts: MeaningCopyPart[];
  dryRun: boolean;
}): Promise<MeaningCopyResult> {
  const response = await (await seoDb()).rpc("site_meaning_copy", {
    p_from_site: input.fromSiteId,
    p_to_site: input.toSiteId,
    p_parts: input.parts,
    p_dry_run: input.dryRun,
  });
  return assertData(response.data, response.error) as unknown as MeaningCopyResult;
}
