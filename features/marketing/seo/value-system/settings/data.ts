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

import { z } from "zod";
import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import { makeGovernedDataAsserter } from "@/utils/errors";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeGovernedDataAsserter(
  "reach these value settings",
  /^(gsc_vocab_[a-z_]+|gsc_bad_vocab_kind|seo_settings_[a-z_]+):\s*/,
);

const settingsScopeSchema = z.enum(["platform", "org", "brand", "site"]);
export type SettingsScope = z.infer<typeof settingsScopeSchema>;

const valueLevelSchema = z.object({
  value: z.string().min(1),
  label: z.string().nullable().optional(),
  /** Null only for the reserved `negative` guard, which is not a score range. */
  min_score: z.number().nullable(),
  /** Present on inherited rows: which tier it came from. */
  source: settingsScopeSchema.optional(),
});
export type ValueLevel = z.infer<typeof valueLevelSchema>;

const valueSettingsSideSchema = z.object({
  baseline: z.number().nullable(),
  levels: z.array(valueLevelSchema).nullable(),
});
export type ValueSettingsSide = z.infer<typeof valueSettingsSideSchema>;

const valueSettingsScopePayloadSchema = z.object({
  scope: settingsScopeSchema,
  id: z.string().uuid().nullable(),
  label: z.string().nullable(),
  may_edit: z.boolean(),
  parent: z
    .object({
      scope: settingsScopeSchema,
      id: z.string().uuid().optional(),
      label: z.string(),
    })
    .nullable(),
  sites_affected: z.number(),
  own: valueSettingsSideSchema,
  inherited: valueSettingsSideSchema,
  effective: valueSettingsSideSchema,
});
export type ValueSettingsScopePayload = z.infer<
  typeof valueSettingsScopePayloadSchema
>;

export async function getValueSettings(
  scope: SettingsScope,
  id: string | null,
  signal?: AbortSignal,
): Promise<ValueSettingsScopePayload> {
  const response = await (
    await seoDb()
  )
    .rpc("value_settings_scope", { p_scope: scope, p_id: id ?? undefined })
    .abortSignal(signal ?? new AbortController().signal);
  const data = assertData(response.data, response.error);
  return valueSettingsScopePayloadSchema.parse(data);
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
  const response = await (
    await seoDb()
  ).rpc("set_value_settings", {
    p_scope: input.scope,
    p_id: input.id ?? undefined,
    ...(input.baseline === undefined || input.baseline === null
      ? {}
      : { p_baseline: input.baseline }),
    ...(input.levels === undefined ? {} : { p_levels: input.levels }),
    p_clear: input.clear ?? [],
  });
  const data = assertData(
    response.data,
    response.error,
    "save these value settings",
  );
  return valueSettingsScopePayloadSchema.parse(data);
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
  "matchers" | "worth" | "geo" | "topics" | "combos" | "guidelines";

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
  const response = await (
    await seoDb()
  )
    .rpc("site_meaning_copy_sources", { p_to_site: siteId })
    .abortSignal(signal ?? new AbortController().signal);
  return (assertData(response.data, response.error) ??
    []) as MeaningCopySource[];
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
  const response = await (
    await seoDb()
  ).rpc("site_meaning_copy", {
    p_from_site: input.fromSiteId,
    p_to_site: input.toSiteId,
    p_parts: input.parts,
    p_dry_run: input.dryRun,
  });
  return assertData(
    response.data,
    response.error,
  ) as unknown as MeaningCopyResult;
}

// ── Autonomy modes (KI-044) ────────────────────────────────────────────────
// Which of the five human-in-the-loop modes each AI step runs in. A setting, so
// it rides the same ladder: platform → organization → brand → site.
// Policy: /policies/human-in-the-loop-autonomy-modes.md — four modes shipped
// 2026-08-25 and `off` was added by Arman's amendment the same day.

export type AutonomyMode =
  | "auto_platform"
  | "auto_org"
  | "review_timeout"
  | "review_required"
  | "off";

export interface AutonomyCapability {
  slug: string;
  label: string;
  description: string;
  default_mode: AutonomyMode;
  default_timeout_hours: number | null;
  /** False when the running code does not consult this setting yet. */
  enforced: boolean;
  enforcement_note: string | null;
  own_mode: AutonomyMode | null;
  own_timeout_hours: number | null;
  effective: {
    mode: AutonomyMode;
    source: string;
    timeout_hours?: number | null;
  };
}

export interface AutonomyScopePayload {
  scope: SettingsScope;
  id: string | null;
  label: string | null;
  parent: { scope: SettingsScope; id?: string; label: string } | null;
  may_edit: boolean;
  capabilities: AutonomyCapability[];
}

export async function getAutonomyModes(
  scope: SettingsScope,
  id: string | null,
  signal?: AbortSignal,
): Promise<AutonomyScopePayload> {
  const response = await (
    await seoDb()
  )
    .rpc("ai_autonomy_scope", { p_scope: scope, p_id: id ?? undefined })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(
    response.data,
    response.error,
  ) as unknown as AutonomyScopePayload;
}

export async function setAutonomyMode(input: {
  scope: SettingsScope;
  id: string | null;
  capability: string;
  mode?: AutonomyMode;
  timeoutHours?: number | null;
  clear?: boolean;
}): Promise<AutonomyScopePayload> {
  const response = await (
    await seoDb()
  ).rpc("set_ai_autonomy", {
    p_scope: input.scope,
    p_capability: input.capability,
    p_id: input.id ?? undefined,
    ...(input.mode ? { p_mode: input.mode } : {}),
    ...(input.timeoutHours === undefined || input.timeoutHours === null
      ? {}
      : { p_timeout_hours: input.timeoutHours }),
    p_clear: input.clear ?? false,
  });
  return assertData(
    response.data,
    response.error,
  ) as unknown as AutonomyScopePayload;
}
