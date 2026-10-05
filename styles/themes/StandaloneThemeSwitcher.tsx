// File: @/components/StandaloneThemeSwitcher.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';

interface StandaloneThemeSwitcherProps {
    className?: string;
    initialTheme?: 'light' | 'dark';
}

export const StandaloneThemeSwitcher: React.FC<StandaloneThemeSwitcherProps> = ({ 
    className, 
    initialTheme 
}) => {
    // Detect system theme if initialTheme is not provided
    const detectTheme = (): 'light' | 'dark' => {
        // First check if we have a theme cookie
        if (typeof document !== 'undefined') {
            const cookieTheme = document.cookie
                .split('; ')
                .find(row => row.startsWith('theme='))
                ?.split('=')[1];
            
            if (cookieTheme === 'light' || cookieTheme === 'dark') {
                return cookieTheme;
            }
            
            // Check for class on documentElement
            if (document.documentElement.classList.contains('dark')) {
                return 'dark';
            }
            
            // Check for data-theme attribute
            const dataTheme = document.documentElement.getAttribute('data-theme');
            if (dataTheme === 'light' || dataTheme === 'dark') {
                return dataTheme;
            }
            
            // Check system preference
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        }
        
        return 'light'; // Default fallback
    };

    const [mode, setMode] = useState<'light' | 'dark'>(initialTheme || detectTheme());
    const router = useRouter();

    useEffect(() => {
        // Initialize with the detected or provided theme
        const currentTheme = initialTheme || detectTheme();
        setMode(currentTheme);
        document.documentElement.classList.toggle('dark', currentTheme === 'dark');
    }, [initialTheme]);

    const toggleMode = async () => {
        const newMode = mode === 'dark' ? 'light' : 'dark';
        setMode(newMode);
        document.documentElement.classList.toggle('dark', newMode === 'dark');

        // Update the cookie server-side
        await fetch('/api/set-theme', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ theme: newMode }),
        });

        // Refresh the current route to update server components
        router.refresh();
    };

    return (
        <Button
            icon={mode === 'dark' ? (
                <Sun />
            ) : (
                <Moon />
            )}
            variant="quiet"
            onClick={toggleMode}
            className={className}
            aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        />
    );
};