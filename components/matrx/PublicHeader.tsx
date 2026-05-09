import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LogIn } from 'lucide-react';
import { PublicHeaderAuth } from './PublicHeaderAuth';
import { PublicHeaderFeedback } from './PublicHeaderFeedback';
import { PublicHeaderThemeToggle } from './PublicHeaderThemeToggle';

function AuthFallback() {
    return (
        <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs opacity-50 cursor-default"
            disabled
        >
            <LogIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign In</span>
        </Button>
    );
}

function ThemeToggleFallback() {
    return <div className="w-7 h-7" aria-hidden="true" />;
}

export function PublicHeader() {
    return (
        <header data-public-header className="sticky top-0 z-50 w-full matrx-shell-glass">
            <div className="w-full px-4 h-10 flex items-center justify-between">
                <Link
                    href="/"
                    className="flex items-center gap-2 group transition-opacity hover:opacity-80"
                >
                    <Image
                        src="/matrx/matrx-icon.svg"
                        width={18}
                        height={18}
                        alt="AI Matrx Logo"
                        className="flex-shrink-0"
                        priority
                    />
                </Link>

                <div className="flex items-center gap-2">
                    <Link href="/canvas/discover" className="hidden md:block">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "h-7 px-3 text-xs font-medium matrx-shell-glass rounded-lg",
                                "text-zinc-600 dark:text-zinc-400",
                                "hover:text-zinc-900 dark:hover:text-zinc-100",
                                "transition-all duration-200"
                            )}
                        >
                            Discover
                        </Button>
                    </Link>

                    <Suspense fallback={null}>
                        <PublicHeaderFeedback />
                    </Suspense>

                    <Suspense fallback={<ThemeToggleFallback />}>
                        <PublicHeaderThemeToggle />
                    </Suspense>

                    <Suspense fallback={<AuthFallback />}>
                        <PublicHeaderAuth />
                    </Suspense>
                </div>
            </div>
        </header>
    );
}
