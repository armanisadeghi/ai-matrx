/**
 * Pattern-rule data access — direct Supabase CRUD over
 * `seo.keyword_class_rule` (RLS is the guard: world-readable templates,
 * owner-writable rules; clients can never mint a template). Mirrors
 * `data-dig.ts` for dig rules — adoption is a client-side copy-insert.
 */

import { supabase } from "@/utils/supabase/client";
import { requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
import type {
  ClassRuleDraft,
  KeywordClassRuleRow,
} from "@/features/marketing/search-console/lib/class-rules";
import { makeAssertData } from "@/utils/errors";

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
  organizationId: string | null,
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
  const db = await seoDb();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const response = await db
    .from("keyword_class_rule")
    .insert({
      ...ruleWriteColumns(draft, siteId, organizationId),
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
  const response = await (await seoDb())
    .from("keyword_class_rule")
    .update(ruleWriteColumns(draft, siteId, organizationId))
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
      organization_id: organizationId,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("*")
    .single();
  return assertData(response.data, response.error, "adopt that rule template");
}
