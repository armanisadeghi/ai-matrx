"use client";

/**
 * Industry taxonomy hooks. Reads are lazy + cancellable. Writes route through
 * the service (RPCs). Industries are read-mostly reference data — kept as a
 * focused feature hook (not a parallel Redux slice).
 */

import { useCallback, useEffect, useState } from "react";
import {
  assignOrgIndustry,
  fetchIndustries,
  fetchOrgIndustries,
  unassignOrgIndustry,
} from "./service";
import type { Industry, OrgIndustry } from "./types";

export function useIndustries(includeInactive = false) {
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);
  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIndustries(includeInactive)
      .then((r) => {
        if (!cancelled) setIndustries(r);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load industries");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [includeInactive, bumper]);

  return { industries, loading, error, refresh };
}

export function useOrgIndustries(orgId: string | null) {
  const [orgIndustries, setOrgIndustries] = useState<OrgIndustry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bumper, setBumper] = useState(0);
  const refresh = useCallback(() => setBumper((b) => b + 1), []);

  useEffect(() => {
    if (!orgId) {
      setOrgIndustries([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchOrgIndustries(orgId)
      .then((r) => {
        if (!cancelled) setOrgIndustries(r);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Could not load assignments");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, bumper]);

  const assign = useCallback(
    async (industryId: string, isPrimary = false): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await assignOrgIndustry(orgId, industryId, isPrimary);
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not assign industry");
        return false;
      }
    },
    [orgId, refresh],
  );

  const unassign = useCallback(
    async (industryId: string): Promise<boolean> => {
      if (!orgId) return false;
      try {
        await unassignOrgIndustry(orgId, industryId);
        refresh();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not remove industry");
        return false;
      }
    },
    [orgId, refresh],
  );

  return { orgIndustries, loading, error, refresh, assign, unassign };
}
