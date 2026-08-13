import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { getUserId } from '@/utils/auth/getUserId';
import { resolveSharedCanvas } from '@/features/canvas/shared/resolveSharedCanvas';
import type { SharedCanvasItem } from '@/types/canvas-social';

export function useSharedCanvas(shareToken: string | null) {
    const supabase = createClient();

    return useQuery({
        queryKey: ['shared-canvas', shareToken],
        queryFn: async () => {
            if (!shareToken) throw new Error('No share token provided');

            const canvas = await resolveSharedCanvas(shareToken, supabase);
            if (!canvas) throw new Error('Canvas not found');

            // Increment view count (don't wait for it)
            trackView(canvas.id, canvas.organization_id ?? null);

            return canvas;
        },
        enabled: !!shareToken,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

async function trackView(canvasId: string, organizationId: string | null) {
    try {
        // canvas_views.organization_id is NOT NULL (the canvas's org, so anon
        // viewers work) — without it there is nothing valid to insert.
        if (!organizationId) return;
        const supabase = createClient();
        const userId = getUserId();

        // Get or create session ID
        let sessionId = sessionStorage.getItem('canvas_session_id');
        if (!sessionId) {
            sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('canvas_session_id', sessionId);
        }

        // Insert view. The view belongs to the canvas's org (not the viewer's) —
        // this works for anonymous public-share viewers who have no session/org.
        await supabase
            .schema('canvas').from('canvas_views')
            .insert({
                canvas_id: canvasId,
                user_id: userId,
                organization_id: organizationId,
                session_id: sessionId,
                referrer: typeof document !== 'undefined' ? document.referrer : null,
                viewed_at: new Date().toISOString()
            });
    } catch (err) {
        console.error('Error tracking view:', err);
    }
}
