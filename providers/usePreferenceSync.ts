// hooks/usePreferenceSync.ts
'use client';

import { useEffect } from 'react';
import { useAppSelector } from "@/lib/redux/hooks";
import { supabase } from '@/utils/supabase/client';
import { ensureOrgId } from '@/lib/organizations/personalOrg';

export function usePreferenceSync() {
    const userId = useAppSelector((state) => state.userAuth.id);
    const preferences = useAppSelector((state) => state.userPreferences);

    useEffect(() => {
        if (!userId) return undefined;

        return () => {
            void ensureOrgId(undefined).then((organizationId) =>
                supabase.schema('users').from('user_preferences').upsert({
                    organization_id: organizationId,
                    user_id: userId,
                    preferences,
                }),
            );
        };
    }, []);
}

export function PreferenceSyncProvider({ children }: { children: React.ReactNode }) {
    usePreferenceSync();
    return children;
}
