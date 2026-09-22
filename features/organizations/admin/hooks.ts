"use client";

/**
 * Org-admin data hooks. Resolution + role-gate + roster/detail fetching.
 * Mutations are called directly from components via ./service (each re-fetches on success).
 */
import { useCallback, useEffect, useState } from "react";
import { useResolvedOrganization } from "../hooks";
import type { Organization, OrgRole } from "../types";
import { getOrgMember, getOrgOverview, listOrgMembers } from "./service";
import type {
  OrgAdminMember,
  OrgAdminMemberDetail,
  OrgAdminOverview,
} from "./types";

export interface OrgAdminGate {
  /** Resolved org UUID (slug params are resolved). */
  orgId: string | null;
  organization: Organization | null;
  role: OrgRole | null;
  isAdmin: boolean;
  loading: boolean;
  /** A genuine fault from the resolve — NOT "we got no row back". */
  error: unknown;
  refresh: () => void;
}

/**
 * Resolves the [orgId] route param (UUID or slug) and the caller's org role.
 * `isAdmin` is true for owner/admin — the gate every org-admin surface checks.
 * (The DB RPCs enforce the same gate; this is the UX layer.)
 * Thin wrapper over the canonical `useResolvedOrganization`.
 */
export function useOrgAdminGate(orgIdParam: string | undefined): OrgAdminGate {
  const { organization, organizationId, role, loading, error, refresh } =
    useResolvedOrganization(orgIdParam);

  return {
    orgId: organizationId,
    organization,
    role,
    isAdmin: role === "owner" || role === "admin",
    loading,
    error,
    refresh,
  };
}

export interface OrgRosterState {
  members: OrgAdminMember[];
  overview: OrgAdminOverview | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Roster + aggregate overview for the org-admin dashboard. */
export function useOrgRoster(orgId: string | null): OrgRosterState {
  const [members, setMembers] = useState<OrgAdminMember[]>([]);
  const [overview, setOverview] = useState<OrgAdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([listOrgMembers(orgId), getOrgOverview(orgId)])
      .then(([m, o]) => {
        if (cancelled) return;
        setMembers(m);
        setOverview(o);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load members",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, tick]);

  return { members, overview, loading, error, refresh };
}

export interface OrgMemberDetailState {
  member: OrgAdminMemberDetail | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Single member's detail (roster row + resource breakdown). */
export function useOrgMemberDetail(
  orgId: string | null,
  userId: string | undefined,
): OrgMemberDetailState {
  const [tick, setTick] = useState(0);
  const identityKey = orgId && userId ? `${orgId}:${userId}` : null;
  const requestKey = identityKey ? `${identityKey}:${tick}` : null;
  const [resolved, setResolved] = useState<{
    identityKey: string;
    requestKey: string;
    member: OrgAdminMemberDetail | null;
    error: string | null;
  } | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!orgId || !userId || !identityKey || !requestKey) return;
    let cancelled = false;
    getOrgMember(orgId, userId)
      .then((m) => {
        if (!cancelled) {
          setResolved({
            identityKey,
            requestKey,
            member: m,
            error: null,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setResolved((current) => ({
            identityKey,
            requestKey,
            member:
              current?.identityKey === identityKey ? current.member : null,
            error: err instanceof Error ? err.message : "Failed to load member",
          }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [identityKey, orgId, requestKey, userId]);

  const current = resolved?.identityKey === identityKey ? resolved : null;

  return {
    member: current?.member ?? null,
    loading: requestKey !== null && current?.requestKey !== requestKey,
    error: current?.error ?? null,
    refresh,
  };
}
