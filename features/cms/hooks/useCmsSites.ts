'use client';

import { useState, useEffect, useCallback } from 'react';
import { CmsSiteService } from '../services/cmsService';
import type { ClientSite } from '../types';

export function useCmsSites() {
    const [sites, setSites] = useState<ClientSite[]>([]);
    const [activeSite, setActiveSite] = useState<ClientSite | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSites = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await CmsSiteService.listSites();
            setSites(data);
            // Auto-select the first active site if none is selected
            if (!activeSite && data.length > 0) {
                const active = data.find((s) => s.is_active) || data[0];
                setActiveSite(active);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [activeSite]);

    useEffect(() => {
        fetchSites();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const selectSite = useCallback(
        async (siteId: string) => {
            const cached = sites.find((s) => s.id === siteId);
            if (cached) {
                setActiveSite(cached);
                return cached;
            }
            try {
                const site = await CmsSiteService.getSite(siteId);
                setActiveSite(site);
                return site;
            } catch (err: any) {
                setError(err.message);
                return null;
            }
        },
        [sites],
    );

    const createSite = useCallback(
        async (params: { name: string; slug: string; domain?: string; globalCss?: string }) => {
            setError(null);
            try {
                const site = await CmsSiteService.createSite(params);
                setSites((prev) => [...prev, site]);
                setActiveSite(site);
                return site;
            } catch (err: any) {
                setError(err.message);
                throw err;
            }
        },
        [],
    );

    const updateSite = useCallback(
        async (siteId: string, updates: Parameters<typeof CmsSiteService.updateSite>[1]) => {
            setError(null);
            try {
                const site = await CmsSiteService.updateSite(siteId, updates);
                setSites((prev) => prev.map((s) => (s.id === siteId ? site : s)));
                if (activeSite?.id === siteId) setActiveSite(site);
                return site;
            } catch (err: any) {
                setError(err.message);
                throw err;
            }
        },
        [activeSite],
    );

    return {
        sites,
        activeSite,
        isLoading,
        error,
        fetchSites,
        selectSite,
        createSite,
        updateSite,
        clearError: () => setError(null),
    };
}
