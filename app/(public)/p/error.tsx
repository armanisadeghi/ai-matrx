'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface ErrorPageProps {
    error: Error & { digest?: string };
    reset: () => void;
}

/**
 * Route-level error boundary for all /p/* routes.
 * 
 * This catches any uncaught errors in the prompt app routes including:
 * - Server component errors (data fetching failures)
 * - Unhandled client-side errors that escape the component ErrorBoundary
 * - Layout/page-level errors
 * 
 * Provides a professional error page with retry and navigation options.
 */
export default function PromptAppError({ error, reset }: ErrorPageProps) {
    useEffect(() => {
        console.error('[PromptApp Route Error]', error);
    }, [error]);

    return (
        <div className="flex items-center justify-center min-h-[calc(100dvh-var(--header-height,2.5rem))] bg-textured p-6">
            <div className="w-full max-w-md text-center">
                {/* Icon */}
                <div className="mx-auto w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
                    <AlertTriangle className="w-8 h-8 text-destructive" />
                </div>

                {/* Heading */}
                <h1 className="text-2xl font-bold text-foreground mb-2">
                    Something went wrong
                </h1>
                <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
                    We encountered an unexpected error while loading this app. 
                    This can happen when app code has an issue or the service is temporarily unavailable.
                </p>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8">
                    <button
                        onClick={reset}
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors w-full sm:w-auto justify-center"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                    </button>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors w-full sm:w-auto justify-center"
                    >
                        <Home className="w-4 h-4" />
                        Go Home
                    </Link>
                </div>

                {/* Error digest for support */}
                {error.digest && (
                    <p className="text-[11px] text-muted-foreground font-mono">
                        Error ID: {error.digest}
                    </p>
                )}
            </div>
        </div>
    );
}
