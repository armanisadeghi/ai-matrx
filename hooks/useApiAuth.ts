// hooks/useApiAuth.ts
// Centralized hook for API authentication headers
'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
    selectAccessToken,
    selectFingerprintId,
    selectAuthReady,
    selectIsAuthenticated,
    selectIsSuperAdmin,
    setFingerprintId,
} from '@/lib/redux/slices/userSlice';
import { getFingerprint } from '@/lib/services/fingerprint-service';
import { selectOrganizationId } from '@/lib/redux/slices/appContextSlice';
import {
    applyOrganizationContextHeader,
    requireOrganizationContext,
} from '@/lib/api/organization-context';

/**
 * Pure header builder shared by `useApiAuth().getHeaders()` (and its tests).
 *
 * Organization admission rides with auth: the server's AuthMiddleware
 * (matrx-connect, 2026-08-30) refuses any IDENTIFIED request that names no
 * organization via `X-Organization-Id`. Mirrors `buildHeaders` in
 * `lib/api/backend-client.ts` exactly — both the JWT and fingerprint (guest)
 * lanes are identified and run through the ONE fail-closed kernel
 * (`requireOrganizationContext`), so a missing organization throws
 * `OrganizationContextError` BEFORE any networking, matching the server's
 * `organization_required` 400 gate one hop earlier. Only a request with no
 * identity at all (no token, no fingerprint) skips the organization check,
 * because the server's admission gate never reaches it either.
 */
export function buildApiAuthHeaders(args: {
    accessToken: string | null;
    fingerprintId: string | null;
    organizationId: string | null;
    /** Caller-resolved authoritative org (e.g. an entity's own) — wins outright. */
    organizationIdOverride?: string | null;
}): Record<string, string> {
    let headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (args.accessToken) {
        headers['Authorization'] = `Bearer ${args.accessToken}`;
    } else if (args.fingerprintId) {
        headers['X-Fingerprint-ID'] = args.fingerprintId;
    }

    if (args.accessToken || args.fingerprintId) {
        headers = applyOrganizationContextHeader(
            headers,
            requireOrganizationContext(
                args.organizationId,
                args.organizationIdOverride ?? undefined,
            ),
        );
    }

    return headers;
}

/**
 * Centralized hook for API authentication.
 * 
 * Provides ready-to-use headers for all API calls:
 * - Authenticated users: Authorization header with Bearer token
 * - Guest users: X-Fingerprint-ID header
 * 
 * Usage:
 * ```typescript
 * const { getHeaders, isReady, waitForAuth } = useApiAuth();
 * 
 * // Simple usage (when you know auth is ready)
 * const response = await fetch(url, {
 *   method: 'POST',
 *   headers: getHeaders(),
 *   body: JSON.stringify(data),
 * });
 * 
 * // Safe usage (waits for auth if not ready)
 * await waitForAuth();
 * const response = await fetch(url, { headers: getHeaders(), ... });
 * ```
 */
export function useApiAuth() {
    const dispatch = useDispatch();
    const accessToken = useSelector(selectAccessToken);
    const fingerprintId = useSelector(selectFingerprintId);
    const authReady = useSelector(selectAuthReady);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const isAdmin = useSelector(selectIsSuperAdmin);
    const organizationId = useSelector(selectOrganizationId);

    // Live refs so async loops always read current Redux state, not stale closures
    const accessTokenRef = useRef(accessToken);
    const fingerprintIdRef = useRef(fingerprintId);
    const authReadyRef = useRef(authReady);
    useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);
    useEffect(() => { fingerprintIdRef.current = fingerprintId; }, [fingerprintId]);
    useEffect(() => { authReadyRef.current = authReady; }, [authReady]);

    // Shared promise so concurrent waitForAuth calls all resolve together
    const fingerprintFetchPromiseRef = useRef<Promise<boolean> | null>(null);

    /**
     * Get headers for API requests.
     * Returns headers with either Authorization (authenticated) or X-Fingerprint-ID (guest),
     * plus the mandatory `X-Organization-Id` for every identified request —
     * fail-closed (throws `OrganizationContextError` before any networking when
     * no organization is selected), matching `lib/api/backend-client.ts`.
     */
    const getHeaders = useCallback(
        (options?: { organizationId?: string | null }): Record<string, string> =>
            buildApiAuthHeaders({
                accessToken,
                fingerprintId,
                organizationId,
                organizationIdOverride: options?.organizationId ?? null,
            }),
        [accessToken, fingerprintId, organizationId],
    );

    /**
     * Wait for authentication to be ready.
     * Uses refs so the async polling loop always sees current Redux state.
     * Concurrent calls share a single fingerprint-fetch promise to avoid races.
     * Always returns true — falls back to a temporary fingerprint as last resort.
     */
    const waitForAuth = useCallback(async (): Promise<boolean> => {
        // Fast path: already ready
        if (authReadyRef.current && (accessTokenRef.current || fingerprintIdRef.current)) {
            return true;
        }

        // Poll for up to 800ms, reading live refs on each tick
        const maxWait = 800;
        const checkInterval = 50;
        let waited = 0;

        while (waited < maxWait) {
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            waited += checkInterval;
            if (authReadyRef.current || accessTokenRef.current || fingerprintIdRef.current) {
                return true;
            }
        }

        // Auth flow didn't complete in time — fetch fingerprint directly.
        // Share a single in-flight promise so concurrent callers don't race.
        if (!fingerprintFetchPromiseRef.current) {
            fingerprintFetchPromiseRef.current = (async () => {
                try {
                    const fp = await getFingerprint();
                    dispatch(setFingerprintId(fp));
                    return true;
                } catch (error) {
                    console.error('Failed to get fingerprint:', error);
                    const tempFp = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                    dispatch(setFingerprintId(tempFp));
                    return true;
                } finally {
                    fingerprintFetchPromiseRef.current = null;
                }
            })();
        }

        return fingerprintFetchPromiseRef.current;
    }, [dispatch]);

    /**
     * Check if auth is ready (has either token or fingerprint).
     * Most components won't need this - use waitForAuth for safety.
     */
    const isReady = authReady && !!(accessToken || fingerprintId);

    return {
        /** Get headers for API requests (Authorization or X-Fingerprint-ID) */
        getHeaders,
        /** Wait for auth to be ready before making API calls */
        waitForAuth,
        /** Whether auth is ready (has token or fingerprint) */
        isReady,
        /** Whether user is authenticated (has session) */
        isAuthenticated,
        /** Whether user is an admin */
        isAdmin,
        /** The fingerprint ID (for logging/analytics) */
        fingerprintId,
        /** The access token (rarely needed directly) */
        accessToken,
    };
}
