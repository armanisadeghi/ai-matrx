'use client';

import { useEffect } from 'react';
import { Logo } from '@/components/branding/MatrixLogo';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { ErrorAlchemyMenu } from '@/components/errors/ErrorAlchemyMenu';

export default function ConsentError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[OAuth Consent Error]', error);
    }, [error]);

    return (
        <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-950 dark:to-neutral-900 p-4">
            <div className="w-full max-w-md">
                {/* AI Matrx branding */}
                <div className="flex justify-center mb-6">
                    <Logo size="lg" variant="horizontal" linkEnabled={false} />
                </div>

                {/* Error card */}
                <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg dark:shadow-neutral-950/50 overflow-hidden border border-gray-200/60 dark:border-neutral-700/60 p-6 sm:p-8 text-center space-y-4">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-center gap-2">
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Something went wrong
                            </h2>
                            <ErrorAlchemyMenu
                                input={{
                                    title: 'Something went wrong',
                                    message: error.message || 'An unexpected error occurred while processing this authorization request.',
                                    error,
                                    operation: 'Review an OAuth authorization request',
                                    details: error.digest ? { digest: error.digest } : undefined,
                                    source: 'route-boundary',
                                }}
                            />
                        </div>
                        <p className="text-sm text-gray-500 dark:text-neutral-400">
                            An unexpected error occurred while processing this authorization
                            request. Please try again.
                          <ErrorAlchemyMenu />
                        </p>
                    </div>
                    <Button onClick={reset} variant="outline">
                        Try again
                    </Button>
                </div>

                {/* Footer */}
                <p className="mt-4 text-center text-xs text-gray-400 dark:text-neutral-500">
                    AI Matrx keeps your data secure.{' '}
                    <a
                        href="/privacy-policy"
                        className="underline underline-offset-2 hover:text-gray-500 dark:hover:text-neutral-400 transition-colors"
                    >
                        Privacy Policy
                    </a>
                </p>
            </div>
        </div>
    );
}
