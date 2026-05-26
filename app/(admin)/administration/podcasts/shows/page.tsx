import { Suspense } from 'react';
import { ShowsClient } from '@/features/podcasts/components/admin/ShowsClient';

export const metadata = { title: 'Podcast Shows' };

export default function PodcastShowsPage() {
    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            <div className="flex items-center px-4 py-3 border-b bg-background shrink-0">
                <h2 className="text-base font-semibold">Podcast Shows</h2>
            </div>
            <Suspense fallback={
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    Loading…
                </div>
            }>
                <ShowsClient />
            </Suspense>
        </div>
    );
}
