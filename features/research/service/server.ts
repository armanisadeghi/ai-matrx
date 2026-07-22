import { createClient } from '@/utils/supabase/server';
import type { ResearchTopic, ResearchProgress } from '../types';
import { rowToResearchTopic, researchProgressFromJson } from '../types';

export async function getTopicServer(topicId: string): Promise<ResearchTopic | null> {
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
