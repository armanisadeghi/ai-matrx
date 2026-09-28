import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { requireUserId } from '@/utils/auth/getUserId';
import { ensureOrgId } from '@/lib/organizations/ensureOrgId';
import { useToast } from '@/components/ui/use-toast';

export function useCanvasLike(canvasId: string) {
    const supabase = createClient();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // Check if user has liked
    const { data: hasLiked = false } = useQuery({
        queryKey: ['canvas-like', canvasId],
        queryFn: async () => {
            const userId = requireUserId();
    
            // Use maybeSingle() to avoid PGRST116 error when no like exists
            const { data } = await supabase
                .schema('canvas').from('canvas_likes')
                .select('id')
                .is('deleted_at', null)
                .eq('canvas_id', canvasId)
                .eq('user_id', userId)
                .maybeSingle();

            return !!data;
        },
        enabled: !!canvasId
    });

    // Like mutation
    const likeMutation = useMutation({
        mutationFn: async () => {
            // canvas.canvas_likes refuses client writes; canvas.set_canvas_like is
            // the one door: the like is always the caller's own, on a canvas they
            // can see, stamped with the organization named here. A like that an
            // unlike archived is revived (same row), never duplicated.
            const { error } = await supabase
                .schema('canvas')
                .rpc('set_canvas_like', {
                    p_canvas_id: canvasId,
                    p_liked: true,
                    p_organization_id: await ensureOrgId(undefined)
                });

            if (error) throw error;
        },
        onMutate: async () => {
            // Cancel outgoing refetches — shared-canvas is keyed by shareToken not canvasId,
            // so cancel all queries with the prefix
            await queryClient.cancelQueries({ queryKey: ['shared-canvas'] });
            await queryClient.cancelQueries({ queryKey: ['canvas-like', canvasId] });

            // Snapshot previous values
            const previousLiked = queryClient.getQueryData(['canvas-like', canvasId]);

            // Find the shared-canvas cache entry (keyed by shareToken) and snapshot it
            const sharedCanvasQueries = queryClient.getQueriesData<{ like_count: number; id: string }>({ queryKey: ['shared-canvas'] });
            const previousCanvasEntries = sharedCanvasQueries;

            // Optimistically update
            queryClient.setQueryData(['canvas-like', canvasId], true);
            sharedCanvasQueries.forEach(([queryKey, data]) => {
                if (data?.id) {
                    queryClient.setQueryData(queryKey, { ...data, like_count: (data.like_count || 0) + 1 });
                }
            });

            return { previousCanvasEntries, previousLiked };
        },
        onError: (err, variables, context) => {
            // Rollback on error
            if (context) {
                context.previousCanvasEntries.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
                queryClient.setQueryData(['canvas-like', canvasId], context.previousLiked);
            }
            toast({
                title: 'Error',
                description: 'Failed to like canvas',
                variant: 'destructive'
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shared-canvas'] });
        }
    });

    // Unlike mutation
    const unlikeMutation = useMutation({
        mutationFn: async () => {
            // Delete means archive: the door archives the caller's like
            // (deleted_at); the like_count trigger counts live likes only.
            const { error } = await supabase
                .schema('canvas')
                .rpc('set_canvas_like', { p_canvas_id: canvasId, p_liked: false });

            if (error) throw error;
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['shared-canvas'] });
            await queryClient.cancelQueries({ queryKey: ['canvas-like', canvasId] });

            const previousLiked = queryClient.getQueryData(['canvas-like', canvasId]);

            const sharedCanvasQueries = queryClient.getQueriesData<{ like_count: number; id: string }>({ queryKey: ['shared-canvas'] });
            const previousCanvasEntries = sharedCanvasQueries;

            queryClient.setQueryData(['canvas-like', canvasId], false);
            sharedCanvasQueries.forEach(([queryKey, data]) => {
                if (data?.id) {
                    queryClient.setQueryData(queryKey, { ...data, like_count: Math.max((data.like_count || 0) - 1, 0) });
                }
            });

            return { previousCanvasEntries, previousLiked };
        },
        onError: (err, variables, context) => {
            if (context) {
                context.previousCanvasEntries.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
                queryClient.setQueryData(['canvas-like', canvasId], context.previousLiked);
            }
            toast({
                title: 'Error',
                description: 'Failed to unlike canvas',
                variant: 'destructive'
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['shared-canvas'] });
        }
    });

    const toggleLike = async () => {
        requireUserId();
        if (hasLiked) {
            unlikeMutation.mutate();
        } else {
            likeMutation.mutate();
        }
    };

    return {
        hasLiked,
        toggleLike,
        isLoading: likeMutation.isPending || unlikeMutation.isPending
    };
}

