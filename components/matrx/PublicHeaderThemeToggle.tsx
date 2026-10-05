'use client';

import { Moon, Sun } from 'lucide-react';
import { useAppDispatch } from '@/lib/redux/hooks';
import { setMode } from '@/styles/themes/themeSlice';
import { useThemeMode } from '@/styles/themes/useThemeMode';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMounted } from '@/hooks/use-is-mounted';
import { PUBLIC_HEADER_ICON_BUTTON } from "./publicHeaderChrome";

export function PublicHeaderThemeToggle() {
    const theme = useThemeMode();
    const dispatch = useAppDispatch();
    const setTheme = (t: 'light' | 'dark') => dispatch(setMode(t));
    const mounted = useIsMounted();

    // Don't render until mounted to avoid hydration mismatch
    if (!mounted) {
        return (
            <div className={PUBLIC_HEADER_ICON_BUTTON} aria-hidden="true" />
        );
    }

    return (
        <Button
            icon={theme === 'dark' ? (
                <Sun className="text-zinc-600 dark:text-zinc-400" />
            ) : (
                <Moon className="text-zinc-600 dark:text-zinc-400" />
            )}
            variant="quiet"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={PUBLIC_HEADER_ICON_BUTTON}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        />
    );
}
