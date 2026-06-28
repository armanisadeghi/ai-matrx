import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/utils/supabase/client';
import { requireUserId } from '@/utils/auth/getUserId';
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
            const userId = requireUserId();
            

            const { error } = await supabase
                .schema('canvas').from('canvas_likes')
                .insert({
                    canvas_id: canvasId,
                    user_id: userId
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
            const sharedCanvasQueries = queryClient.getQueriesData<{ like_count: number; share_token: string }>({ queryKey: ['shared-canvas'] });
            const previousCanvasEntries = sharedCanvasQueries;

            // Optimistically update
            queryClient.setQueryData(['canvas-like', canvasId], true);
            sharedCanvasQueries.forEach(([queryKey, data]) => {
                if (data?.share_token) {
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
            const userId = requireUserId();
            

            const { error } = await supabase
                .schema('canvas').from('canvas_likes')
                .delete()
                .eq('canvas_id', canvasId)
                .eq('user_id', userId);

            if (error) throw error;
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['shared-canvas'] });
            await queryClient.cancelQueries({ queryKey: ['canvas-like', canvasId] });

            const previousLiked = queryClient.getQueryData(['canvas-like', canvasId]);

            const sharedCanvasQueries = queryClient.getQueriesData<{ like_count: number; share_token: string }>({ queryKey: ['shared-canvas'] });
            const previousCanvasEntries = sharedCanvasQueries;

            queryClient.setQueryData(['canvas-like', canvasId], false);
            sharedCanvasQueries.forEach(([queryKey, data]) => {
                if (data?.share_token) {
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
        const userId = requireUserId();
        
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

