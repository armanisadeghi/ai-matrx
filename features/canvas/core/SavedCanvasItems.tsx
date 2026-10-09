"use client";
import { UntrustedCount } from "@ai-matrx/design-system";
import { readOf } from "@ai-matrx/design-system";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";

import React, { useEffect, useState } from "react";
import { ReadFailure } from "@ai-matrx/design-system";
import { useCanvasItems } from "@/features/canvas/hooks/useCanvasItems";
import { useOpenCanvasItem } from "@/features/canvas/hooks/useOpenCanvasItem";
import { Archive, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getCanvasTypeLabel } from "@/features/canvas/canvasContent";
import { SavedCanvasItemCard } from "@/features/canvas/core/SavedCanvasItemCard";
import { SavedCanvasItemsGrid } from "@/features/canvas/core/SavedCanvasItemsGrid";
import type { CanvasItemSummary } from "@/features/canvas/services/canvasItemsService";

/**
 * SavedCanvasItems - Management UI for saved canvas items
 *
 * Features:
 * - List all saved items with search and filters
 * - Rename, favorite, archive, delete items
 * - Open items in canvas
 * - Share items
 * - Batch operations
 *
 * THE ARCHIVED-ITEMS LAW (../common-docs/policies/archived-items.md): this
 * panel used to take a `showArchived` prop that its ONE call site
 * (`CanvasRenderer`) hard-coded to `false`, so archived items were impossible
 * to reach from here. The prop is gone. The query now loads both and the
 * "Archived (N)" disclosure below the grid reveals them in one click.
 *
 * The grid is virtualized (`SavedCanvasItemsGrid`) and the list reads card
 * SUMMARIES, never artifact bodies — see that file for the measured cost.
 */

export function SavedCanvasItems() {
  const { openItem } = useOpenCanvasItem();
  const {
    items,
    isLoading,
    loadError,
    isCompleting,
    load,
    update,
    remove,
    toggleFavorite,
    toggleArchive,
    share,
    updateFilters,
  } = useCanvasItems({});

  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

  // Load items on mount
  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    updateFilters({
      search: query || undefined,
      type: typeFilter !== "all" ? typeFilter : undefined,
    });
  };

  const handleTypeFilter = (type: string) => {
    setTypeFilter(type);
    updateFilters({
      search: searchQuery || undefined,
      type: type !== "all" ? type : undefined,
    });
  };

  // Open by POINTER, not by snapshot. This list holds the row id, so there is
  // never a reason to push a copy of its content into the slice — that copy
  // could not be deduped against an item already showing the same artifact,
  // and it drifted the moment the row changed.
  const handleOpenInCanvas = (item: CanvasItemSummary) => {
    void openItem({
      artifactId: item.id,
      type: item.type,
      title: item.title,
    });
  };

  const handleStartEdit = (item: CanvasItemSummary) => {
    setEditingId(item.id);
    setEditingTitle(item.title || "");
  };

  const handleSaveEdit = async (id: string) => {
    if (editingTitle.trim()) {
      await update(id, { title: editingTitle.trim() });
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  // Active is what the surface shows; archived rides one click below it.
  const activeItems = items.filter((item) => !item.is_archived);
  const archivedItems = items.filter((item) => item.is_archived);

  const uniqueTypes = Array.from(new Set(activeItems.map(item => item.type)));

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({
      title: "Delete this item?",
      description: "This removes the saved canvas item permanently.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) remove(id);
  };

  const renderItem = (item: CanvasItemSummary) => (
    <SavedCanvasItemCard
      key={item.id}
      item={item}
      isEditing={editingId === item.id}
      editingTitle={editingTitle}
      onEditingTitleChange={setEditingTitle}
      onStartEdit={() => handleStartEdit(item)}
      onSaveEdit={() => void handleSaveEdit(item.id)}
      onCancelEdit={handleCancelEdit}
      onOpen={() => handleOpenInCanvas(item)}
      onToggleFavorite={() => toggleFavorite(item.id, !item.is_favorited)}
      onShare={() => share(item.id)}
      onToggleArchive={() => toggleArchive(item.id, !item.is_archived)}
      onDelete={() => void handleDelete(item.id)}
    />
  );

  if (isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Search and Filters */}
      <div className="@container/saved-head flex-shrink-0 p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2 @[30rem]/saved-head:gap-3">
          {/* Search */}
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input adornment="start"
              type="text"
              placeholder="Search saved items..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={handleTypeFilter}>
            <SelectTrigger className="w-28 shrink-0 @[30rem]/saved-head:w-40" aria-label="Filter by type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {uniqueTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {getCanvasTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh */}
          <Button
            icon={<RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />}
            variant="outline"
            onClick={() => load()}
            disabled={isLoading}
            aria-label="Refresh"
            className="shrink-0"
          />
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            <UntrustedCount value={activeItems.length} read={readOf({ isLoading: isLoading || isCompleting, error: loadError })} label="Items" /> item
            {activeItems.length !== 1 ? 's' : ''}
          </span>
          {isCompleting && items.length > 0 && (
            <span className="inline-flex items-center gap-1" data-saved-completing="">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Loading team items
            </span>
          )}
          {typeFilter !== "all" && (
            <Badge variant="secondary">{getCanvasTypeLabel(typeFilter)}</Badge>
          )}
        </div>
      </div>

      {/* Items List */}
      {loadError != null && items.length === 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <ReadFailure error={loadError} what="your saved canvas items" onRetry={() => load()} />
        </div>
      ) : activeItems.length === 0 && archivedItems.length === 0 ? (
        <div className="flex flex-1 min-h-0 flex-col items-center justify-center p-4 text-center">
          <Archive className="w-12 h-12 text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">
            No saved canvas items yet
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Create and save canvas items to see them here
          </p>
        </div>
      ) : (
        <SavedCanvasItemsGrid
          className="flex-1"
          activeItems={activeItems}
          archivedItems={archivedItems}
          showArchived={showArchived}
          onShowArchivedChange={setShowArchived}
          renderItem={renderItem}
        />
      )}
    </div>
  );
}

