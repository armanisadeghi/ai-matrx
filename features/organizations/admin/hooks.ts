"use client";

/**
 * Org-admin data hooks. Resolution + role-gate + roster/detail fetching.
 * Mutations are called directly from components via ./service (each re-fetches on success).
 */
import { useCallback, useEffect, useState } from "react";
import { getOrganizationBySlugOrId } from "../service";
import { useUserRole } from "../hooks";
import type { Organization, OrgRole } from "../types";
import { getOrgMember, getOrgOverview, listOrgMembers } from "./service";
import type { OrgAdminMember, OrgAdminMemberDetail, OrgAdminOverview } from "./types";

export interface OrgAdminGate {
  /** Resolved org UUID (slug params are resolved). */
  orgId: string | null;
  organization: Organization | null;
  role: OrgRole | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Resolves the [orgId] route param (UUID or slug) and the caller's org role.
 * `isAdmin` is true for owner/admin — the gate every org-admin surface checks.
 * (The DB RPCs enforce the same gate; this is the UX layer.)
 */
export function useOrgAdminGate(orgIdParam: string | undefined): OrgAdminGate {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [resolving, setResolving] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      if (!orgIdParam) {
        setError("Organization not found");
        setResolving(false);
        return;
      }
      setResolving(true);
      try {
        const org = await getOrganizationBySlugOrId(orgIdParam);
        if (cancelled) return;
        if (!org) {
          setError("Organization not found");
        } else {
          setOrgId(org.id);
          setOrganization(org);
          setError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load organization");
      } finally {
        if (!cancelled) setResolving(false);
      }
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [orgIdParam]);

  const { role, loading: roleLoading, isAdmin } = useUserRole(orgId ?? undefined);

  return {
    orgId,
    organization,
    role,
    isAdmin: Boolean(isAdmin),
    loading: resolving || (orgId != null && roleLoading),
    error,
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load members");
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
export function useOrgMemberDetail(orgId: string | null, userId: string | undefined): OrgMemberDetailState {
  const [member, setMember] = useState<OrgAdminMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!orgId || !userId) return;
    let cancelled = false;
    setLoading(true);
    getOrgMember(orgId, userId)
      .then((m) => {
        if (!cancelled) {
          setMember(m);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load member");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, tick]);

  return { member, loading, error, refresh };
}
