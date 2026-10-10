/**
 * features/scheduling/service/killSwitch.ts
 *
 * THE read/write path for the pause-everything switch, knob `automation.kill_switch/enabled`
 * (common-docs/policies/ai-model-and-spend-rules.md §7). ON: every automated fire and every
 * automated paid call is refused. OFF resumes nothing that was paused.
 *
 * Read:   platform.knob_resolve (platform value with a null org; an org's effective value with its id).
 * Platform write: platform.feature_knob_set — platform admins only, the door refuses others.
 * Org write: platform.knob_override_set (an org can only turn it ON for itself; clearing removes
 *            the org's own row). A platform ON cannot be overridden off.
 */
import { createClient } from "@/utils/supabase/client";
import { setKnobOverride } from "@/lib/scoped-config/service";

const FEATURE = "automation.kill_switch";
const KEY = "enabled";

export interface KillSwitchState {
  /** The platform-wide switch. */
  platform: boolean;
  /** The effective value for the organization (platform ON or the org's own ON); null for the admin seat. */
  effectiveForOrg: boolean | null;
}

async function resolve(orgId: string | null): Promise<boolean> {
  const { data, error } = await createClient().schema("platform").rpc("knob_resolve", {
    p_feature: FEATURE,
    p_key: KEY,
    p_organization_id: orgId as string,
  });
  if (error) throw new Error(`The pause switch could not be read: ${error.message}`);
  const value =
    data && typeof data === "object" && "value" in (data as Record<string, unknown>)
      ? (data as { value: unknown }).value
      : data;
  if (typeof value !== "boolean") throw new Error("The pause switch answered no true or false.");
  return value;
}

export async function fetchKillSwitch(orgId: string | null): Promise<KillSwitchState> {
  const platform = await resolve(null);
  return { platform, effectiveForOrg: orgId ? await resolve(orgId) : null };
}

export async function setPlatformKillSwitch(on: boolean): Promise<void> {
  const { error } = await createClient()
    .schema("platform")
    .rpc("feature_knob_set", { p_feature: FEATURE, p_key: KEY, p_value: on });
  if (error) throw new Error(`The platform pause switch was refused: ${error.message}`);
}

export async function setOrgKillSwitch(orgId: string, on: boolean): Promise<void> {
  const result = await setKnobOverride({
    feature: FEATURE,
    key: KEY,
    scopeKind: "organization",
    scopeId: orgId,
    organizationId: orgId,
    value: on ? true : null,
    note: on ? "Paused from the organization automations page" : "Turned off from the organization automations page",
  });
  if (!result.ok) {
    throw new Error(
      [result.reason, (result as { detail?: string | null }).detail].filter(Boolean).join(" — ") ||
        "The pause switch was refused.",
    );
  }
}
