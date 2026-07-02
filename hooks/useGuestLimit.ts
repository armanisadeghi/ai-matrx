/**
 * useGuestLimit Hook
 * 
 * Manages guest execution limits across the application
 * Provides real-time status and warnings
 */

import { useState, useEffect, useCallback } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase/client';
import { getFingerprint } from '@/lib/services/fingerprint-service';
import { checkGuestLimit, type GuestLimitStatus } from '@/lib/services/guest-limit-service';

export interface GuestLimitState {
    // Status
    isAuthenticated: boolean;
    isGuest: boolean;
    
    // Limits
    allowed: boolean;
    remaining: number;
    totalUsed: number;
    isBlocked: boolean;
    
    // UI Control
    showWarning: boolean;  // Show after 3 executions
    showSignupModal: boolean;  // Show at 5 executions
    
    // Loading
    loading: boolean;
    error: string | null;
    
    // Fingerprint
    fingerprint: string | null;
}

export function useGuestLimit() {
    const [user, setUser] = useState<User | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [state, setState] = useState<GuestLimitState>({
        isAuthenticated: false,
        isGuest: true,
        allowed: true,
        remaining: 5,
        totalUsed: 0,
        isBlocked: false,
        showWarning: false,
        showSignupModal: false,
        loading: true,
        error: null,
        fingerprint: null
    });

    // Get current user on mount
    useEffect(() => {
        
        // Get initial user — use getSession() to avoid a network roundtrip
        supabase.auth.getSession().then(({ data }) => {
            setUser(data.session?.user ?? null);
            setAuthLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUser(session?.user ?? null);
            setAuthLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    /**
     * Check current limit status
     */
    const checkLimit = useCallback(async () => {
        // If authenticated, unlimited access
        if (user) {
            setState(prev => ({
                ...prev,
                isAuthenticated: true,
                isGuest: false,
                allowed: true,
                remaining: 999,
                loading: false,
                showWarning: false,
                showSignupModal: false
            }));
            return {
                allowed: true,
                remaining: 999,
                total_used: 0,
                is_blocked: false,
                guest_id: null
            };
        }

        try {
            // Get fingerprint
            const fingerprint = await getFingerprint();
            
            // Check limit (default max is 5, client-side call)
            const status = await checkGuestLimit(fingerprint);
            
            // Determine UI states
            const showWarning = status.remaining <= 2 && status.remaining > 0; // 3, 4, 5 executions
            const showSignupModal = status.remaining === 0; // At limit

            setState(prev => ({
                ...prev,
                isAuthenticated: false,
                isGuest: true,
                allowed: status.allowed,
                remaining: status.remaining,
                totalUsed: status.total_used,
                isBlocked: status.is_blocked,
                showWarning,
                showSignupModal,
                loading: false,
                error: null,
                fingerprint
            }));

            return status;
        } catch (error) {
            console.error('Failed to check guest limit:', error);
            setState(prev => ({
                ...prev,
                loading: false,
                error: error instanceof Error ? error.message : 'Failed to check limit',
                allowed: false // Fail closed
            }));
            
            return {
                allowed: false,
                remaining: 0,
                total_used: 0,
                is_blocked: true,
                guest_id: null
            };
        }
    }, [user]);

    /**
     * Refresh limit status
     */
    const refresh = useCallback(async () => {
        if (user) return; // Skip for authenticated users
        
        setState(prev => ({ ...prev, loading: true }));
        await checkLimit();
    }, [user, checkLimit]);

    /**
     * Dismiss warning
     */
    const dismissWarning = useCallback(() => {
        setState(prev => ({ ...prev, showWarning: false }));
    }, []);

    /**
     * Dismiss signup modal
     */
    const dismissSignupModal = useCallback(() => {
        setState(prev => ({ ...prev, showSignupModal: false }));
    }, []);

    /**
     * Initialize on mount
     */
    useEffect(() => {
        if (!authLoading) {
            checkLimit();
        }
    }, [authLoading, checkLimit]);

    return {
        ...state,
        checkLimit,
        refresh,
        dismissWarning,
        dismissSignupModal
    };
}

