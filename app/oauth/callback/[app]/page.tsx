import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import CallbackClient from './CallbackClient';
import { getAppConfig } from '../app-config';
import { Skeleton } from '@ai-matrx/design-system';

interface Props {
    params: Promise<{ app: string }>;
}

export default async function OAuthCallbackPage({ params }: Props) {
    const { app } = await params;
    const config = getAppConfig(app);

    if (!config) {
        notFound();
    }

    return (
        <Suspense fallback={<CallbackLoadingSkeleton appName={config.name} />}>
            <CallbackClient appSlug={app} appName={config.name} />
        </Suspense>
    );
}

function CallbackLoadingSkeleton({ appName }: { appName: string }) {
    return (
        <div className="min-h-dvh w-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-neutral-950 dark:to-neutral-900 p-4">
            <div className="w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <Skeleton className="h-8 w-32 rounded-md" />
                </div>
                <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-lg dark:shadow-neutral-950/50 overflow-hidden border border-gray-200/60 dark:border-neutral-700/60 p-6 sm:p-8">
                    <div className="flex flex-col items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                </div>
            </div>
        </div>
    );
}
