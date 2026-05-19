// hooks/useDebugContext.ts
//
// Drop-in hook for any route or feature component to publish debug context to
// the admin indicator — with zero overhead for non-admins.
//
// Usage:
//
//   const { publish, publishKey } = useDebugContext('Chat');
//
//   useEffect(() => {
//     publish({
//       'Session ID': sessionId,
//       'Status': session.status,
//       'Message Count': messages.length,
//     });
//   }, [session, messages]);
//
// Keys are automatically namespaced: "Chat:Session ID", "Chat:Status", etc.
// They are removed from the store when the component unmounts, so stale debug
// data never persists after navigation.
//
// The hook is a no-op when the user is not an admin — no dispatch, no effect,
// no re-render cost. Safe to use in any component tree.

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { updateDebugData, clearDebugNamespace, selectIsDebugMode } from '@/lib/redux/preferences/adminDebugSlice';
import { selectIsSuperAdmin } from '@/lib/redux/slices/userSlice';

export function useDebugContext(namespace: string) {
    const dispatch = useAppDispatch();
    const isAdmin = useAppSelector(selectIsSuperAdmin);
    const isDebugMode = useAppSelector(selectIsDebugMode);
    const namespaceRef = useRef(namespace);

    // Namespace cleanup on unmount
    useEffect(() => {
        namespaceRef.current = namespace;
        return () => {
            if (isAdmin) {
                dispatch(clearDebugNamespace(namespaceRef.current));
            }
        };
        // Only run cleanup on unmount — intentionally exclude isAdmin from deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // publish — merges namespaced data into the debug store
    // No-op when not admin or debug mode is off
    const publish = useCallback(
        (data: Record<string, unknown>) => {
            if (!isAdmin || !isDebugMode) return;
            const namespaced: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(data)) {
                namespaced[`${namespace}:${key}`] = value;
            }
            dispatch(updateDebugData(namespaced));
        },
        [isAdmin, isDebugMode, namespace, dispatch],
    );

    // publishKey — set a single namespaced key
    const publishKey = useCallback(
        (key: string, value: unknown) => {
            if (!isAdmin || !isDebugMode) return;
            dispatch(updateDebugData({ [`${namespace}:${key}`]: value }));
        },
        [isAdmin, isDebugMode, namespace, dispatch],
    );

    // Whether debug publishing is active — use to gate expensive state collection
    const isActive = isAdmin && isDebugMode;

    return { publish, publishKey, isActive };
}
