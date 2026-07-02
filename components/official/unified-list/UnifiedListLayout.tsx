"use client";

import { useState, useTransition, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UnifiedActionBar } from "./UnifiedActionBar";
import { UnifiedFilterModal } from "./UnifiedFilterModal";
import { 
    BaseListItem,
    UnifiedListLayoutProps,
    RenderCardActions,
    DeleteConfirmationState
} from "./types";
import {
    applySearchFilter,
    applyCustomFilters,
    applySorting,
    hasActiveFilters as checkActiveFilters,
    initializeFilterValues,
    filterByFolder
} from "./utils";

/**
 * UnifiedListLayout
 * 
 * A comprehensive, reusable layout component for list/grid pages that handles:
 * - Search with voice input
 * - Dynamic filtering and sorting
 * - Mobile-first responsive design
 * - Navigation state management
 * - Delete confirmations
 * - Loading and error states
 * - Hierarchical data (folders)
 * 
 * Preserves all features from the prompts implementation while adding flexibility.
 */
export function UnifiedListLayout<T extends BaseListItem>({
    config,
    items,
    renderCard,
    isLoading = false,
    error,
    onRetry,
    headerContent,
}: UnifiedListLayoutProps<T>) {
    const router = useRouter();
    const isMobile = useIsMobile();
    const [isPending, startTransition] = useTransition();

    // ========================================================================
    // STATE MANAGEMENT
    // ========================================================================

    // Search and filter state
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState(
        config.filters?.defaultSort || config.filters?.sortOptions[0]?.value || ""
    );
    const [filterValues, setFilterValues] = useState<Record<string, unknown>>(
        config.filters?.customFilters
            ? initializeFilterValues(config.filters.customFilters)
            : {}
    );

    // UI state
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [activeActionModal, setActiveActionModal] = useState<string | null>(null);

    // Navigation state
    const [navigatingId, setNavigatingId] = useState<string | null>(null);
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [duplicatingIds, setDuplicatingIds] = useState<Set<string>>(new Set());

    // Delete confirmation
    const [deleteConfirmation, setDeleteConfirmation] = useState<DeleteConfirmationState>({
        isOpen: false,
        itemId: null,
        itemName: null,
    });

    // Hierarchy state (if enabled)
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

    // ========================================================================
    // FILTERING AND SORTING
    // ========================================================================

    const filteredAndSortedItems = useMemo(() => {
        let result = [...items];

        // Apply hierarchy filter if enabled
        if (config.hierarchy?.enabled) {
            result = filterByFolder(result, currentFolderId);
        }

        // Apply search filter
        if (config.search.enabled && searchTerm) {
            result = applySearchFilter(result, searchTerm, config.search.filterFn);
        }

        // Apply custom filters
        if (config.filters?.customFilters && config.filters.customFilters.length > 0) {
            result = applyCustomFilters(result, config.filters.customFilters, filterValues);
        }

        // Apply sorting
        if (config.filters?.sortOptions && config.filters.sortOptions.length > 0) {
            result = applySorting(result, config.filters.sortOptions, sortBy);
        }

        return result;
    }, [items, searchTerm, filterValues, sortBy, currentFolderId, config]);

    // Check if filters are active
    const hasActiveFilters = useMemo(() => {
        if (!config.filters) return false;

        const filtersActive = config.filters.customFilters
            ? checkActiveFilters(
                  config.filters.customFilters,
                  filterValues,
                  sortBy,
                  config.filters.defaultSort
              )
            : sortBy !== (config.filters.defaultSort || config.filters.sortOptions[0]?.value);

        return searchTerm !== "" || filtersActive;
    }, [searchTerm, sortBy, filterValues, config.filters]);

    // ========================================================================
    // ACTION HANDLERS
    // ========================================================================

    const handleNavigate = useCallback((id: string, path: string) => {
        // Prevent navigation if already navigating
        if (navigatingId) return;

        setNavigatingId(id);
        startTransition(() => {
            router.push(path);
        });
    }, [navigatingId, router]);

    const handleDeleteClick = useCallback((id: string, name: string) => {
        setDeleteConfirmation({
            isOpen: true,
            itemId: id,
            itemName: name,
        });
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!deleteConfirmation.itemId || !config.itemActions?.onDelete) return;

        const itemId = deleteConfirmation.itemId;
        setDeletingIds(prev => new Set(prev).add(itemId));

        try {
            await config.itemActions.onDelete(itemId);
            router.refresh();
        } catch (error) {
            console.error("Error deleting item:", error);
            setDeletingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(itemId);
                return newSet;
            });
        } finally {
            setDeleteConfirmation({ isOpen: false, itemId: null, itemName: null });
        }
    }, [deleteConfirmation, config.itemActions, router]);

    const handleCancelDelete = useCallback(() => {
        setDeleteConfirmation({ isOpen: false, itemId: null, itemName: null });
    }, []);

    const handleDuplicate = useCallback(async (id: string) => {
        if (!config.itemActions?.onDuplicate) return;

        setDuplicatingIds(prev => new Set(prev).add(id));

        try {
            await config.itemActions.onDuplicate(id);
            router.refresh();
        } catch (error) {
            console.error("Error duplicating item:", error);
        } finally {
            setDuplicatingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
            });
        }
    }, [config.itemActions, router]);

    // ========================================================================
    // RENDER CARD WITH ACTIONS
    // ========================================================================

    const renderCardWithActions = useCallback((item: T) => {
        const actions: RenderCardActions<T> = {
            onView: () => {
                if (config.itemActions?.onView && !navigatingId) {
                    const path = typeof config.itemActions.onView === 'function' 
                        ? config.itemActions.onView(item.id)
                        : config.itemActions.onView;
                    if (typeof path === 'string') {
                        handleNavigate(item.id, path);
                    }
                }
            },
            onEdit: () => {
                if (config.itemActions?.onEdit && !navigatingId) {
                    const path = typeof config.itemActions.onEdit === 'function' 
                        ? config.itemActions.onEdit(item.id)
                        : config.itemActions.onEdit;
                    if (typeof path === 'string') {
                        handleNavigate(item.id, path);
                    }
                }
            },
            onDelete: () => {
                if (config.itemActions?.onDelete) {
                    handleDeleteClick(item.id, item.name);
                }
            },
            onDuplicate: () => {
                if (config.itemActions?.onDuplicate) {
                    handleDuplicate(item.id);
                }
            },
            onShare: config.itemActions?.onShare
                ? () => config.itemActions?.onShare?.(item.id)
                : undefined,
            customActions: config.itemActions?.customActions
                ? config.itemActions.customActions.map(action => ({
                      id: action.id,
                      onClick: () => action.onClick(item),
                      disabled: action.disabled ? action.disabled(item) : false,
                  }))
                : [],
            isNavigating: navigatingId === item.id,
            isAnyNavigating: navigatingId !== null,
            isDeleting: deletingIds.has(item.id),
            isDuplicating: duplicatingIds.has(item.id),
        };

        return renderCard(item, actions);
    }, [
        config.itemActions,
        navigatingId,
        deletingIds,
        duplicatingIds,
        renderCard,
        handleNavigate,
        handleDeleteClick,
        handleDuplicate,
    ]);

    // ========================================================================
    // RENDER METHODS
    // ========================================================================

    // Loading state
    if (isLoading && config.advanced?.loadingComponent) {
        const LoadingComponent = config.advanced.loadingComponent;
        return <LoadingComponent />;
    }

    // Error state
    if (error && config.advanced?.errorComponent) {
        const ErrorComponent = config.advanced.errorComponent;
        return <ErrorComponent error={error} onRetry={onRetry} />;
    }

    // Empty state (no items at all)
    if (items.length === 0) {
        if (config.advanced?.emptyComponent) {
            const EmptyComponent = config.advanced.emptyComponent;
            return (
                <>
                    <EmptyComponent onCreate={config.page.emptyAction?.onClick} />
                    
                    {/* Mobile Floating Action Bar (still show for creation) */}
                    <UnifiedActionBar
                        mode={isMobile ? "mobile" : "desktop"}
                        config={config}
                        searchValue={searchTerm}
                        onSearchChange={setSearchTerm}
                        onFilterClick={() => setIsFilterModalOpen(true)}
                        showFilterBadge={hasActiveFilters}
                    />

                    {/* Filter Modal */}
                    {config.filters && (
                        <UnifiedFilterModal
                            isOpen={isFilterModalOpen}
                            onClose={() => setIsFilterModalOpen(false)}
                            config={config}
                            items={items}
                            filterValues={filterValues}
                            onFilterValuesChange={setFilterValues}
                            sortBy={sortBy}
                            onSortChange={setSortBy}
                        />
                    )}
                </>
            );
        }

        return (
            <>
                <div className="text-center py-12 pb-24">
                    <p className="text-muted-foreground">
                        {config.page.emptyMessage || "No items found. Create your first item to get started!"}
                    </p>
                    {config.page.emptyAction && (
                        <button
                            onClick={config.page.emptyAction.onClick}
                            className="mt-4 text-primary hover:underline"
                        >
                            {config.page.emptyAction.label}
                        </button>
                    )}
                </div>

                {/* Mobile Floating Action Bar */}
                <UnifiedActionBar
                    mode={isMobile ? "mobile" : "desktop"}
                    config={config}
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    onFilterClick={() => setIsFilterModalOpen(true)}
                    showFilterBadge={hasActiveFilters}
                />

                {/* Filter Modal */}
                {config.filters && (
                    <UnifiedFilterModal
                        isOpen={isFilterModalOpen}
                        onClose={() => setIsFilterModalOpen(false)}
                        config={config}
                        items={items}
                        filterValues={filterValues}
                        onFilterValuesChange={setFilterValues}
                        sortBy={sortBy}
                        onSortChange={setSortBy}
                    />
                )}
            </>
        );
    }

    // ========================================================================
    // MAIN RENDER
    // ========================================================================

    return (
        <>
            {/* Desktop Action Bar (search, filter, actions) */}
            {!isMobile && (
                <UnifiedActionBar
                    mode="desktop"
                    config={config}
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    onFilterClick={() => setIsFilterModalOpen(true)}
                    showFilterBadge={hasActiveFilters}
                />
            )}

            {/* Header Content (custom) */}
            {headerContent}

            {/* Items Grid */}
            {filteredAndSortedItems.length === 0 ? (
                <div className="text-center py-12 pb-24">
                    <p className="text-muted-foreground">
                        No items match your filters. Try adjusting your search or filters.
                    </p>
                </div>
            ) : (
                <div
                    className={cn(
                        "grid",
                        config.layout.gridCols,
                        config.layout.gap,
                        isMobile && "pb-24",
                        config.layout.containerClass
                    )}
                >
                    {filteredAndSortedItems.map(item => (
                        <div key={item.id}>
                            {renderCardWithActions(item)}
                        </div>
                    ))}
                </div>
            )}

            {/* Mobile Floating Action Bar */}
            <UnifiedActionBar
                mode={isMobile ? "mobile" : "desktop"}
                config={config}
                searchValue={searchTerm}
                onSearchChange={setSearchTerm}
                onFilterClick={() => setIsFilterModalOpen(true)}
                showFilterBadge={hasActiveFilters}
            />

            {/* Filter Modal */}
            {config.filters && (
                <UnifiedFilterModal
                    isOpen={isFilterModalOpen}
                    onClose={() => setIsFilterModalOpen(false)}
                    config={config}
                    items={items}
                    filterValues={filterValues}
                    onFilterValuesChange={setFilterValues}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                />
            )}

            {/* Delete Confirmation Dialog */}
            {config.itemActions?.onDelete && (
                <AlertDialog
                    open={deleteConfirmation.isOpen}
                    onOpenChange={(open) => {
                        if (!open) handleCancelDelete();
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-destructive">
                                {config.itemActions.deleteConfirmation?.title || "Delete Item"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {config.itemActions.deleteConfirmation?.message
                                    ? config.itemActions.deleteConfirmation.message(
                                          deleteConfirmation.itemName || ""
                                      )
                                    : `Are you sure you want to delete "${deleteConfirmation.itemName}"? This action cannot be undone.`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={handleCancelDelete}>
                                {config.itemActions.deleteConfirmation?.cancelLabel || "Cancel"}
                            </AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleConfirmDelete}
                                className="bg-destructive hover:bg-destructive/90"
                            >
                                {config.itemActions.deleteConfirmation?.confirmLabel || "Delete"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </>
    );
}

