'use client';

import { useState, useCallback } from 'react';
import { CmsVersionService } from '../services/cmsService';
import type { ClientPageVersion } from '../types';

export function useCmsVersions() {
    const [versions, setVersions] = useState<ClientPageVersion[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<ClientPageVersion | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchVersions = useCallback(async (pageId: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await CmsVersionService.listVersions(pageId);
            setVersions(data);
        } catch (err: any) {
            setError(err.message);
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
        } catch (err: any) {
            setError(err.message);
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
