'use client';

import { useState, useCallback } from 'react';
import { CmsVersionService } from '../services/cmsService';
import type { CmsEntityType, ClientEntityVersion, ClientEntityVersionDetail } from '../types';

export function useCmsVersions() {
    const [versions, setVersions] = useState<ClientEntityVersion[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<ClientEntityVersionDetail | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchVersions = useCallback(async (rowId: string, entityType: CmsEntityType = 'client_page') => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await CmsVersionService.listVersions(rowId, entityType);
            setVersions(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load version history');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const viewVersion = useCallback(async (versionId: string, entityType: CmsEntityType = 'client_page') => {
        setIsLoading(true);
        setError(null);
        try {
            const version = await CmsVersionService.getVersion(versionId, entityType);
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
