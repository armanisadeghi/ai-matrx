import { createClient } from '@/utils/supabase/server';
import type { PcShow } from '@/features/podcasts/types';
import { mapPcShowRow } from '@/features/podcasts/types';
import { PC_SHOW_PUBLIC_SELECT } from '@/features/podcasts/publicColumns';
import PageHeader from '@/features/shell/components/header/PageHeader';
import { MandateDoorLink } from '@/features/mandates/components/MandateDoorLink';
import { PodcastIndexClient } from './PodcastIndexClient';

export const revalidate = 3600;


export default async function PodcastsIndexPage() {
    const supabase = await createClient();
    // A signed-out visitor runs as `anon`, which holds a COLUMN grant here —
    // `select('*')` asks for the five withheld columns too and the whole
    // request comes back 42501. Name them (DD-230).
    const { data: shows, error } = await supabase
        .schema('podcast').from('pc_shows')
        .select(PC_SHOW_PUBLIC_SELECT)
        .is('deleted_at', null)
        .eq('is_published', true)
        .order('created_at', { ascending: false });

    // Never render "no shows published yet" over a failed read: that sentence
    // is a claim about the data, and a refused query cannot support it.
    if (error) {
        throw new Error(
            `The podcast index could not read podcast.pc_shows: ${error.message}` +
                (error.code ? ` (${error.code})` : '') +
                '. The signed-out column bound for this table is declared in ' +
                'lib/security/public-exposure.ts#ANON_COLUMN_SURFACE and mirrored in ' +
                'features/podcasts/publicColumns.ts.',
        );
    }

    const published: PcShow[] = (shows ?? []).map(mapPcShowRow);

    return (
        <>
            <PageHeader>
                <span className="ml-2 text-sm font-medium text-foreground truncate">Podcasts</span>
                <MandateDoorLink feature="podcast" label="Podcast agents" className="ml-auto" />
            </PageHeader>
            <PodcastIndexClient published={published} />
        </>
    );
}
