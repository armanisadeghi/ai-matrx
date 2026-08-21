'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/utils/supabase/client';
import { operationFailed } from '@/utils/errors';
import type {
  HierarchyData,
  HierarchyOrg,
  HierarchyProject,
  UseHierarchyFilterReturn,
} from './types';

export function useHierarchyFilter(): UseHierarchyFilterReturn {
  const [data, setData] = useState<HierarchyData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const fetchHierarchy = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: result, error: rpcError } = await supabase.rpc('get_user_hierarchy');

      if (rpcError) throw operationFailed('load your organizations and projects', rpcError);

      const typed = result as HierarchyData;
      setData({
        organizations: typed.organizations ?? [],
        projects: typed.projects ?? [],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load hierarchy';
      setError(msg);
      console.error('Hierarchy fetch error:', msg);
    } finally {
      setIsLoading(false);
      setHasFetched(true);
    }
  }, []);

  useEffect(() => {
    if (!hasFetched) {
      fetchHierarchy();
    }
  }, [hasFetched, fetchHierarchy]);

  const filteredOrgs: HierarchyOrg[] = data?.organizations ?? [];

  const filteredProjects: HierarchyProject[] = (() => {
    const all = data?.projects ?? [];
    if (!selectedOrgId) return all;
    return all.filter(p => p.organization_id === selectedOrgId);
  })();

  const selectOrg = useCallback((orgId: string | null) => {
    setSelectedOrgId(orgId);
    setSelectedProjectId(null);
  }, []);

  const selectProject = useCallback((projectId: string | null) => {
    setSelectedProjectId(projectId);
  }, []);

  const resetAll = useCallback(() => {
    setSelectedOrgId(null);
    setSelectedProjectId(null);
  }, []);

  return {
    data,
    isLoading,
    error,
    selectedOrgId,
    selectedProjectId,
    filteredOrgs,
    filteredProjects,
    selectOrg,
    selectProject,
    resetAll,
    refresh: fetchHierarchy,
  };
}
