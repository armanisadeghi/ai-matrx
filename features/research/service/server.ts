import { createClient } from '@/utils/supabase/server';
import { accessSatisfies } from '@/utils/permissions/access-core';
import { resolveAccess } from '@/utils/permissions/requireAccess';
import type { ResearchTopic, ResearchProgress, ResearchIntent } from '../types';
import { rowToResearchTopic, researchProgressFromJson } from '../types';

export async function getTopicServer(topicId: string): Promise<ResearchTopic | null> {
    // `rs_topic` has an admin-inspection RLS lane, while the product access
    // resolver deliberately refuses a stranger's personal topic. Gate before
    // reading so the layout can render AccessGate and metadata cannot disclose
    // a title that the ordinary product access model denies.
    const access = await resolveAccess('research_topic', topicId);
    if (!accessSatisfies(access.level, 'view')) return null;

    const supabase = await createClient();
    const { data, error } = await supabase
        .schema('research').from('rs_topic')
        .select('*')
        .is('deleted_at', null)
        .eq('id', topicId)
        .single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    // Boundary mapper — narrows autonomy/tag_suggestions (never a raw cast).
    return rowToResearchTopic(data);
}

export async function getTopicOverviewServer(topicId: string): Promise<ResearchProgress | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_topic_overview', { p_topic_id: topicId });
    if (error) throw error;
    // Boundary parse — accepts legacy `project_syntheses` keys (PHASE-4 COMPAT).
    return researchProgressFromJson(data);
}

/** The fixed research-intent catalog, active only — SSR twin of `service.ts::getResearchIntents`. */
export async function getResearchIntentsServer(): Promise<ResearchIntent[]> {
    const supabase = await createClient();
    // VIEW LAW: fixed platform catalog — active rows are world-readable
    // reference data, not a tenant list.
    const { data, error } = await supabase
        .schema('research')
        .from('research_intent')
        .select('*')
        .eq('is_active', true)
        .order('position', { ascending: true });
    if (error) throw error;
    return data ?? [];
}
