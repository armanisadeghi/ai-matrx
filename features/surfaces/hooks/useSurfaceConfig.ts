"use client";

/**
 * useSurfaceConfig / useSurfaceAgentRoles — the live-page consumption layer
 * for the centralized surface config system.
 *
 * `useSurfaceConfig(surfaceName)` returns the resolved bundle (roles +
 * merged namespaces) from the Redux cache, fetching once per surface per
 * session (single-flight). Writers go through the service helpers and then
 * `refresh()` to re-resolve.
 *
 * `useSurfaceAgentRoles(surfaceName)` is the role-centric view pages use to
 * seed agent pickers: per role, the effective agent (with provenance tier)
 * plus setForMe / clearForMe helpers.
 */

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  ensureSurfaceConfig,
  invalidateSurfaceConfig,
  selectSurfaceConfigEntry,
  type SurfaceConfigStatus,
} from "@/features/surfaces/redux/surfaceConfigSlice";
import {
  setRoleSelection,
  deleteRolePref,
  addRosterItem,
  type ResolvedRole,
  type ResolvedSurfaceConfig,
  type TierSelectionPref,
} from "@/features/surfaces/services/surface-config.service";
import { getNamespaceHandler } from "@/features/surfaces/config/namespace-registry";

export interface UseSurfaceConfigResult {
  status: SurfaceConfigStatus;
  error: string | null;
  resolved: ResolvedSurfaceConfig | null;
  roles: Record<string, ResolvedRole>;
  /** Merged effective config for a namespace (handler `empty` when absent). */
  getNamespace<T>(namespace: string): T;
  refresh(): void;
}

export function useSurfaceConfig(surfaceName: string): UseSurfaceConfigResult {
  const dispatch = useAppDispatch();
  const entry = useAppSelector((s) => selectSurfaceConfigEntry(s, surfaceName));

  useEffect(() => {
    void dispatch(ensureSurfaceConfig({ surfaceName }));
  }, [dispatch, surfaceName]);

  const refresh = useCallback(() => {
    dispatch(invalidateSurfaceConfig(surfaceName));
    void dispatch(ensureSurfaceConfig({ surfaceName, force: true }));
  }, [dispatch, surfaceName]);

  const getNamespace = useCallback(
    <T>(namespace: string): T => {
      const merged = entry?.resolved?.namespaces[namespace];
      if (merged !== undefined) return merged as T;
      const handler = getNamespaceHandler(namespace);
      return (handler?.empty ?? {}) as T;
    },
    [entry?.resolved],
  );

  return {
    status: entry?.status ?? "idle",
    error: entry?.error ?? null,
    resolved: entry?.resolved ?? null,
    roles: entry?.resolved?.roles ?? {},
    getNamespace,
    refresh,
  };
}

export interface RoleView {
  role: ResolvedRole["role"];
  /** The agent currently filling position 0 (single roles), or null. */
  effectiveAgentId: string | null;
  /** Where the effective agent came from. */
  sourceTier: "manifest" | "global" | "org" | "user" | "scope" | null;
  effective: ResolvedRole["effective"];
  /** User-tier default pref — survives even when org/platform wins effective. */
  userSelection: TierSelectionPref | null;
  orgSelections: TierSelectionPref[];
  roster: ResolvedRole["roster"];
  /** Set the caller's user-scope selection for this role (position 0). */
  setForMe(agentId: string): Promise<void>;
  /** Remove the caller's user-scope selection (falls back down the chain). */
  clearForMe(): Promise<void>;
  /** Add this agent to the user-tier roster for this role. */
  addToMyRoster(agentId: string): Promise<void>;
  /** Remove a user-tier roster row for this agent. */
  removeFromMyRoster(prefId: string): Promise<void>;
}

export interface UseSurfaceAgentRolesResult {
  status: SurfaceConfigStatus;
  roles: Record<string, RoleView>;
  refresh(): void;
}

export function useSurfaceAgentRoles(
  surfaceName: string,
): UseSurfaceAgentRolesResult {
  const { status, roles, refresh } = useSurfaceConfig(surfaceName);
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);

  const buildView = useCallback(
    (resolved: ResolvedRole): RoleView => {
      const first = resolved.effective[0] ?? null;
      return {
        role: resolved.role,
        effectiveAgentId: first?.agentId ?? null,
        sourceTier: first?.sourceTier ?? null,
        effective: resolved.effective,
        userSelection: resolved.userSelection,
        orgSelections: resolved.orgSelections,
        roster: resolved.roster,
        setForMe: async (agentId: string) => {
          if (!userId) throw new Error("Not signed in");
          await setRoleSelection({
            surfaceName,
            roleName: resolved.role.name,
            agentId,
            scope: { userId },
          });
          refresh();
        },
        clearForMe: async () => {
          if (resolved.userSelection?.prefId) {
            await deleteRolePref(resolved.userSelection.prefId);
            refresh();
          }
        },
        addToMyRoster: async (agentId: string) => {
          if (!userId) throw new Error("Not signed in");
          await addRosterItem({
            surfaceName,
            roleName: resolved.role.name,
            agentId,
            scope: { userId },
          });
          refresh();
        },
        removeFromMyRoster: async (prefId: string) => {
          await deleteRolePref(prefId);
          refresh();
        },
      };
    },
    [refresh, surfaceName, userId],
  );

  const views: Record<string, RoleView> = {};
  for (const [name, resolved] of Object.entries(roles)) {
    views[name] = buildView(resolved);
  }

  return { status, roles: views, refresh };
}
