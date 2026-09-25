"use client";

// features/crm/deals/useOrgMembers.ts
//
// Owner resolution for deal surfaces: `crm.deal.assigned_to` is an auth user
// id, and a UUID in a cell is a dead end with extra steps — resolve it to the
// canonical person shape (`UserLike`) via the existing org-members RPC and
// render it through `UserIdentity`. One fetch per org, module-cached for the
// session (membership churn is rare; a reload refetches).

import { useEffect, useMemo, useState } from "react";
import { getOrganizationMembers } from "@/features/organizations/service";
import { membershipsService } from "@/features/organizations/service/membershipsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { UserLike } from "@/components/user/UserIdentity";

const cache = new Map<string, Promise<Map<string, UserLike>>>();

/**
 * THE ORGANIZATIONS WHOSE ROSTER THIS PERSON MAY READ (GATES-TAIL, VERIFIER-21 #7). A table can
 * be given to a person who is not in its organization (access is personal), and every open of it
 * asked `get_organization_members_with_users` for that organization's people and was refused
 * with 403 (`iam.has_org_access`: direct membership). The roster is not hers to read, so it is
 * not asked for: a person field shows no people rather than a refused request. Her own
 * memberships, once per session, like the rosters below.
 */
let myOrganizationIds: Promise<Set<string> | null> | null = null;
function organizationsIAmIn(): Promise<Set<string> | null> {
  if (!myOrganizationIds) {
    myOrganizationIds = membershipsService
      .forUser("organization")
      .then((r) => (isScopesRpcErr(r) ? null : new Set(r.data.memberships.map((m) => m.containerId))))
      .catch(() => null);
  }
  return myOrganizationIds;
}

async function loadOrg(orgId: string): Promise<Map<string, UserLike>> {
  // When her memberships could not be read, ask as before and let the door answer.
  const mine = await organizationsIAmIn();
  if (mine && !mine.has(orgId)) return new Map();
  const members = await getOrganizationMembers(orgId);
  const map = new Map<string, UserLike>();
  for (const m of members) {
    if (m.user) map.set(m.userId, m.user);
  }
  return map;
}

export interface UseOrgMembersResult {
  /** auth user id → the person, across every requested org. */
  memberById: Map<string, UserLike>;
  isLoading: boolean;
}

export function useOrgMembers(orgIds: string[]): UseOrgMembersResult {
  const [memberById, setMemberById] = useState<Map<string, UserLike>>(
    () => new Map(),
  );
  const [isLoading, setIsLoading] = useState(orgIds.length > 0);
  const key = orgIds.slice().sort().join(",");

  useEffect(() => {
    if (!key) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const maps = await Promise.all(
          key.split(",").map((orgId) => {
            let p = cache.get(orgId);
            if (!p) {
              p = loadOrg(orgId);
              cache.set(orgId, p);
            }
            return p;
          }),
        );
        if (cancelled) return;
        const merged = new Map<string, UserLike>();
        for (const m of maps) for (const [id, u] of m) merged.set(id, u);
        setMemberById(merged);
      } catch (e) {
        // A failed member load degrades to initials-from-nothing, not a break.
        console.error("[crm] org member load failed:", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => ({ memberById, isLoading }), [memberById, isLoading]);
}
