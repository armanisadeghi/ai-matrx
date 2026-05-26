import { Suspense } from 'react';
import { EpisodeDetailClient } from '@/features/podcasts/components/admin/EpisodeDetailClient';

interface Props {
    params: Promise<{ showId: string; episodeId: string }>;
}

export default async function EpisodeDetailPage({ params }: Props) {
    const { showId, episodeId } = await params;
    return (
        <div className="h-[calc(100vh-2.5rem)] flex flex-col overflow-hidden">
            <Suspense fallback={
                <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    Loading…
                </div>
            }>
                <EpisodeDetailClient showId={showId} episodeId={episodeId} />
            </Suspense>
        </div>
    );
}
