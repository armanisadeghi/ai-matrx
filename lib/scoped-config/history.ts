// lib/scoped-config/history.ts
//
// THE SETTINGS CHANGE LOG, read. Every knob write — platform value, organization,
// scope row, personal — lands one row in `platform.knob_override_audit` from a table
// trigger (so no client can write without leaving one), stamped with the door it came
// through. Two read doors:
//
//   * `platform.knob_history`       one key, one rung (+ the platform rung), newest first
//   * `platform.knob_configuration` an organization's effective configuration, now or
//                                   replayed at a moment — the "Copy configuration" JSON
//
// Proven live by `pnpm check:settings-history`. Pure helpers (`diffConfigurations`,
// `doorLabel`) are unit-tested in `__tests__/history.test.ts`.

import { createClient } from "@/utils/supabase/client";
import type { KnobScopeKindName } from "./types";

export type KnobHistoryEntry = {
  id: number;
  at: string;
  action: "set" | "update" | "clear" | "rung_lock" | "rung_unlock";
  scope_kind: KnobScopeKindName | "platform" | "platform_default";
  scope_id: string | null;
  organization_id: string | null;
  old_value: unknown;
  new_value: unknown;
  set_note: string | null;
  /** ui | api | mcp | server | migration — null when written before doors were recorded. */
  door: string | null;
  actor_id: string | null;
  actor_name: string | null;
  /** The entry is at the rung the row edits (so "Revert to this" applies). */
  is_this_rung: boolean;
};

export async function fetchKnobHistory(options: {
  feature: string;
  key: string;
  /** null = the platform rung only (the system register). */
  organizationId: string | null;
  scopeKind?: KnobScopeKindName | null;
  scopeId?: string | null;
  limit?: number;
}): Promise<KnobHistoryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_history", {
    p_feature: options.feature,
    p_key: options.key,
    p_organization_id: options.organizationId ?? undefined,
    p_scope_kind: options.scopeKind ?? undefined,
    p_scope_id: options.scopeId ?? undefined,
    p_limit: options.limit ?? 30,
  });
  if (error) throw error;
  const entries = (data as { entries?: KnobHistoryEntry[] } | null)?.entries;
  return Array.isArray(entries) ? entries : [];
}

/** The door a change came through, said the way a person reads it. */
export function doorLabel(door: string | null): string {
  switch (door) {
    case "ui":
      return "in the app";
    case "api":
      return "through the API";
    case "mcp":
      return "by an agent tool";
    case "server":
      return "by the server";
    case "migration":
      return "by a platform update";
    case null:
    case undefined:
    case "":
      return "door not recorded";
    default:
      return `via ${door}`;
  }
}

export type ConfigurationKnob = {
  key: string;
  feature: string;
  name: string;
  label: string;
  value_type: string;
  platform_value: unknown;
  organization_value: unknown;
  effective_value: unknown;
  origin: "organization" | "platform";
};

export type OrganizationConfiguration = {
  organization_id: string | null;
  as_of: string | null;
  generated_at: string;
  history_covers_platform_since: string | null;
  replayed: boolean;
  knobs: ConfigurationKnob[];
};

export async function fetchOrganizationConfiguration(
  organizationId: string | null,
  asOf?: string | null,
): Promise<OrganizationConfiguration> {
  const supabase = createClient();
  const { data, error } = await supabase.schema("platform").rpc("knob_configuration", {
    p_organization_id: organizationId ?? undefined,
    p_as_of: asOf ?? undefined,
  });
  if (error) throw error;
  return data as unknown as OrganizationConfiguration;
}

export type ConfigurationDifference = {
  key: string;
  label: string;
  left: unknown;
  right: unknown;
  leftOrigin: string | null;
  rightOrigin: string | null;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Every key whose EFFECTIVE value differs between two configurations (two
 * organizations, or one organization now vs. at a date). A key present on only
 * one side counts as a difference with the other side `undefined`.
 */
export function diffConfigurations(
  left: Pick<OrganizationConfiguration, "knobs">,
  right: Pick<OrganizationConfiguration, "knobs">,
): ConfigurationDifference[] {
  const byKey = new Map<string, { l?: ConfigurationKnob; r?: ConfigurationKnob }>();
  for (const k of left.knobs) byKey.set(k.key, { l: k });
  for (const k of right.knobs) byKey.set(k.key, { ...(byKey.get(k.key) ?? {}), r: k });
  const out: ConfigurationDifference[] = [];
  for (const [key, { l, r }] of byKey) {
    if (l && r && same(l.effective_value, r.effective_value)) continue;
    out.push({
      key,
      label: (l ?? r)!.label,
      left: l?.effective_value,
      right: r?.effective_value,
      leftOrigin: l?.origin ?? null,
      rightOrigin: r?.origin ?? null,
    });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}
