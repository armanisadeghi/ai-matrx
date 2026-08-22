/**
 * THE one write path for `seo.keyword_class_rule` — direct Supabase CRUD
 * (RLS is the guard: world-readable templates, owner-writable rules; clients
 * can never mint a template). Mirrors `data-dig.ts` for dig rules — adoption
 * is a client-side copy-insert.
 *
 * ONE TABLE, ONE ENGINE (D34). A rule may set a traffic CLASS, a value
 * MULTIPLIER, or both, and may match by phrase OR by fact. Rather than let a
 * second module learn to insert into this table, the value-system rule editor
 * (`features/marketing/seo/value-system/rules/`) calls
 * `createValueRule`/`updateValueRule`/`archiveRule` here. The DB is the
 * authority on what a coherent row is — `keyword_class_rule_matcher_present`,
 * `_effect_present`, `_value_multiplier_range` and the
 * `keyword_class_rule_assert_facet` / `_assert_pattern` triggers — so this
 * module never re-implements those checks, it just carries their messages back.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type {
  ClassRuleDraft,
  KeywordClassRuleRow,
} from "@/features/marketing/search-console/lib/class-rules";
import { makeAssertData } from "@/utils/errors";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

async function seoDb() {
  await requireAuthenticatedSupabaseSession(supabase);
  return supabase.schema("seo");
}

const assertData = makeAssertData("reach your keyword classification rules");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listClassRules(
  siteId: string,
  signal?: AbortSignal,
): Promise<KeywordClassRuleRow[]> {
  if (!UUID_RE.test(siteId)) throw new Error(`Invalid site id: ${siteId}`);
  const response = await (await seoDb())
    .from("keyword_class_rule")
    .select("*")
    .is("deleted_at", null)
    .or(`site_id.is.null,site_id.eq.${siteId}`)
    .order("is_template", { ascending: false })
    .order("name", { ascending: true })
    .abortSignal(signal ?? new AbortController().signal);
  return assertData(response.data, response.error);
}

function ruleWriteColumns(
  draft: ClassRuleDraft,
  siteId: string | null,
  organizationId: string,
) {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    pattern: draft.pattern.trim().toLowerCase(),
    match_kind: draft.matchKind,
    target_class: draft.targetClass,
    notes: draft.notes.trim() || null,
    auto_apply: draft.autoApply,
    site_id: siteId,
    organization_id: organizationId,
  };
}

export async function createClassRule(
  draft: ClassRuleDraft,
  siteId: string | null,
  organizationId: string | null,
): Promise<KeywordClassRuleRow> {
  const resolvedOrganizationId = await ensureOrgId(organizationId);
  const db = await seoDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const response = await db
    .from("keyword_class_rule")
    .insert({
      ...ruleWriteColumns(draft, siteId, resolvedOrganizationId),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();
  return assertData(response.data, response.error, "save that classification rule");
}

export async function updateClassRule(
  ruleId: string,
  draft: ClassRuleDraft,
  siteId: string | null,
  organizationId: string | null,
): Promise<KeywordClassRuleRow> {
  const resolvedOrganizationId = await ensureOrgId(organizationId);
  const response = await (await seoDb())
    .from("keyword_class_rule")
    .update(ruleWriteColumns(draft, siteId, resolvedOrganizationId))
    .eq("id", ruleId)
    .select("*")
    .single();
  return assertData(response.data, response.error, "update that classification rule");
}

export async function deleteClassRule(ruleId: string): Promise<void> {
  const response = await (await seoDb())
    .from("keyword_class_rule")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (response.error) throw new Error(response.error.message);
}

/** Copy-insert a system template as an owned, site-pinned rule. */
export async function adoptClassTemplate(
  template: KeywordClassRuleRow,
  siteId: string,
  organizationId: string | null,
): Promise<KeywordClassRuleRow> {
  const resolvedOrganizationId = await ensureOrgId(organizationId);
  const db = await seoDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const response = await db
    .from("keyword_class_rule")
    .insert({
      name: template.name,
      description: template.description,
      pattern: template.pattern,
      match_kind: template.match_kind,
      target_class: template.target_class,
      notes: template.notes,
      auto_apply: false,
      site_id: siteId,
      organization_id: resolvedOrganizationId,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();
  return assertData(response.data, response.error, "adopt that rule template");
}

// ── Value rules (D34) — the SAME table, the same module ─────────────────────
//
// A value rule carries `value_multiplier` and matches by phrase (pattern +
// match_kind) OR by fact (match_facet + match_facet_value). `target_class` is
// null unless the same row is also a classification rule.

export interface ValueRuleDraft {
  name: string;
  description: string;
  /** Phrase match. Empty when the rule matches by fact instead. */
  pattern: string;
  matchKind: string | null;
  /** Fact match: a dimension slug from seo.facet_dimension_catalog. */
  matchFacet: string | null;
  matchFacetValue: string | null;
  /** > 0 and <= 100. Zero is impossible by design — the score is a product. */
  valueMultiplier: number;
  notes: string;
}

function valueRuleWriteColumns(
  draft: ValueRuleDraft,
  siteId: string,
  organizationId: string,
) {
  const byFact = Boolean(draft.matchFacet);
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    pattern: byFact ? null : draft.pattern.trim().toLowerCase(),
    match_kind: byFact ? null : draft.matchKind,
    match_facet: byFact ? draft.matchFacet : null,
    match_facet_value: byFact ? draft.matchFacetValue : null,
    value_multiplier: draft.valueMultiplier,
    notes: draft.notes.trim() || null,
    site_id: siteId,
    organization_id: organizationId,
  };
}

export async function createValueRule(
  draft: ValueRuleDraft,
  siteId: string,
  organizationId: string | null,
): Promise<KeywordClassRuleRow> {
  const resolvedOrganizationId = await ensureOrgId(organizationId);
  const db = await seoDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const response = await db
    .from("keyword_class_rule")
    .insert({
      ...valueRuleWriteColumns(draft, siteId, resolvedOrganizationId),
      auto_apply: false,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();
  return assertData(response.data, response.error, "save that value rule");
}

export async function updateValueRule(
  ruleId: string,
  draft: ValueRuleDraft,
  siteId: string,
  organizationId: string | null,
): Promise<KeywordClassRuleRow> {
  const resolvedOrganizationId = await ensureOrgId(organizationId);
  const response = await (await seoDb())
    .from("keyword_class_rule")
    .update(valueRuleWriteColumns(draft, siteId, resolvedOrganizationId))
    .eq("id", ruleId)
    .select("*")
    .single();
  return assertData(response.data, response.error, "update that value rule");
}

/** Archive = soft delete. The same call `deleteClassRule` makes, named for
 *  what the value UI promises the user. */
export async function archiveRule(ruleId: string): Promise<void> {
  await deleteClassRule(ruleId);
}
