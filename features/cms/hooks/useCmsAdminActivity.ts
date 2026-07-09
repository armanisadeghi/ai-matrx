'use client';

import { useState, useEffect, useCallback } from 'react';
import { CmsSiteService } from '../services/cmsService';
import type { ClientActivityLog } from '../types';

const POLL_INTERVAL_MS = 8000;

export interface CmsActivityFilters {
    siteId?: string;
    entityType?: string;
    actor?: 'agent' | 'human' | 'system';
}

/**
 * Polls `client_activity_log` (admin, fleet-wide). No Realtime — the CMS project
 * has a separate Auth domain and no anon-key/RLS story for the browser to
 * subscribe against (master plan P5 brief, "Data path decision"). Polling is
 * the documented, deliberate choice, not a placeholder.
 */
export function useCmsAdminActivity({ siteId, entityType, actor }: CmsActivityFilters) {
    const [activity, setActivity] = useState<ClientActivityLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchActivity = useCallback(async () => {
        try {
            const data = await CmsSiteService.adminListActivity({ siteId, entityType, actor });
            setActivity(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load activity');
        } finally {
            setIsLoading(false);
        }
    }, [siteId, entityType, actor]);

    useEffect(() => {
        setIsLoading(true);
        fetchActivity();
        const interval = setInterval(fetchActivity, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [fetchActivity]);

    return { activity, isLoading, error, refresh: fetchActivity };
}
