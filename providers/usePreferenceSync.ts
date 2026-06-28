// hooks/usePreferenceSync.ts
'use client';

import { useEffect } from 'react';
import { useAppSelector } from "@/lib/redux/hooks";
import { supabase } from '@/utils/supabase/client';

export function usePreferenceSync() {
    const userId = useAppSelector((state) => state.userAuth.id);
    const preferences = useAppSelector((state) => state.userPreferences);

    useEffect(() => {
        if (!userId) return;

        return () => {
            supabase.schema('users').from('user_preferences').upsert({
                user_id: userId,
                preferences,
            });
        };
    }, []);
}

export function PreferenceSyncProvider({ children }: { children: React.ReactNode }) {
    usePreferenceSync();
    return children;
}
