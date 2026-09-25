// hooks/useContextScope.ts
// Reads org/project/task context from URL search params.
// Single source of truth for request scoping across the app.
'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ContextScope } from '@/lib/api/types';
import { SCOPE_URL_PARAMS } from '@/lib/api/types';
import { currentPathWithSearch, replaceAddressWithoutNavigating } from '@/lib/url-state/addressWithoutNavigating';

/**
 * URL-based context scope hook.
 *
 * Reads org/project/task UUIDs from URL search params and provides
 * setters that update the URL. The backend client reads scope from
 * this hook and injects it into every request body.
 *
 * URL format: `?org=<uuid>&proj=<uuid>&task=<uuid>`
 *
 * Usage:
 * ```tsx
 * const { scope, setOrg, setProject, setTask } = useContextScope();
 *
 * // Read current scope
 * console.log(scope.organization_id); // "org-uuid" or undefined
 *
 * // Update scope (updates URL param)
 * setOrg('new-org-uuid');
 *
 * // Clear scope
 * setOrg(null);
 *
 * // Batch update
 * setScope({ organization_id: 'org-1', project_id: 'proj-1' });
 * ```
 */
export function useContextScope() {
    const searchParams = useSearchParams();

    // Read current scope from URL params
    const scope: ContextScope = {
        organization_id: searchParams.get('org') || undefined,
        project_id: searchParams.get('proj') || undefined,
        task_id: searchParams.get('task') || undefined,
    };

    // Helper to update URL params without losing other params
    const updateParams = useCallback(
        (updates: Record<string, string | null>) => {
            const params = new URLSearchParams(searchParams.toString());

            for (const [key, value] of Object.entries(updates)) {
                if (value === null || value === '') {
                    params.delete(key);
                } else {
                    params.set(key, value);
                }
            }

            replaceAddressWithoutNavigating(currentPathWithSearch(params));
        },
        [searchParams],
    );

    const setOrg = useCallback(
        (id: string | null) => updateParams({ org: id }),
        [updateParams],
    );

    const setProject = useCallback(
        (id: string | null) => updateParams({ proj: id }),
        [updateParams],
    );

    const setTask = useCallback(
        (id: string | null) => updateParams({ task: id }),
        [updateParams],
    );

    /** Batch-update multiple scope fields at once */
    const setScope = useCallback(
        (newScope: Partial<ContextScope>) => {
            const updates: Record<string, string | null> = {};
            if ('organization_id' in newScope) {
                updates.org = newScope.organization_id || null;
            }
            if ('project_id' in newScope) {
                updates.proj = newScope.project_id || null;
            }
            if ('task_id' in newScope) {
                updates.task = newScope.task_id || null;
            }
            updateParams(updates);
        },
        [updateParams],
    );

    /** Clear all scope params */
    const clearScope = useCallback(() => {
        updateParams({ org: null, proj: null, task: null });
    }, [updateParams]);

    /** Check if any scope is active */
    const hasScope = !!(scope.organization_id || scope.project_id || scope.task_id);

    return {
        /** Current org/project/task from URL */
        scope,
        /** Set organization ID (updates URL) */
        setOrg,
        /** Set project ID (updates URL) */
        setProject,
        /** Set task ID (updates URL) */
        setTask,
        /** Batch-update multiple scope fields */
        setScope,
        /** Clear all scope params */
        clearScope,
        /** Whether any scope is active */
        hasScope,
    };
}
