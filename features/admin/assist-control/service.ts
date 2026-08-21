"use client";

import type { Database } from "@/types/database.types";
import { operationFailed } from "@/utils/errors";
import { createClient } from "@/utils/supabase/client";

export type AssistProducerPolicy =
  Database["platform"]["Tables"]["assist_producer_policy"]["Row"];

export async function listAssistProducerPolicies(): Promise<
  AssistProducerPolicy[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .schema("platform")
    .from("assist_producer_policy")
    .select("*")
    .order("feature_key")
    .order("display_name");
  if (error) throw operationFailed("load the assist producer policies", error);
  return data ?? [];
}

export async function updateAssistProducerPolicy(
  row: AssistProducerPolicy,
  patch: Partial<
    Pick<
      AssistProducerPolicy,
      | "production_enabled"
      | "presentation_enabled"
      | "disposition"
      | "audit_status"
      | "max_pending_per_user"
      | "max_presented_per_cycle"
      | "working_message"
      | "rationale"
    >
  >,
  reason: string,
): Promise<AssistProducerPolicy> {
  const supabase = createClient();
  const next = { ...row, ...patch };
  const { data, error } = await supabase.rpc(
    "admin_upsert_assist_producer_policy",
    {
      p_source_pattern: next.source_pattern,
      p_match_kind: next.match_kind,
      p_display_name: next.display_name,
      p_feature_key: next.feature_key,
      p_disposition: next.disposition,
      p_audit_status: next.audit_status,
      p_production_enabled: next.production_enabled,
      p_presentation_enabled: next.presentation_enabled,
      p_cost_class: next.cost_class,
      p_max_pending_per_user: next.max_pending_per_user,
      p_max_presented_per_cycle: next.max_presented_per_cycle,
      p_working_message: next.working_message ?? "",
      p_rationale: next.rationale,
      p_config: next.config,
      p_reason: reason,
      p_expected_version: row.version,
    },
  );
  if (error) throw operationFailed("save this assist policy", error);
  return data;
}
