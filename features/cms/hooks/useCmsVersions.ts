'use client';

import { useState, useCallback } from 'react';
import { CmsVersionService } from '../services/cmsService';
import type { ClientPageVersion, ClientPageVersionDetail } from '../types';

export function useCmsVersions() {
    const [versions, setVersions] = useState<ClientPageVersion[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<ClientPageVersionDetail | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchVersions = useCallback(async (pageId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await CmsVersionService.listVersions(pageId);
            setVersions(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load version history');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const viewVersion = useCallback(async (versionId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const version = await CmsVersionService.getVersion(versionId);
            setSelectedVersion(version);
            return version;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load version');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedVersion(null);
    }, []);

    return {
        versions,
        selectedVersion,
        isLoading,
        error,
        fetchVersions,
        viewVersion,
        clearSelection,
        clearError: () => setError(null),
    };
}
