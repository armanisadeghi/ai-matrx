"use client";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";

import React, { useEffect, useState } from "react";
import { useCanvasItems } from "@/features/canvas/hooks/useCanvasItems";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openCanvas } from "@/features/canvas/redux/canvasSlice";
import {
  Star,
  Archive,
  Trash2,
  Share2,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { CanvasItemRow } from "@/features/canvas/services/canvasItemsService";

interface SavedCanvasItemsProps {
  showArchived?: boolean;
}

/**
 * SavedCanvasItems - Management UI for saved canvas items
 * 
 * Features:
 * - List all saved items with search and filters
 * - Rename, favorite, archive, delete items
 * - Open items in canvas
 * - Share items
 * - Batch operations
 */
export function SavedCanvasItems({ showArchived = false }: SavedCanvasItemsProps) {
  const dispatch = useAppDispatch();
  const {
    items,
    isLoading,
    load,
    update,
    remove,
    toggleFavorite,
    toggleArchive,
    share,
    updateFilters,
  } = useCanvasItems({ is_archived: showArchived });

  const [searchQuery, setSearchQuery] = useState("");
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
      is_archived: showArchived,
      search: query || undefined,
      type: typeFilter !== "all" ? typeFilter : undefined,
    });
  };

  const handleTypeFilter = (type: string) => {
    setTypeFilter(type);
    updateFilters({
      is_archived: showArchived,
      search: searchQuery || undefined,
      type: type !== "all" ? type : undefined,
    });
  };

  const handleOpenInCanvas = (item: CanvasItemRow) => {
    dispatch(openCanvas(item.content));
  };

  const handleStartEdit = (item: CanvasItemRow) => {
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

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      quiz: "Quiz",
      iframe: "Web View",
      slideshow: "Slideshow",
      recipe: "Recipe",
      diagram: "Diagram",
      flashcards: "Flashcards",
      decision_tree: "Decision Tree",
    };
    return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getTypeBadgeColor = (type: string): string => {
    const colors: Record<string, string> = {
      quiz: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      iframe: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300",
      slideshow: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      recipe: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300",
      diagram: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300",
      flashcards: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300",
    };
    return colors[type] || "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300";
  };

  const uniqueTypes = Array.from(new Set(items.map(item => item.type)));

  if (isLoading && items.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400 dark:text-gray-600" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Search and Filters */}
      <div className="flex-shrink-0 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-600" />
            <Input
              type="text"
              placeholder="Search saved items..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={handleTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {uniqueTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {getTypeLabel(type)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Refresh */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={isLoading}
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </Button>
        </div>

        {/* Stats */}
        <div className="mt-3 flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
          <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
          {typeFilter !== "all" && (
            <Badge variant="secondary">{getTypeLabel(typeFilter)}</Badge>
          )}
        </div>
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Archive className="w-12 h-12 text-gray-300 dark:text-gray-700 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">
              {showArchived ? "No archived items" : "No saved canvas items yet"}
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-600 mt-1">
              {showArchived
                ? "Archive items to see them here"
                : "Create and save canvas items to see them here"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map(item => (
              <div
                key={item.id}
                className="group relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 hover:shadow-md dark:hover:shadow-zinc-950/50 transition-all"
              >
                {/* Type Badge */}
                <Badge className={cn("absolute top-3 right-3", getTypeBadgeColor(item.type))}>
                  {getTypeLabel(item.type)}
                </Badge>

                {/* Title */}
                <div className="pr-20 mb-3">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(item.id);
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                        autoFocus
                        className="h-8 text-sm"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(item.id)}
                        className="h-8 px-2"
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <h3
                      className="font-medium text-gray-900 dark:text-gray-100 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                      onClick={() => handleStartEdit(item)}
                    >
                      {item.title || "Untitled"}
                    </h3>
                  )}
                </div>

                {/* Metadata */}
                <div className="space-y-1 text-xs text-gray-500 dark:text-gray-400 mb-4">
                  <p>
                    Created {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </p>
                  {item.description && (
                    <p className="line-clamp-2">{item.description}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenInCanvas(item)}
                    className="flex-1"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" />
                    Open
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleFavorite(item.id, !item.is_favorited)}
                    className="h-7 w-7 p-0 rounded-full"
                  >
                    <Star
                      className={cn(
                        "w-3.5 h-3.5",
                        item.is_favorited
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-gray-400 dark:text-gray-600"
                      )}
                    />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => share(item.id)}
                    className="h-7 w-7 p-0 rounded-full"
                  >
                    <Share2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleArchive(item.id, !item.is_archived)}
                    className="h-7 w-7 p-0 rounded-full"
                  >
                    <Archive
                      className={cn(
                        "w-3.5 h-3.5",
                        item.is_archived
                          ? "text-orange-500 dark:text-orange-400"
                          : "text-gray-400 dark:text-gray-600"
                      )}
                    />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: "Delete this item?",
                        description:
                          "This removes the saved canvas item permanently.",
                        confirmLabel: "Delete",
                        variant: "destructive",
                      });
                      if (ok) remove(item.id);
                    }}
                    className="h-7 w-7 p-0 rounded-full hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Share indicator */}
                {item.is_public && (
                  <div className="absolute bottom-3 left-3">
                    <Badge variant="secondary" className="text-xs">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Shared
                    </Badge>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

