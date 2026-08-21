"use client";

/**
 * Surface config resolution — the canonical reader/writer for agent roles
 * (`ui_surface_agent_role` + `ui_surface_agent_pref`) and namespaced config
 * (`ui_surface_config`).
 *
 * Resolution precedence (weakest → strongest), per role position / config
 * namespace:
 *
 *   manifest/DB role default → global pref row → org rows (BY MEMBERSHIP —
 *   RLS only returns member orgs; no "active org" filter) → [ctx scope,
 *   reserved] → user row.
 *
 * Per-session choices (feature-owned, e.g. studio_session_settings) are NOT
 * resolved here — pages apply them on top of `effective`.
 *
 * RLS is the visibility authority: any returned row with a non-null user_id
 * IS the caller's own; any org row belongs to a member org. Multiple member
 * orgs defining the same single-role selection: newest `updated_at` wins +
 * one console.warn naming both.
 */

import { createClient } from "@/utils/supabase/client";
import { fetchMandatePins } from "@/features/agents/mandates/service";
import type { SurfaceAgentRole } from "@/features/surfaces/types";
import {
  getNamespaceHandler,
  listRegisteredNamespaces,
} from "@/features/surfaces/config/namespace-registry";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { ensureOrgId } from "@/lib/organizations/personalOrg";

const sb = () => createClient();

export type PrefTier = "global" | "org" | "user" | "scope";

export interface SurfaceAgentPrefRow {
  id: string;
  surfaceName: string;
  roleName: string;
  agentId: string;
  kind: "selection" | "roster_item";
  position: number;
  settings: Record<string, unknown>;
  userId: string | null;
  organizationId: string | null;
  scopeId: string | null;
  updatedAt: string;
}

export interface ResolvedRoleEntry {
  agentId: string;
  settings: Record<string, unknown>;
  /** "mandate" = the role's `mandateKey` supplied the default (agent.mandate). */
  sourceTier: "manifest" | "mandate" | PrefTier;
  /** Pref row id — null when the manifest/DB default supplied the entry. */
  prefId: string | null;
}

export interface TierSelectionPref {
  agentId: string;
  prefId: string;
  organizationId?: string | null;
}

export interface ResolvedRole {
  role: SurfaceAgentRole;
  /** kind=single: 0..1 entries. kind=multi: ordered by position. */
  effective: ResolvedRoleEntry[];
  /** User-tier selection at position 0 — present even when a higher tier wins. */
  userSelection: TierSelectionPref | null;
  /** Org-tier selections at position 0 — one row per member org that defined one. */
  orgSelections: TierSelectionPref[];
  /** Picker additions (kind='roster_item') across all visible tiers. */
  roster: Array<{
    prefId: string;
    agentId: string;
    settings: Record<string, unknown>;
    sourceTier: PrefTier;
    organizationId?: string | null;
  }>;
}

export interface ResolvedSurfaceConfig {
  surfaceName: string;
  roles: Record<string, ResolvedRole>;
  /** Merged config per namespace (handler-merged, validated rows only). */
  namespaces: Record<string, unknown>;
  /** Raw config rows by namespace+tier, for editors that write one tier. */
  configRows: SurfaceConfigRow[];
  warnings: string[];
}

export interface SurfaceConfigRow {
  id: string;
  surfaceName: string;
  namespace: string;
  config: unknown;
  userId: string | null;
  organizationId: string | null;
  scopeId: string | null;
  updatedAt: string;
}

/**
 * Which scope tier a row belongs to.
 *
 * NO NULL ORG (db-rules §2/§6e): `organization_id` is the row's OWNING org on
 * every tier, never a tier flag — a user-tier row carries the user's personal
 * org, a scope-tier row carries the scope's org. So the tier is read off the
 * tier columns first, and "global" is the org tier for the system org.
 *
 * ORDER IS LOAD-BEARING. `organizationId` is now non-null on every row, so
 * testing it before `scopeId` would classify every scope-tier row as "org" and
 * silently move it down the precedence ladder.
 */
export function tierOf(row: {
  userId: string | null;
  organizationId: string | null;
  scopeId: string | null;
}): PrefTier {
  if (row.userId) return "user";
  if (row.scopeId) return "scope";
  return row.organizationId === SYSTEM_ORGANIZATION_ID ? "global" : "org";
}

/** Layer order for merge: global < org < scope(reserved) < user. */
const TIER_ORDER: Record<PrefTier, number> = {
  global: 0,
  org: 1,
  scope: 2,
  user: 3,
};

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export interface SurfaceConfigBundle {
  surfaceName: string;
  dbRoles: Array<{
    name: string;
    label: string;
    description: string;
    kind: "single" | "multi";
    defaultAgentId: string | null;
    mandateKey: string | null;
    /**
     * Agent currently holding `mandateKey` (agent.mandate.default_agent_id),
     * resolved at fetch time. Null when the role has no mandateKey or the
     * mandate is not seeded yet (fetchMandatePins already screamed).
     */
    mandateAgentId: string | null;
    maxAgents: number;
    allowCustom: boolean;
    autoRun: "always" | "never" | "user-choice";
    sortOrder: number;
  }>;
  prefs: SurfaceAgentPrefRow[];
  configRows: SurfaceConfigRow[];
}

