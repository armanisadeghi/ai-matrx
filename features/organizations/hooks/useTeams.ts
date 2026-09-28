"use client";

import { useEffect, useState } from "react";
import {
  listHrDepartmentOptions,
  listTeamMembers,
  listMyTeams,
  listTeams,
  type HrDepartmentOption,
  type MyTeam,
  type Team,
  type TeamMember,
} from "@/features/organizations/service/teamsService";

interface Loaded<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Every team of one organization. Every member sees all of them (Organization level). */
export function useOrganizationTeams(
  organizationId: string | undefined,
  includeArchived: boolean,
): Loaded<Team[]> {
  // Rows remember which organization they belong to, so switching organizations never
  // shows the previous one's teams while the next list loads.
  const [loaded, setLoaded] = useState<{ org: string; rows: Team[] }>({ org: "", rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    listTeams(organizationId, includeArchived)
      .then((rows) => live && setLoaded({ org: organizationId, rows }))
      .catch((e: unknown) => live && setError(messageOf(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [organizationId, includeArchived, tick]);

  const data = loaded.org === organizationId ? loaded.rows : [];
  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

/** Who is on one team: added by hand, from its HR department, or both. */
export function useTeamMembers(teamId: string | null): Loaded<TeamMember[]> {
  const [data, setData] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(Boolean(teamId));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!teamId) {
      setData([]);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    listTeamMembers(teamId)
      .then((rows) => live && setData(rows))
      .catch((e: unknown) => live && setError(messageOf(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [teamId, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

/** HR departments a team can be linked to. Asked only for owners and admins. */
export function useHrDepartmentOptions(
  organizationId: string | undefined,
  enabled: boolean,
): Loaded<HrDepartmentOption[]> {
  const [data, setData] = useState<HrDepartmentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !organizationId) {
      setData([]);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    listHrDepartmentOptions(organizationId)
      .then((rows) => live && setData(rows))
      .catch((e: unknown) => live && setError(messageOf(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [organizationId, enabled, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

/**
 * The signed-in person's own teams in one organization, or in all of them
 * (null). `enabled: false` reads nothing — a list asks only while its
 * "My team" tab is the one on screen.
 */
export function useMyTeams(
  organizationId: string | null,
  enabled = true,
): Loaded<MyTeam[]> & { settled: boolean } {
  const key = organizationId ?? "*";
  const [loaded, setLoaded] = useState<{ key: string; rows: MyTeam[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setLoading(true);
    setError(null);
    listMyTeams(organizationId)
      .then((rows) => live && setLoaded({ key, rows }))
      .catch((e: unknown) => live && setError(messageOf(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [organizationId, key, enabled, tick]);

  const current = loaded?.key === key ? loaded.rows : null;
  return {
    data: current ?? [],
    loading,
    error,
    settled: current !== null,
    refresh: () => setTick((t) => t + 1),
  };
}
