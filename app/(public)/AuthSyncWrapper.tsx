// app/(public)/AuthSyncWrapper.tsx
'use client';

import { usePublicAuthSync } from '@/hooks/usePublicAuthSync';

interface AuthSyncWrapperProps {
    children: React.ReactNode;
}

/**
 * Wrapper that syncs Supabase auth to Redux.
 * 
 * Must be rendered inside Redux `StoreProvider` (needs Redux context).
 * Runs auth check once after initial render, populates Redux user slice.
 * 
 * All child components can then read from Redux instead of making
 * their own Supabase auth calls.
 */
export function AuthSyncWrapper({ children }: AuthSyncWrapperProps) {
    usePublicAuthSync();
    return <>{children}</>;
}
