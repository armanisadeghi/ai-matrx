import { createClient } from '@/utils/supabase/server';
import type { PcShow } from '@/features/podcasts/types';
import { mapPcShowRow } from '@/features/podcasts/types';
import PageHeader from '@/features/shell/components/header/PageHeader';
import { PodcastIndexClient } from './PodcastIndexClient';

export const revalidate = 3600;


export default async function PodcastsIndexPage() {
    const supabase = await createClient();
    const { data: shows } = await supabase
        .schema('podcast').from('pc_shows')
        .select('*')
        .is('deleted_at', null)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

    const published: PcShow[] = (shows ?? []).map(mapPcShowRow);

    return (
        <>
            <PageHeader>
                <span className="ml-2 text-sm font-medium text-foreground truncate">Podcasts</span>
            </PageHeader>
            <PodcastIndexClient published={published} />
        </>
    );
}
