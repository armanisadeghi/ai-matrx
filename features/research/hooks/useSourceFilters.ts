'use client';

import { useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { SourceFilters, SourceSortBy, SortDir } from '../types';
import { DEFAULT_SOURCE_FILTERS } from '../types';

export function useSourceFilters() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const filters: SourceFilters = {
        keyword_id: searchParams.get('keyword_id') || undefined,
        scrape_status: (searchParams.get('scrape_status') as SourceFilters['scrape_status']) || undefined,
        source_type: (searchParams.get('source_type') as SourceFilters['source_type']) || undefined,
        hostname: searchParams.get('hostname') || undefined,
        is_included: searchParams.has('is_included') ? searchParams.get('is_included') === 'true' : undefined,
        origin: (searchParams.get('origin') as SourceFilters['origin']) || undefined,
        sort_by: (searchParams.get('sort_by') as SourceSortBy) || undefined,
        sort_dir: (searchParams.get('sort_dir') as SortDir) || undefined,
        limit: Number(searchParams.get('limit')) || DEFAULT_SOURCE_FILTERS.limit,
        offset: Number(searchParams.get('offset')) || DEFAULT_SOURCE_FILTERS.offset,
    };

    const setFilters = useCallback((updates: Partial<SourceFilters>) => {
        const params = new URLSearchParams(searchParams.toString());

        Object.entries(updates).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                params.delete(key);
            } else {
                params.set(key, String(value));
            }
        });

        if (updates.offset === undefined && Object.keys(updates).some(k => k !== 'offset' && k !== 'limit')) {
            params.delete('offset');
        }

        // Discrete filter/page change — Back undoes exactly one step.
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
    }, [searchParams, router, pathname]);

    const resetFilters = useCallback(() => {
        // Discrete "clear filters" — Back restores what was cleared.
        router.push(pathname, { scroll: false });
    }, [router, pathname]);

    const hasActiveFilters = !!(
        filters.keyword_id ||
        filters.scrape_status ||
        filters.source_type ||
        filters.hostname ||
        filters.is_included !== undefined ||
        filters.origin
    );

    return { filters, setFilters, resetFilters, hasActiveFilters };
}
