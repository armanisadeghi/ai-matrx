import { createClient } from '@/utils/supabase/server';
import type { Metadata } from 'next';
import { Mic } from 'lucide-react';
import type { PcShow } from '@/features/podcasts/types';
import { PodcastGrid } from './PodcastGrid';

export const revalidate = 3600;

export const metadata: Metadata = {
    title: 'Podcasts',
    description: 'Browse all podcast shows.',
    openGraph: {
        title: 'Podcasts',
        description: 'Browse all podcast shows.',
    },
};

export default async function PodcastsIndexPage() {
    const supabase = await createClient();
    const { data: shows } = await supabase
        .from('pc_shows')
        .select('*')
        .eq('is_published', true)
        .order('created_at', { ascending: false });

    const published = (shows ?? []) as PcShow[];

    return (
        <div className="h-full w-full overflow-y-auto overscroll-contain bg-background">
            {/* Header */}
            <div className="relative overflow-hidden bg-zinc-900 px-4 pt-10 pb-12">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-transparent pointer-events-none" />
                <div className="relative z-10 max-w-2xl mx-auto text-center">
                    <h1 className="text-white font-bold text-4xl">Podcasts</h1>
                    <p className="text-white/50 text-sm mt-2">
                        {published.length} {published.length === 1 ? 'show' : 'shows'} available
                    </p>
                </div>
            </div>

            {/* Show grid — client component because it uses onError on img */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                <PodcastGrid shows={published} />
            </div>
        </div>
    );
}
