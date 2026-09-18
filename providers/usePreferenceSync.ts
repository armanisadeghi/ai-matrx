// hooks/usePreferenceSync.ts
'use client';

import { useEffect } from 'react';
import { useAppSelector } from "@/lib/redux/hooks";
import { supabase } from '@/utils/supabase/client';
import { ensureOrgId } from '@/lib/organizations/personalOrg';
import { captureError } from '@/lib/diagnostics/errorCaptureStore';

export function usePreferenceSync() {
    const userId = useAppSelector((state) => state.userAuth.id);
    const preferences = useAppSelector((state) => state.userPreferences);

    useEffect(() => {
        if (!userId) return undefined;

        return () => {
            // The flush runs in an effect cleanup, so nothing above it can
            // catch: a refusal (no organization selected) or a failed upsert
            // must scream through the Error Inspector, never vanish.
            void ensureOrgId(undefined)
                .then((organizationId) =>
                    supabase.schema('users').from('user_preferences').upsert({
                        organization_id: organizationId,
                        user_id: userId,
                        preferences,
                    }),
                )
                .then((result) => {
                    if (result?.error) throw result.error;
                })
                .catch((cause: unknown) => {
                    const message =
                        cause instanceof Error ? cause.message : String(cause);
                    captureError({
                        source: 'runtime-exception',
                        operation: 'upsert',
                        schema: 'users',
                        relation: 'user_preferences',
                        message: `Preference sync flush failed: ${message}`,
                        userMessage:
                            'Your preferences were not saved. Select an organization and try again.',
                        recoverable: true,
                        raw: cause,
                    });
                });
        };
    }, []);
}

export function PreferenceSyncProvider({ children }: { children: React.ReactNode }) {
    usePreferenceSync();
    return children;
}
