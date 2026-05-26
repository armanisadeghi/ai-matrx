import { Suspense } from 'react';
import { ShowDetailClient } from '@/features/podcasts/components/admin/ShowDetailClient';

export const metadata = { title: 'New Podcast Show' };

export default function NewShowPage() {
    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            <Suspense fallback={
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    Loading…
                </div>
            }>
                <ShowDetailClient showId="new" />
            </Suspense>
        </div>
    );
}