export async function fetchSurfaceConfigBundle(
  surfaceName: string,
): Promise<SurfaceConfigBundle> {
  const client = sb();
  const [rolesRes, prefsRes, configRes] = await Promise.all([
    // VIEW LAW: container-scoped by surfaceName (admin-config lookup, platform-wide)
    client
      .schema("ui").from("ui_surface_agent_role")
      .select(
        "name, label, description, kind, default_agent_id, mandate_key, max_agents, allow_custom, auto_run, sort_order",
      )
      .eq("surface_name", surfaceName)
      .order("sort_order"),
    client
      .schema("ui").from("ui_surface_agent_pref")
      .select(
        "id, surface_name, role_name, agent_id, kind, position, settings, user_id, organization_id, scope_id, updated_at",
      )
      .is("deleted_at", null)
      .eq("surface_name", surfaceName),
    client
      .schema("ui").from("ui_surface_config")
      .select(
        "id, surface_name, namespace, config, user_id, organization_id, scope_id, updated_at",
      )
      .is("deleted_at", null)
      .eq("surface_name", surfaceName),
  ]);
  if (rolesRes.error) throw rolesRes.error;
  if (prefsRes.error) throw prefsRes.error;
  if (configRes.error) throw configRes.error;

  // Mandate-backed roles: resolve each declared mandateKey to its current
  // holder (agent.mandate, public-visible). A missing/unseeded mandate leaves
  // the role unfilled — fetchMandatePins console.errors it; never a silent
  // hardcoded fallback.
  const mandateKeys = (rolesRes.data ?? [])
    .map((r) => r.mandate_key)
    .filter((k): k is string => !!k);
  const mandatePins =
    mandateKeys.length > 0 ? await fetchMandatePins(mandateKeys) : {};

  return {
    surfaceName,
    dbRoles: (rolesRes.data ?? []).map((r) => ({
      name: r.name,
      label: r.label,
      description: r.description,
      kind: r.kind as "single" | "multi",
      defaultAgentId: r.default_agent_id,
      mandateKey: r.mandate_key,
      mandateAgentId: r.mandate_key
        ? (mandatePins[r.mandate_key]?.agentId ?? null)
        : null,
      maxAgents: r.max_agents,
      allowCustom: r.allow_custom,
      autoRun: r.auto_run as "always" | "never" | "user-choice",
      sortOrder: r.sort_order,
    })),
    prefs: (prefsRes.data ?? []).map((p) => ({
      id: p.id,
      surfaceName: p.surface_name,
      roleName: p.role_name,
      agentId: p.agent_id,
      kind: p.kind as "selection" | "roster_item",
      position: p.position,
      settings: (p.settings ?? {}) as Record<string, unknown>,
      userId: p.user_id,
      organizationId: p.organization_id,
      scopeId: p.scope_id,
      updatedAt: p.updated_at,
    })),
    configRows: (configRes.data ?? []).map((c) => ({
      id: c.id,
      surfaceName: c.surface_name,
      namespace: c.namespace,
      config: c.config,
      userId: c.user_id,
      organizationId: c.organization_id,
      scopeId: c.scope_id,
      updatedAt: c.updated_at,
    })),
  };
}

// ---------------------------------------------------------------------------
// Resolve (pure)
// ---------------------------------------------------------------------------

