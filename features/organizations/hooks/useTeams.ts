"use client";

import { useEffect, useState } from "react";
import {
  listHrDepartmentOptions,
  listTeamMembers,
  listTeams,
  type HrDepartmentOption,
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
  const [data, setData] = useState<Team[]>([]);
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
      .then((rows) => live && setData(rows))
      .catch((e: unknown) => live && setError(messageOf(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [organizationId, includeArchived, tick]);

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
