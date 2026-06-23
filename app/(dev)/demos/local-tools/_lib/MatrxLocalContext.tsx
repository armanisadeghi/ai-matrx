'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useMatrxLocal, type UseMatrxLocalReturn } from './useMatrxLocal';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MatrxLocalContext = createContext<UseMatrxLocalReturn | null>(null);

// ---------------------------------------------------------------------------
// Provider — mount once at the layout level, shared across all sub-pages
// ---------------------------------------------------------------------------

export function MatrxLocalProvider({ children }: { children: ReactNode }) {
    const local = useMatrxLocal();
    return (
        <MatrxLocalContext.Provider value={local}>
            {children}
        </MatrxLocalContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Hook — use this everywhere instead of useMatrxLocal()
// ---------------------------------------------------------------------------

export function useMatrxLocalContext(): UseMatrxLocalReturn {
    const ctx = useContext(MatrxLocalContext);
    if (!ctx) {
        throw new Error('useMatrxLocalContext must be used inside <MatrxLocalProvider>');
    }
    return ctx;
}
