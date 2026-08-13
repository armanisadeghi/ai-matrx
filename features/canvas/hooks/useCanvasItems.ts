import { useState, useCallback } from 'react';
import {
  canvasItemsService,
  type CanvasItemRow,
  type CreateCanvasItemInput,
  type UpdateCanvasItemInput,
  type CanvasItemFilters,
} from '@/features/canvas/services/canvasItemsService';
import { toast } from "@/lib/toast";

/**
 * useCanvasItems - Hook for managing canvas items with database persistence
 * 
 * Provides a complete API for CRUD operations on canvas items with
 * automatic loading states, error handling, and optimistic updates.
 * 
 * @example
 * ```tsx
 * const { items, save, remove, toggleFavorite, isLoading } = useCanvasItems();
 * 
 * const handleSave = async () => {
 *   const { data, isDuplicate } = await save({ content: canvasContent });
 *   if (isDuplicate) {
 *     toast.info('This item was already saved!');
 *   }
 * };
 * ```
 */
export function useCanvasItems(initialFilters?: CanvasItemFilters) {
  const [items, setItems] = useState<CanvasItemRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [filters, setFilters] = useState<CanvasItemFilters>(initialFilters || {});

  /**
   * Load items from database
   */
  const load = useCallback(async (customFilters?: CanvasItemFilters) => {
    setIsLoading(true);
    setError(null);

    const activeFilters = customFilters || filters;
    const { data, error: loadError } = await canvasItemsService.list(activeFilters);

    if (loadError) {
      setError(loadError);
      toast.error('Failed to load canvas items');
    } else if (data) {
      setItems(data);
    }

    setIsLoading(false);
    return { data, error: loadError };
  }, [filters]);

  /**
   * Save new canvas item with deduplication
   */
  const save = useCallback(async (input: CreateCanvasItemInput) => {
    setIsLoading(true);
    setError(null);

    const { data, isDuplicate, error: saveError } = await canvasItemsService.save(input);

    if (saveError) {
      setError(saveError);
      toast.error('Failed to save canvas item');
    } else if (data) {
      if (isDuplicate) {
        // Update existing item in local state
        setItems(prev => prev.map(item => item.id === data.id ? data : item));
        toast.info('Item already saved - updated timestamp');
      } else {
        // Add new item to local state
        setItems(prev => [data, ...prev]);
        toast.success('Canvas item saved!');
      }
    }

    setIsLoading(false);
    return { data, isDuplicate, error: saveError };
  }, []);

  /**
   * Update existing canvas item
   */
  const update = useCallback(async (id: string, input: UpdateCanvasItemInput) => {
    setIsLoading(true);
    setError(null);

    const { data, error: updateError } = await canvasItemsService.update(id, input);

    if (updateError) {
      setError(updateError);
      toast.error('Failed to update canvas item');
    } else if (data) {
      setItems(prev => prev.map(item => item.id === data.id ? data : item));
      toast.success('Canvas item updated!');
    }

    setIsLoading(false);
    return { data, error: updateError };
  }, []);

  /**
   * Delete canvas item
   */
  const remove = useCallback(async (id: string) => {
    // Optimistic update
    setItems(prev => prev.filter(item => item.id !== id));
    
    const { error: deleteError } = await canvasItemsService.delete(id);

    if (deleteError) {
      setError(deleteError);
      toast.error('Failed to delete canvas item');
      // Revert optimistic update by reloading
      load();
    } else {
      toast.success('Canvas item deleted');
    }

    return { error: deleteError };
  }, [load]);

  /**
   * Toggle favorite status
   */
  const toggleFavorite = useCallback(async (id: string, isFavorited: boolean) => {
    // Optimistic update
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, is_favorited: isFavorited } : item
    ));

    const { data, error: toggleError } = await canvasItemsService.toggleFavorite(id, isFavorited);

    if (toggleError) {
      setError(toggleError);
      toast.error('Failed to update favorite status');
      // Revert optimistic update
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, is_favorited: !isFavorited } : item
      ));
    }

    return { data, error: toggleError };
  }, []);

  /**
   * Toggle archive status
   */
  const toggleArchive = useCallback(async (id: string, isArchived: boolean) => {
    // Optimistic update
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, is_archived: isArchived } : item
    ));

    const { data, error: toggleError } = await canvasItemsService.toggleArchive(id, isArchived);

    if (toggleError) {
      setError(toggleError);
      toast.error('Failed to update archive status');
      // Revert optimistic update
      setItems(prev => prev.map(item => 
        item.id === id ? { ...item, is_archived: !isArchived } : item
      ));
    } else {
      toast.success(isArchived ? 'Item archived' : 'Item unarchived');
    }

    return { data, error: toggleError };
  }, []);

  /**
   * Share canvas item
   */
  const share = useCallback(async (id: string) => {
    // Canonical share-link lane (platform.share_links) — canvas_item is
    // link-shareable in the registry; the old bespoke canvas_items.share_token
    // mint was cut 2026-08-12 (it produced URLs that 404'd).
    const { createShareLink } = await import('@/utils/permissions/shareLinks');
    const result = await createShareLink({
      resourceType: 'canvas_item',
      resourceId: id,
    });

    if (!result.success || !result.url) {
      setError(result.error ?? 'Failed to share canvas item');
      toast.error('Failed to share canvas item');
      return { shareUrl: null, error: result.error ?? 'Failed to share' };
    }

    await navigator.clipboard.writeText(result.url);
    toast.success('Share link copied to clipboard!');
    return { shareUrl: result.url, error: null };
  }, []);

  /**
   * Batch delete items
   */
  const batchDelete = useCallback(async (ids: string[]) => {
    // Optimistic update
    setItems(prev => prev.filter(item => !ids.includes(item.id)));

    const { error: deleteError } = await canvasItemsService.batchDelete(ids);

    if (deleteError) {
      setError(deleteError);
      toast.error('Failed to delete items');
      load(); // Revert
    } else {
      toast.success(`Deleted ${ids.length} item(s)`);
    }

    return { error: deleteError };
  }, [load]);

  /**
   * Batch archive items
   */
  const batchArchive = useCallback(async (ids: string[], isArchived: boolean) => {
    // Optimistic update
    setItems(prev => prev.map(item => 
      ids.includes(item.id) ? { ...item, is_archived: isArchived } : item
    ));

    const { error: archiveError } = await canvasItemsService.batchArchive(ids, isArchived);

    if (archiveError) {
      setError(archiveError);
      toast.error('Failed to update items');
      load(); // Revert
    } else {
      toast.success(
        isArchived 
          ? `Archived ${ids.length} item(s)` 
          : `Unarchived ${ids.length} item(s)`
      );
    }

    return { error: archiveError };
  }, [load]);

  /**
   * Update filters and reload
   */
  const updateFilters = useCallback((newFilters: CanvasItemFilters) => {
    setFilters(newFilters);
    load(newFilters);
  }, [load]);

  return {
    // State
    items,
    isLoading,
    error,
    filters,
    
    // Actions
    load,
    save,
    update,
    remove,
    toggleFavorite,
    toggleArchive,
    share,
    batchDelete,
    batchArchive,
    updateFilters,
  };
}

