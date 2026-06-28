import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { getUserId } from '@/utils/auth/getUserId';
import type { SharedCanvasItem } from '@/types/canvas-social';

export function useSharedCanvas(shareToken: string | null) {
    const supabase = createClient();

    return useQuery({
        queryKey: ['shared-canvas', shareToken],
        queryFn: async () => {
            if (!shareToken) throw new Error('No share token provided');

            const { data, error } = await supabase
                .schema('canvas').from('shared_canvas_items')
                .select('*')
                .eq('share_token', shareToken)
                .single();

            if (error) throw error;

            // Increment view count (don't wait for it)
            trackView(shareToken);

            return data as SharedCanvasItem;
        },
        enabled: !!shareToken,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

async function trackView(shareToken: string) {
    try {
        const supabase = createClient();
        const userId = getUserId();
        
        // Get or create session ID
        let sessionId = sessionStorage.getItem('canvas_session_id');
        if (!sessionId) {
            sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('canvas_session_id', sessionId);
        }

        // Get canvas ID first
        const { data: canvas } = await supabase
            .schema('canvas').from('shared_canvas_items')
            .select('id')
            .eq('share_token', shareToken)
            .single();

        if (!canvas) return;

        // Insert view
        await supabase
            .schema('canvas').from('canvas_views')
            .insert({
                canvas_id: canvas.id,
                user_id: userId,
                session_id: sessionId,
                referrer: typeof document !== 'undefined' ? document.referrer : null,
                viewed_at: new Date().toISOString()
            });
    } catch (err) {
        console.error('Error tracking view:', err);
    }
}

