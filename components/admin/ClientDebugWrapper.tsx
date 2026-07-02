// components/debug/ClientDebugWrapper.tsx
'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { UserData } from "@/utils/userDataMapper";

interface ClientDebugWrapperProps {
    user: UserData;
}

const EnhancedDebugInterface = dynamic(() => import('./EnhancedDebugInterface'), {
    ssr: false,
});

export function ClientDebugWrapper({ user }: ClientDebugWrapperProps) {
    const initialShouldShowDebug =
        user.userMetadata.fullName === 'Arman Sadeghi' ||
        process.env.NEXT_PUBLIC_ENV === 'development' ||
        process.env.NEXT_PUBLIC_ENABLE_DEBUG === 'true';

    const [isDebugEnabled, setIsDebugEnabled] = useState<boolean>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('debug-interface-enabled');
            return saved ? Boolean(JSON.parse(saved)) : initialShouldShowDebug;
        }
        return initialShouldShowDebug;
    });

    useEffect(() => {
        localStorage.setItem('debug-interface-enabled', JSON.stringify(isDebugEnabled));
    }, [isDebugEnabled]);

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (!initialShouldShowDebug) return;

            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'd') {
                e.preventDefault();
                setIsDebugEnabled(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [initialShouldShowDebug]);

    if (process.env.NEXT_PUBLIC_ENABLE_DEBUG === 'false' || !isDebugEnabled) return null;

    return <EnhancedDebugInterface />;
}
