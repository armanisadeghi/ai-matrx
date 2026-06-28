import { createClient } from '@/utils/supabase/server';
import type { ResearchTopic, ResearchProgress } from '../types';

export async function getTopicServer(topicId: string): Promise<ResearchTopic | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .schema('research').from('rs_topic')
        .select('*')
        .eq('id', topicId)
        .single();
    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data as ResearchTopic;
}

export async function getTopicOverviewServer(topicId: string): Promise<ResearchProgress | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('get_topic_overview', { p_topic_id: topicId });
    if (error) throw error;
    return (data as unknown as ResearchProgress) ?? null;
}