export function resolveSurfaceConfig(
  bundle: SurfaceConfigBundle,
): ResolvedSurfaceConfig {
  const warnings: string[] = [];
  const roles: Record<string, ResolvedRole> = {};

  for (const dbRole of bundle.dbRoles) {
    const role: SurfaceAgentRole = {
      name: dbRole.name,
      label: dbRole.label,
      description: dbRole.description,
      kind: dbRole.kind,
      defaultAgentId: dbRole.defaultAgentId,
      mandateKey: dbRole.mandateKey,
      maxAgents: dbRole.maxAgents,
      allowCustom: dbRole.allowCustom,
      autoRun: dbRole.autoRun,
      sortOrder: dbRole.sortOrder,
    };

    const rolePrefs = bundle.prefs.filter((p) => p.roleName === dbRole.name);
    const selections = rolePrefs.filter((p) => p.kind === "selection");
    const maxPositions = dbRole.kind === "multi" ? dbRole.maxAgents : 1;

    const effective: ResolvedRoleEntry[] = [];
    for (let pos = 0; pos < maxPositions; pos++) {
      const candidates = selections
        .filter((p) => p.position === pos)
        .sort(
          (a, b) =>
            TIER_ORDER[tierOf(a)] - TIER_ORDER[tierOf(b)] ||
            a.updatedAt.localeCompare(b.updatedAt),
        );
      const winner = candidates[candidates.length - 1];
      if (winner) {
        const sameTierOrgs = candidates.filter(
          (c) => tierOf(c) === "org" && tierOf(winner) === "org",
        );
        if (sameTierOrgs.length > 1) {
          warnings.push(
            `Role "${dbRole.name}" position ${pos}: ${sameTierOrgs.length} member orgs define a selection — newest wins (orgs: ${sameTierOrgs.map((c) => c.organizationId?.slice(0, 8)).join(", ")})`,
          );
        }
        effective.push({
          agentId: winner.agentId,
          settings: winner.settings,
          sourceTier: tierOf(winner),
          prefId: winner.id,
        });
      } else if (pos === 0 && dbRole.defaultAgentId) {
        effective.push({
          agentId: dbRole.defaultAgentId,
          settings: {},
          sourceTier: "manifest",
          prefId: null,
        });
      } else if (pos === 0 && dbRole.mandateAgentId) {
        // Mandate-backed platform default: the DB (agent.mandate) decided the
        // Holder — code only named the Mandate.
        effective.push({
          agentId: dbRole.mandateAgentId,
          settings: {},
          sourceTier: "mandate",
          prefId: null,
        });
      }
    }

    const userSelectionRow = selections.find(
      (p) => p.position === 0 && tierOf(p) === "user",
    );
    const orgSelectionRows = selections.filter(
      (p) => p.position === 0 && tierOf(p) === "org",
    );

    roles[dbRole.name] = {
      role,
      effective,
      userSelection: userSelectionRow
        ? {
            agentId: userSelectionRow.agentId,
            prefId: userSelectionRow.id,
          }
        : null,
      orgSelections: orgSelectionRows.map((p) => ({
        agentId: p.agentId,
        prefId: p.id,
        organizationId: p.organizationId,
      })),
      roster: rolePrefs
        .filter((p) => p.kind === "roster_item")
        .map((p) => ({
          prefId: p.id,
          agentId: p.agentId,
          settings: p.settings,
          sourceTier: tierOf(p),
          organizationId: p.organizationId,
        })),
    };
  }

  // Namespaced config — handler-validated rows, tier-ordered, handler-merged.
  const namespaces: Record<string, unknown> = {};
  const byNamespace = new Map<string, SurfaceConfigRow[]>();
  for (const row of bundle.configRows) {
    if (!byNamespace.has(row.namespace)) byNamespace.set(row.namespace, []);
    byNamespace.get(row.namespace)!.push(row);
  }
  for (const [namespace, rows] of byNamespace) {
    const handler = getNamespaceHandler(namespace);
    if (!handler) {
      warnings.push(
        `Config namespace "${namespace}" has ${rows.length} row(s) but no registered handler (known: ${listRegisteredNamespaces().join(", ")})`,
      );
      continue;
    }
    const layers = rows
      .sort(
        (a, b) =>
          TIER_ORDER[tierOf(a)] - TIER_ORDER[tierOf(b)] ||
          a.updatedAt.localeCompare(b.updatedAt),
      )
      .filter((r) => {
        const ok = handler.validate(r.config);
        if (!ok) {
          warnings.push(
            `Config row ${r.id} (${namespace}, ${tierOf(r)}) failed validation — skipped`,
          );
        }
        return ok;
      })
      .map((r) => r.config);
    namespaces[namespace] =
      layers.length > 0 ? handler.merge(layers as never[]) : handler.empty;
  }

  for (const w of warnings) {
    console.warn(`[surfaces] ${bundle.surfaceName}: ${w}`);
  }

  return {
    surfaceName: bundle.surfaceName,
    roles,
    namespaces,
    configRows: bundle.configRows,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Writes (RLS enforces who may write which tier)
// ---------------------------------------------------------------------------

export interface PrefScopeInput {
  /** Exactly one set, or none = global (super admins only). */
  userId?: string | null;
  organizationId?: string | null;
  scopeId?: string | null;
}

/**
 * Columns to WRITE for a scope tier.
 *
 * NO NULL ORG (db-rules §2/§6e): there is no all-NULL "global" row any more.
 * Global is the system org, so an empty scope writes `matrx-system` explicitly.
 *
 * Every insert sends the required owning organization explicitly. User and
 * ctx-scope callers may provide the known owner; otherwise the canonical
 * active/personal-org resolver supplies it. The DB backstops remain the final
 * integrity layer for older clients and direct writes.
 */
async function scopeInsertColumns(scope: PrefScopeInput) {
  const organizationId =
    !scope.userId && !scope.scopeId && !scope.organizationId
      ? SYSTEM_ORGANIZATION_ID
      : await ensureOrgId(scope.organizationId);
  if (scope.userId) {
    return { user_id: scope.userId, scope_id: null, organization_id: organizationId };
  }
  if (scope.scopeId) {
    return { user_id: null, scope_id: scope.scopeId, organization_id: organizationId };
  }
  return {
    user_id: null,
    scope_id: null,
    organization_id: organizationId,
  };
}

/**
 * Narrow a query to the ONE row that owns a scope tier.
 *
 * The org tier is now `user_id IS NULL AND scope_id IS NULL AND
 * organization_id = <org>` — matching the partial unique indexes the migration
 * rebuilt. The user and scope tiers do NOT constrain `organization_id`: it is
 * the row's owning org, not part of its identity, and their own unique indexes
 * are keyed on the tier column alone.
 */
function matchScope<T extends { eq: (c: string, v: string) => T; is: (c: string, v: null) => T }>(
  q: T,
  scope: PrefScopeInput,
): T {
  if (scope.userId) return q.eq("user_id", scope.userId).is("scope_id", null);
  if (scope.scopeId) return q.is("user_id", null).eq("scope_id", scope.scopeId);
  return q
    .is("user_id", null)
    .is("scope_id", null)
    .eq("organization_id", scope.organizationId ?? SYSTEM_ORGANIZATION_ID);
}

/** Set the agent filling (surface, role, position) at a scope tier. */
export async function setRoleSelection(args: {
  surfaceName: string;
  roleName: string;
  agentId: string;
  position?: number;
  settings?: Record<string, unknown>;
  scope: PrefScopeInput;
}): Promise<void> {
  const {
    surfaceName,
    roleName,
    agentId,
    position = 0,
    settings,
    scope,
  } = args;
  const client = sb();
  let q = client
    .schema("ui").from("ui_surface_agent_pref")
    .select("id")
    .eq("surface_name", surfaceName)
    .eq("role_name", roleName)
    .eq("kind", "selection")
    .eq("position", position);
  q = matchScope(q, scope);
  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await client
      .schema("ui").from("ui_surface_agent_pref")
      .update({ agent_id: agentId, ...(settings ? { settings } : {}) })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await client.schema("ui").from("ui_surface_agent_pref").insert({
    surface_name: surfaceName,
    role_name: roleName,
    agent_id: agentId,
    kind: "selection",
    position,
    settings: settings ?? {},
    ...(await scopeInsertColumns(scope)),
  });
  if (error) throw error;
}

export async function deleteRolePref(prefId: string): Promise<void> {
  const { error } = await sb()
    .schema("ui").from("ui_surface_agent_pref")
    .delete()
    .eq("id", prefId);
  if (error) throw error;
}

export async function addRosterItem(args: {
  surfaceName: string;
  roleName: string;
  agentId: string;
  settings?: Record<string, unknown>;
  scope: PrefScopeInput;
}): Promise<void> {
  const { error } = await sb()
    .schema("ui").from("ui_surface_agent_pref")
    .insert({
      surface_name: args.surfaceName,
      role_name: args.roleName,
      agent_id: args.agentId,
      kind: "roster_item",
      position: 0,
      settings: args.settings ?? {},
      ...(await scopeInsertColumns(args.scope)),
    });
  if (error) throw error;
}

/** Upsert one namespace's config row at a scope tier. */
export async function setNamespaceConfig(args: {
  surfaceName: string;
  namespace: string;
  config: unknown;
  scope: PrefScopeInput;
}): Promise<void> {
  const { surfaceName, namespace, config, scope } = args;
  const handler = getNamespaceHandler(namespace);
  if (!handler) {
    // An unregistered namespace has no validator or merge semantics — a row
    // written here would be skipped by resolution with a warning. Refuse
    // loudly instead of persisting config nothing can consume.
    throw new Error(
      `[surfaces] no registered handler for config namespace "${namespace}" (known: ${listRegisteredNamespaces().join(", ")}) — register one in config/namespace-registry.ts before persisting`,
    );
  }
  if (!handler.validate(config)) {
    throw new Error(
      `[surfaces] config for namespace "${namespace}" failed validation — refusing to persist`,
    );
  }
  const client = sb();
  let q = client
    .schema("ui").from("ui_surface_config")
    .select("id")
    .eq("surface_name", surfaceName)
    .eq("namespace", namespace);
  q = matchScope(q, scope);
  const { data: existing, error: findErr } = await q.maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await client
      .schema("ui").from("ui_surface_config")
      .update({ config })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }
  const { error } = await client.schema("ui").from("ui_surface_config").insert({
    surface_name: surfaceName,
    namespace,
    config,
    ...(await scopeInsertColumns(scope)),
  });
  if (error) throw error;
}
