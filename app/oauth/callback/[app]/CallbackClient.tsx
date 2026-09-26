'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Logo } from '@/components/branding/MatrixLogo';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowUpRight, AlertTriangle, X } from 'lucide-react';
import { getAppConfig, buildDeepLinkUrl } from '../app-config';

type PageState =
    | { kind: 'redirecting' }
    | { kind: 'success'; deepLinkUrl: string }
    | { kind: 'error'; message: string };

interface CallbackClientProps {
    appSlug: string;
    appName: string;
}

export default function CallbackClient({ appSlug, appName }: CallbackClientProps) {
    const searchParams = useSearchParams();
    const [pageState, setPageState] = useState<PageState>({ kind: 'redirecting' });
    const attempted = useRef(false);

    useEffect(() => {
        if (attempted.current) return;
        attempted.current = true;

        const code = searchParams.get('code');
        if (!code) {
            setPageState({
                kind: 'error',
                message:
                    'No authorization code was received. The OAuth flow may have been interrupted or denied.',
            });
            return;
        }

        const config = getAppConfig(appSlug);
        if (!config) {
            setPageState({ kind: 'error', message: `Unknown application: ${appSlug}` });
            return;
        }

        // Forward ALL query params from Supabase to the deep link
        const deepLinkUrl = buildDeepLinkUrl(
            config,
            new URLSearchParams(searchParams.toString()),
        );

        // Trigger the deep link to hand off the auth code to the desktop app
        window.location.href = deepLinkUrl;

        // After a short delay, show the success UI
        setTimeout(() => {
            setPageState({ kind: 'success', deepLinkUrl });
        }, 1500);

        // Attempt to close the tab automatically
        setTimeout(() => {
            try {
                window.close();
            } catch {
                // window.close() only works if the window was opened by script
            }
        }, 3000);
    }, [searchParams, appSlug]);

    return (
        <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-950 dark:to-neutral-900 p-4">
            <div className="w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <Logo size="lg" variant="horizontal" linkEnabled={false} />
                </div>

                <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg dark:shadow-neutral-950/50 overflow-hidden border border-gray-200/60 dark:border-neutral-700/60">
                    {pageState.kind === 'redirecting' && (
                        <RedirectingState appName={appName} />
                    )}
                    {pageState.kind === 'success' && (
                        <SuccessState
                            appName={appName}
                            deepLinkUrl={pageState.deepLinkUrl}
                        />
                    )}
                    {pageState.kind === 'error' && (
                        <ErrorState message={pageState.message} />
                    )}
                </div>

                <p className="mt-3 text-center text-[11px] text-muted-foreground">
                    AI Matrx keeps your data secure.{' '}
                    <a
                        href="/privacy-policy"
                        className="underline underline-offset-2 hover:text-foreground transition-colors"
                    >
                        Privacy Policy
                    </a>
                </p>
            </div>
        </div>
    );
}

function RedirectingState({ appName }: { appName: string }) {
    return (
        <div className="p-6 sm:p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
            <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-foreground">
                    Opening {appName}
                </h2>
                <p className="text-sm text-muted-foreground">
                    Transferring your authentication to the desktop app...
                </p>
            </div>
        </div>
    );
}

function SuccessState({
    appName,
    deepLinkUrl,
}: {
    appName: string;
    deepLinkUrl: string;
}) {
    function handleOpenApp() {
        window.location.href = deepLinkUrl;
    }

    function handleCloseTab() {
        try {
            window.close();
        } catch {
            // Cannot close — noop
        }
    }

    return (
        <div className="p-6 sm:p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
            </div>
            <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-foreground">
                    Authentication successful
                </h2>
                <p className="text-sm text-muted-foreground">
                    You can now return to {appName}. This tab can be safely closed.
                </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
                <Button onClick={handleOpenApp} className="w-full gap-2">
                    <ArrowUpRight className="h-4 w-4" />
                    Open {appName}
                </Button>
                <Button
                    variant="outline"
                    onClick={handleCloseTab}
                    className="w-full gap-2"
                >
                    <X className="h-4 w-4" />
                    Close this tab
                </Button>
            </div>
        </div>
    );
}

function ErrorState({ message }: { message: string }) {
    return (
        <div className="p-6 sm:p-8 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-foreground">
                    Authentication failed
                </h2>
                <p className="text-sm text-muted-foreground">{message}</p>
            </div>
            <p className="text-xs text-muted-foreground">
                Please return to the application and try again.
            </p>
        </div>
    );
}
