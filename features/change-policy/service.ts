/**
 * Change-policy data layer — C-18.
 *
 * Reads go direct to Supabase (RLS: org members read their org's overrides;
 * platform defaults are authenticated-readable). The ONE write path is
 * `platform.set_org_change_policy` (SECURITY DEFINER: org owner/admin AND
 * human actor tier; floored keys rejected for everyone). The catalogue in
 * `catalogue.ts` is the row list; the DB mirrors it so SQL can resolve.
 */

import { supabase } from "@/utils/supabase/client";
import type { ChangeHandlingMode, TimeoutExpiry } from "./catalogue";

export interface OrgChangePolicyRow {
    organization_id: string;
    change_type_key: string;
    handling_mode: ChangeHandlingMode;
    timeout_minutes: number | null;
    timeout_expiry: TimeoutExpiry | null;
    updated_at: string;
    updated_by_tier: string | null;
    created_by_tier: string | null;
}

export interface ResolvedChangeHandling {
    change_type_key: string;
    handling_mode: ChangeHandlingMode;
    timeout_minutes: number | null;
    timeout_expiry: TimeoutExpiry | null;
    tier: number;
    floored: boolean;
    human_only: boolean;
    source: "org_override" | "platform_default" | "structural_floor";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every override the org has (absent key = platform default). */
export async function getOrgChangePolicies(orgId: string): Promise<Map<string, OrgChangePolicyRow>> {
    const { data, error } = await supabase
        .schema("platform")
        .from("org_change_policy")
        .select("organization_id, change_type_key, handling_mode, timeout_minutes, timeout_expiry, updated_at, updated_by_tier, created_by_tier")
        .eq("organization_id", orgId);
    if (error) throw new Error(`Failed to load change policy: ${error.message}`);
    const map = new Map<string, OrgChangePolicyRow>();
    for (const row of (data ?? []) as OrgChangePolicyRow[]) map.set(row.change_type_key, row);
    return map;
}

export interface SetOrgChangePolicyArgs {
    orgId: string;
    changeTypeKey: string;
    /** null clears the override (back to the platform default). */
    handlingMode: ChangeHandlingMode | null;
    timeoutMinutes?: number | null;
    timeoutExpiry?: TimeoutExpiry | null;
}

/** Upsert (or clear) one override via the gated RPC. Throws on any refusal. */
export async function setOrgChangePolicy(args: SetOrgChangePolicyArgs): Promise<ResolvedChangeHandling | null> {
    const { data, error } = await supabase.schema("platform").rpc("set_org_change_policy", {
        p_org_id: args.orgId,
        p_change_type_key: args.changeTypeKey,
        p_handling_mode: args.handlingMode ?? undefined,
        p_timeout_minutes: args.timeoutMinutes ?? undefined,
        p_timeout_expiry: args.timeoutExpiry ?? undefined,
    });
    if (error) throw new Error(`Change policy write failed: ${error.message}`);
    const parsed = isRecord(data) ? data : {};
    if (parsed.success !== true) {
        throw new Error(typeof parsed.error === "string" ? parsed.error : "Change policy write was refused.");
    }
    return isRecord(parsed.resolved) ? (parsed.resolved as unknown as ResolvedChangeHandling) : null;
}

/** The enforcement point itself — same function every apply path consults. */
export async function resolveChangeHandling(changeTypeKey: string, orgId: string): Promise<ResolvedChangeHandling> {
    const { data, error } = await supabase.schema("platform").rpc("resolve_change_handling", {
        p_change_type_key: changeTypeKey,
        p_organization_id: orgId,
    });
    if (error) throw new Error(`resolve_change_handling failed: ${error.message}`);
    if (!isRecord(data)) throw new Error("resolve_change_handling returned a non-object payload");
    return data as unknown as ResolvedChangeHandling;
}

export interface OrgDivergenceRow {
    organization_id: string;
    organization_name: string | null;
    organization_slug: string | null;
    override_count: number;
    last_updated: string | null;
}

/** Admin twin: per-org override counts (platform admins only — RPC-gated). */
export async function getChangePolicyDivergence(): Promise<OrgDivergenceRow[]> {
    const { data, error } = await supabase.schema("platform").rpc("get_change_policy_divergence");
    if (error) throw new Error(`Divergence read failed: ${error.message}`);
    return Array.isArray(data) ? (data as unknown as OrgDivergenceRow[]) : [];
}
