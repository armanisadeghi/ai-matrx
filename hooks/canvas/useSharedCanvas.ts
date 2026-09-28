import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { recordUnavailable } from '@/lib/records/recordUnavailable';
import { getUserId } from '@/utils/auth/getUserId';
import { getActiveOrgId } from '@/lib/organizations/activeOrg';
import { resolveSharedCanvas } from '@/features/canvas/shared/resolveSharedCanvas';
import { getCanvasViewScope } from '@/features/canvas/shared/canvasViewTracking';
import type { SharedCanvasItem } from '@/types/canvas-social';

export function useSharedCanvas(shareToken: string | null) {
    const supabase = createClient();

    return useQuery({
        queryKey: ['shared-canvas', shareToken],
        queryFn: async () => {
            if (!shareToken) throw new Error('No share token provided');

            const canvas = await resolveSharedCanvas(shareToken, supabase);
            if (!canvas)
                throw recordUnavailable({
                    entity: 'shared canvas',
                    reason: 'unknown',
                    token: 'canvas_item',
                    relation: 'canvas_items',
                });

            // Record the signed-in viewer's view (don't wait for it)
            trackView(canvas.id);

            return canvas;
        },
        enabled: !!shareToken,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}

async function trackView(canvasId: string) {
    try {
        const supabase = createClient();

        // canvas.canvas_views refuses client writes (SECURITY-SWEEP 2026-09-21);
        // canvas.record_canvas_view is the one door. The view is always the
        // caller's own, in the organization the viewer has selected (never the
        // canvas's, never chosen by the database). Guests record nothing: the
        // share-token resolver already records guest token access.
        const scope = getCanvasViewScope(getUserId(), getActiveOrgId());
        if (!scope) return;

        // Get or create session ID
        let sessionId = sessionStorage.getItem('canvas_session_id');
        if (!sessionId) {
            sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('canvas_session_id', sessionId);
        }

        const { error } = await supabase
            .schema('canvas')
            .rpc('record_canvas_view', {
                p_canvas_id: canvasId,
                p_organization_id: scope.organizationId,
                p_session_id: sessionId,
                p_referrer: typeof document !== 'undefined' && document.referrer ? document.referrer : undefined,
            });
        if (error) throw error;
    } catch (err) {
        console.error('Error tracking view:', err);
    }
}
