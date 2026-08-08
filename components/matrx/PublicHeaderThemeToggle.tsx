'use client';

import { Moon, Sun } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/lib/redux/hooks';
import { setMode } from '@/styles/themes/themeSlice';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMounted } from '@/hooks/use-is-mounted';

export function PublicHeaderThemeToggle() {
    const theme = useAppSelector((s) => s.theme.mode);
    const dispatch = useAppDispatch();
    const setTheme = (t: 'light' | 'dark') => dispatch(setMode(t));
    const mounted = useIsMounted();

    // Don't render until mounted to avoid hydration mismatch
    if (!mounted) {
        return (
            <div className="h-11 w-11" aria-hidden="true" />
        );
    }

    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={cn(
                "h-11 w-11 p-0 rounded-full",
                "hover:bg-zinc-100 dark:hover:bg-zinc-800",
                "transition-all duration-200"
            )}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
            {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            ) : (
                <Moon className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
            )}
        </Button>
    );
}
