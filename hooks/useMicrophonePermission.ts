'use client';

import { useState, useCallback, useEffect } from 'react';

export type MicPermissionStatus = 'unknown' | 'granted' | 'denied' | 'prompt';

const COOKIE_KEY = 'mic_permission_asked';
const COOKIE_DAYS = 365;

function setCookie(name: string, value: string, days: number) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Hook to manage microphone permission in a user-friendly way.
 *
 * Usage pattern:
 * 1. Call `checkPermission()` on mount to read the current browser state.
 * 2. When user wants to use mic, call `requestPermission()`.
 *    - If status is 'prompt', set `showConsentModal` to true first, then call this after they confirm.
 * 3. Persist the fact that we've shown the modal to cookies so we don't re-show it.
 */
export function useMicrophonePermission() {
    const [status, setStatus] = useState<MicPermissionStatus>('unknown');
    const [showConsentModal, setShowConsentModal] = useState(false);
    // Whether we have already asked during this session
    const [hasAskedBefore, setHasAskedBefore] = useState(false);

    // Read browser permission state without prompting
    const checkPermission = useCallback(async () => {
        if (typeof navigator === 'undefined') return 'unknown';

        // Check the cookie — if we've asked before, note that
        const cookieVal = getCookie(COOKIE_KEY);
        if (cookieVal === 'true') {
            setHasAskedBefore(true);
        }

        // Use the Permissions API if available (doesn't prompt the user)
        if (navigator.permissions) {
            try {
                const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                setStatus(result.state as MicPermissionStatus);

                // Listen for permission changes
                result.onchange = () => {
                    setStatus(result.state as MicPermissionStatus);
                };
                return result.state as MicPermissionStatus;
            } catch {
                // Permissions API not supported for microphone (e.g., Firefox)
                setStatus('prompt');
                return 'prompt';
            }
        } else {
            setStatus('prompt');
            return 'prompt';
        }
    }, []);

    // Actually request the microphone (triggers browser permission dialog)
    const requestPermission = useCallback(async (): Promise<MicPermissionStatus> => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // Close the stream immediately — we just needed permission
            stream.getTracks().forEach(track => track.stop());
            setStatus('granted');
            // Persist that we've asked
            setCookie(COOKIE_KEY, 'true', COOKIE_DAYS);
            setHasAskedBefore(true);
            return 'granted';
        } catch (err) {
            const name = err instanceof DOMException ? err.name : undefined;
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setStatus('denied');
                setCookie(COOKIE_KEY, 'true', COOKIE_DAYS);
                setHasAskedBefore(true);
                return 'denied';
            }
            // Device not found or other error
            console.error('Microphone request error:', err);
            return status;
        }
    }, [status]);

    /**
     * The main entry point for features that need the microphone.
     * - If already granted: returns true immediately.
     * - If already denied: returns false immediately.
     * - If never asked (prompt): shows consent modal, then requests.
     * Returns a promise resolving to true if permission was granted.
     */
    const ensurePermission = useCallback(async (): Promise<boolean> => {
        const currentStatus = status === 'unknown' ? await checkPermission() : status;

        if (currentStatus === 'granted') return true;
        if (currentStatus === 'denied') return false;

        // 'prompt' — show the consent modal first
        setShowConsentModal(true);
        return false; // The modal will handle the actual request
    }, [status, checkPermission]);

    // Called when user clicks "Allow" in our consent modal
    const handleConsentAccepted = useCallback(async (): Promise<boolean> => {
        setShowConsentModal(false);
        const result = await requestPermission();
        return result === 'granted';
    }, [requestPermission]);

    // Called when user dismisses the consent modal
    const handleConsentDismissed = useCallback(() => {
        setShowConsentModal(false);
        setCookie(COOKIE_KEY, 'true', COOKIE_DAYS);
        setHasAskedBefore(true);
    }, []);

    // Check on mount
    useEffect(() => {
        checkPermission();
    }, [checkPermission]);

    return {
        status,
        showConsentModal,
        setShowConsentModal,
        hasAskedBefore,
        checkPermission,
        requestPermission,
        ensurePermission,
        handleConsentAccepted,
        handleConsentDismissed,
        isGranted: status === 'granted',
        isDenied: status === 'denied',
        needsPrompt: status === 'prompt',
    };
}
