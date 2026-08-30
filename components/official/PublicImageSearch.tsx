"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Loader2,
  Search,
  X,
  Check,
  Grid3X3,
  Grid,
  ImagePlus,
  Image as ImageIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import IconButton from "@/components/official/IconButton";
import { Badge } from "@/components/ui/badge";

/**
 * Search Unsplash via our own server route (`app/api/unsplash/route.ts`).
 * Avoids exposing `NEXT_PUBLIC_UNSPLASH_ACCESS_KEY` on the client and keeps
 * a single rate-limit pool keyed by the server-only `UNSPLASH_ACCESS_KEY`.
 */
async function searchUnsplashPhotos(
  query: string,
  page: number,
  perPage: number,
): Promise<{ results: Photo[]; error: string | null }> {
  try {
    const params = new URLSearchParams({
      action: "searchPhotos",
      query,
      page: String(page),
      perPage: String(perPage),
    });
    const res = await fetch(`/api/unsplash?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      return { results: [], error: `Unsplash request failed (${res.status})` };
    }
    const payload: unknown = await res.json();
    if (
      payload &&
      typeof payload === "object" &&
      "type" in payload &&
      (payload as { type?: string }).type === "success" &&
      "response" in payload
    ) {
      const response = (payload as { response?: { results?: Photo[] } })
        .response;
      return { results: response?.results ?? [], error: null };
    }
    return {
      results: [],
      error: "Unsplash returned an unexpected payload shape.",
    };
  } catch (err) {
    return {
      results: [],
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

// Photo interface
interface Photo {
  id: string;
  alt_description?: string;
  description?: string;
  links: {
    html: string;
  };
  user: {
    name: string;
  };
  urls: {
    regular: string;
    thumb: string;
    full?: string;
    raw?: string;
  };
}

export interface PublicImageSearchProps {
  /** Initial URL value (optional) */
  initialValue?: string;
  /** Initial search query (optional) */
  initialSearch?: string;
  /** Whether to allow multiple image selection */
  multiSelect?: boolean;
  /** Callback when image URLs are selected */
  onSelect: (urls: string | string[]) => void;
  /** Placeholder text for the URL input */
  placeholder?: string;
  /** Additional class names for the container */
  className?: string;
  /** Additional styles for the input */
  inputClassName?: string;
  /** Additional styles for the search button */
  buttonClassName?: string;
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Compact mode shows only the icon button */
  compact?: boolean;
  /** Show image preview next to the input */
  showPreview?: boolean;
  /** Preview image size in pixels */
  previewSize?: number;
}

/**
 * PublicImageSearch component
 *
 * A reusable component for searching and selecting Unsplash images.
 * The component provides an input field for direct URL entry and a search button
 * that opens a modal with Unsplash image search functionality.
 */
export function PublicImageSearch({
  initialValue = "",
  initialSearch = "ai",
  multiSelect = false,
  onSelect,
  placeholder = "Enter image URL or search for images",
  className,
  inputClassName,
  buttonClassName,
  disabled = false,
  compact = false,
  showPreview = false,
  previewSize = 40,
}: PublicImageSearchProps) {
  // State for the component
  const [inputValue, setInputValue] = useState(initialValue);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "natural">("grid");
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState("");

  // Refs and hooks
  const { toast } = useToast();
  const observer = useRef<IntersectionObserver | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Check if we have an image
  const hasImage = inputValue.trim().length > 0;

  // For multi-select, create an array of URLs from the comma-separated string
  const selectedUrls =
    multiSelect && inputValue
      ? inputValue
          .split(",")
          .map((url) => url.trim())
          .filter((url) => url)
      : [];

  // Search photos via our server route — never call Unsplash directly from the client.
  const searchPhotos = useCallback(
    async (query: string, pageNum: number) => {
      if (!query.trim()) return;

      setLoading(true);
      try {
        const { results, error } = await searchUnsplashPhotos(
          query,
          pageNum,
          15,
        );
        if (error) {
          console.error("Unsplash search failed:", error);
          toast({
            title: "Search failed",
            description: error ?? "Unable to fetch images. Please try again.",
            variant: "destructive",
          });
          return;
        }
        if (pageNum === 1) {
          setPhotos(results);
        } else {
          setPhotos((prev) => [...prev, ...results]);
        }
        setHasMore(results.length > 0);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        console.error("Error searching photos:", errorMessage);
        toast({
          title: "Search Error",
          description: "Failed to search for images. Please try again later.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  // Handle search query change
  const handleSearch = (query: string) => {
    // Don't search if query is empty
    if (!query.trim()) {
      toast({
        title: "Empty Search",
        description: "Please enter a search term",
        variant: "default",
      });
      return;
    }

    setSearchQuery(query);
    setPage(1);
    setPhotos([]);
    searchPhotos(query, 1);
  };

  // Load more photos when scrolling
  const loadMore = useCallback(() => {
    if (!loading && hasMore && searchQuery) {
      setPage((prevPage) => prevPage + 1);
      searchPhotos(searchQuery, page + 1);
    }
  }, [loading, hasMore, searchQuery, page, searchPhotos]);

  // Set up intersection observer for infinite scrolling
  const lastPhotoElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore();
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, hasMore, loadMore],
  );

  // Handle photo selection
  const handlePhotoSelect = (photo: Photo) => {
    if (multiSelect) {
      setSelectedPhotos((prev) => {
        const isSelected = prev.some((p) => p.id === photo.id);
        if (isSelected) {
          return prev.filter((p) => p.id !== photo.id);
        } else {
          return [...prev, photo];
        }
      });
    } else {
      // For single selection, immediately apply and close
      const imageUrl = photo.urls.full || photo.urls.regular;
      setInputValue(imageUrl);
      onSelect(imageUrl);
      setIsDialogOpen(false);
    }
  };

  // Apply selection and close dialog
  const applySelection = () => {
    if (selectedPhotos.length > 0) {
      const urls = selectedPhotos.map(
        (photo) => photo.urls.full || photo.urls.regular,
      );
      if (urls.length === 1) {
        setInputValue(urls[0]);
        onSelect(urls[0]);
      } else {
        // For multiple selection, join URLs with commas
        const joinedUrls = urls.join(",");
        setInputValue(joinedUrls);
        onSelect(urls);
      }
      setIsDialogOpen(false);
    }
  };

  // Reset selection
  const resetSelection = () => {
    setSelectedPhotos([]);
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    // Call onSelect with the new value to keep parent components updated
    if (multiSelect && e.target.value.includes(",")) {
      const urls = e.target.value
        .split(",")
        .map((url) => url.trim())
        .filter((url) => url);
      onSelect(urls);
    } else {
      onSelect(e.target.value);
    }
  };

  // Clear input
  const handleClearInput = () => {
    setInputValue("");
    onSelect(multiSelect ? [] : "");
  };

  // Open preview dialog
  const handlePreviewClick = (url: string) => {
    setPreviewImageUrl(url);
    setPreviewDialogOpen(true);
  };

  // Remove a selected image in multi-select mode
  const handleRemoveImage = (urlToRemove: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation();
    }

    // Update selectedPhotos state
    setSelectedPhotos((prev) =>
      prev.filter((photo) => {
        const photoUrl = photo.urls.full || photo.urls.regular;
        return photoUrl !== urlToRemove;
      }),
    );

    // Update input value
    const updatedUrls = selectedUrls.filter((url) => url !== urlToRemove);
    const joinedUrls = updatedUrls.join(",");
    setInputValue(joinedUrls);

    // Call onSelect with updated URLs
    onSelect(updatedUrls);
  };

  // Initial search when dialog opens
  useEffect(() => {
    if (isDialogOpen && searchQuery) {
      searchPhotos(searchQuery, 1);
    }
  }, [isDialogOpen, searchQuery, searchPhotos]);

  // Focus search input when dialog opens
  useEffect(() => {
    if (isDialogOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isDialogOpen]);

  // Reset selected photos when dialog closes
  useEffect(() => {
    if (!isDialogOpen) {
      setSelectedPhotos([]);
    }
  }, [isDialogOpen]);

  // Compact mode that only shows an icon button
  if (compact) {
    return (
      <div className={cn("relative", className)}>
        <div className="relative">
          <IconButton
            icon={hasImage ? ImageIcon : ImagePlus}
            onClick={() => setIsDialogOpen(true)}
            variant={hasImage ? "default" : "outline"}
            tooltip={
              hasImage
                ? multiSelect && selectedUrls.length > 1
                  ? `${selectedUrls.length} images selected`
                  : "Image selected"
                : "Search for images"
            }
            className={cn(
              buttonClassName,
              hasImage && "bg-primary text-primary-foreground",
            )}
            disabled={disabled}
          />

          {/* Success indicators */}
          {hasImage && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1.5 -right-1.5"
            >
              {multiSelect && selectedUrls.length > 1 ? (
                <Badge className="h-5 w-5 p-0 flex items-center justify-center rounded-full bg-secondary text-secondary-foreground text-xs">
                  {selectedUrls.length}
                </Badge>
              ) : (
                <div className="h-4 w-4 rounded-full bg-green-500 flex items-center justify-center p-0.5">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {isDialogOpen && (
            <SearchDialog
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              photos={photos}
              selectedPhotos={selectedPhotos}
              loading={loading}
              viewMode={viewMode}
              setViewMode={setViewMode}
              handleSearch={handleSearch}
              handlePhotoSelect={handlePhotoSelect}
              lastPhotoElementRef={lastPhotoElementRef}
              searchInputRef={searchInputRef}
              multiSelect={multiSelect}
              resetSelection={resetSelection}
              applySelection={applySelection}
              setIsDialogOpen={setIsDialogOpen}
            />
          )}
        </AnimatePresence>

        <ImagePreviewDialog
          isOpen={previewDialogOpen}
          setIsOpen={setPreviewDialogOpen}
          imageUrl={previewImageUrl}
        />
      </div>
    );
  }

  // Standard mode with input and optional preview
  return (
    <div className={cn("relative w-full", className)}>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-lg",
          showPreview && hasImage && "border border-dashed border-border",
        )}
      >
        {/* Preview thumbnail if enabled and we have an image */}
        {showPreview && hasImage && !multiSelect && (
          <div className="w-full flex justify-center p-2">
            <div
              className="rounded-md overflow-hidden cursor-pointer bg-muted relative w-[150px] h-[100px]"
              onClick={() => handlePreviewClick(inputValue)}
            >
              <img
                src={inputValue}
                alt="Preview"
                className="absolute inset-0 h-full w-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMyA4QzMgOC41NTIyOCAzLjQ0NzcyIDkgNCA5SDIwQzIwLjU1MjMgOSAyMSA4LjU1MjI4IDIxIDhDMjEgNy40NDc3MiAyMC41NTIzIDcgMjAgN0g0QzMuNDQ3NzIgNyAzIDcuNDQ3NzIgMyA4WiIgZmlsbD0iY3VycmVudENvbG9yIi8+PHBhdGggZD0iTTMgMTZDMyAxNi41NTIzIDMuNDQ3NzIgMTcgNCAxN0gyMEMyMC41NTIzIDE3IDIxIDE2LjU1MjMgMjEgMTZDMjEgMTUuNDQ3NyAyMC41NTIzIDE1IDIwIDE1SDRDMy40NDc3MiAxNSAzIDE1LjQ0NzcgMyAxNloiIGZpbGw9ImN1cnJlbnRDb2xvciIvPjwvc3ZnPg==";
                }}
              />
            </div>
          </div>
        )}

        {/* Multiple image preview badges */}
        {showPreview && multiSelect && selectedUrls.length > 0 && (
          <div className="w-full p-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-muted">
              {selectedUrls.map((url, index) => (
                <div
                  key={index}
                  className="h-14 w-20 shrink-0 rounded-md overflow-hidden cursor-pointer border border-border bg-muted relative group"
                  onClick={() => handlePreviewClick(url)}
                >
                  <img
                    src={url}
                    alt={`Preview ${index + 1}`}
                    className="absolute inset-0 h-full w-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMyA4QzMgOC41NTIyOCAzLjQ0NzcyIDkgNCA5SDIwQzIwLjU1MjMgOSAyMSA4LjU1MjI4IDIxIDhDMjEgNy40NDc3MiAyMC41NTIzIDcgMjAgN0g0QzMuNDQ3NzIgNyAzIDcuNDQ3NzIgMyA4WiIgZmlsbD0iY3VycmVudENvbG9yIi8+PHBhdGggZD0iTTMgMTZDMyAxNi41NTIzIDMuNDQ3NzIgMTcgNCAxN0gyMEMyMC41NTIzIDE3IDIxIDE2LjU1MjMgMjEgMTZDMjEgMTUuNDQ3NyAyMC41NTIzIDE1IDIwIDE1SDRDMy40NDc3MiAxNSAzIDE1LjQ0NzcgMyAxNloiIGZpbGw9ImN1cnJlbnRDb2xvciIvPjwvc3ZnPg==";
                    }}
                  />
                  <div className="absolute top-0 right-0 bg-black/50 text-white text-xs px-1 rounded-bl">
                    {index + 1}
                  </div>
                  <button
                    className="absolute top-1 right-1 h-4 w-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleRemoveImage(url, e)}
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-center gap-1 p-2 pt-0">
          <div className="relative max-w-[180px]">
            <Input
              value={inputValue}
              onChange={handleInputChange}
              placeholder={placeholder}
              className={cn("pr-7 h-8 text-xs w-full", inputClassName)}
              disabled={disabled}
            />
            {inputValue && (
              <button
                type="button"
                onClick={handleClearInput}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                disabled={disabled}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <IconButton
            icon={ImagePlus}
            onClick={() => setIsDialogOpen(true)}
            variant="outline"
            tooltip="Search public images"
            className={cn("h-8 w-8 min-w-[32px]", buttonClassName)}
            size="sm"
            disabled={disabled}
          />
        </div>
      </div>

      <AnimatePresence>
        {isDialogOpen && (
          <SearchDialog
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            photos={photos}
            selectedPhotos={selectedPhotos}
            loading={loading}
            viewMode={viewMode}
            setViewMode={setViewMode}
            handleSearch={handleSearch}
            handlePhotoSelect={handlePhotoSelect}
            lastPhotoElementRef={lastPhotoElementRef}
            searchInputRef={searchInputRef}
            multiSelect={multiSelect}
            resetSelection={resetSelection}
            applySelection={applySelection}
            setIsDialogOpen={setIsDialogOpen}
          />
        )}
      </AnimatePresence>

      <ImagePreviewDialog
        isOpen={previewDialogOpen}
        setIsOpen={setPreviewDialogOpen}
        imageUrl={previewImageUrl}
      />
    </div>
  );
}

// Extracted SearchDialog component to reduce duplication
interface SearchDialogProps {
  searchQuery: string;
  setSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  photos: Photo[];
  selectedPhotos: Photo[];
  loading: boolean;
  viewMode: "grid" | "natural";
  setViewMode: React.Dispatch<React.SetStateAction<"grid" | "natural">>;
  handleSearch: (query: string) => void;
  handlePhotoSelect: (photo: Photo) => void;
  lastPhotoElementRef: (node: HTMLDivElement | null) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  multiSelect: boolean;
  resetSelection: () => void;
  applySelection: () => void;
  setIsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function SearchDialog({
  searchQuery,
  setSearchQuery,
  photos,
  selectedPhotos,
  loading,
  viewMode,
  setViewMode,
  handleSearch,
  handlePhotoSelect,
  lastPhotoElementRef,
  searchInputRef,
  multiSelect,
  resetSelection,
  applySelection,
  setIsDialogOpen,
}: SearchDialogProps) {
  return (
    <Dialog open={true} onOpenChange={setIsDialogOpen}>
      <DialogContent className="max-w-5xl w-full h-[80dvh] flex flex-col p-0">
        <DialogHeader className="px-4 py-2 border-b border-border">
          <DialogTitle>Search Public Images</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-full overflow-hidden">
          {/* Search and view mode controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b border-border">
            <div className="relative w-full max-w-3xl">
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" && handleSearch(searchQuery)
                }
                placeholder="Search for images..."
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => handleSearch(searchQuery)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(value) =>
                value && setViewMode(value as "grid" | "natural")
              }
              className="mt-2 sm:mt-0"
            >
              <ToggleGroupItem value="grid" aria-label="Grid view">
                <Grid3X3 className="h-4 w-4" />
                <span className="hidden sm:inline">Grid</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="natural" aria-label="Natural view">
                <Grid className="h-4 w-4" />
                <span className="hidden sm:inline">Natural</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Image gallery */}
          <div className="flex-1 overflow-y-auto p-4">
            {photos.length === 0 && !loading ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <ImagePlus className="h-12 w-12 text-gray-400 dark:text-gray-600 mb-4" />
                <h3 className="text-lg font-medium text-gray-700 dark:text-gray-300">
                  No images found
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mt-2">
                  {searchQuery
                    ? "Try a different search term"
                    : "Start by searching for images above"}
                </p>
              </div>
            ) : (
              <div
                className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 ${viewMode === "natural" ? "items-start" : ""}`}
              >
                {photos.map((photo, index) => (
                  <div
                    key={photo.id}
                    ref={
                      index === photos.length - 1
                        ? lastPhotoElementRef
                        : undefined
                    }
                    onClick={() => handlePhotoSelect(photo)}
                    className={cn(
                      "relative cursor-pointer rounded-lg overflow-hidden group border-2 border-transparent",
                      selectedPhotos.some((p) => p.id === photo.id) &&
                        "border-primary ring-2 ring-primary/20",
                      "hover:border-primary/70 hover:ring-2 hover:ring-primary/10 transition-all",
                    )}
                  >
                    <img
                      src={photo.urls.regular}
                      alt={
                        photo.alt_description ||
                        photo.description ||
                        `Photo by ${photo.user.name}`
                      }
                      className={cn(
                        "w-full object-cover",
                        viewMode === "grid" ? "h-48" : "max-h-[300px]",
                      )}
                    />

                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <p className="text-white text-sm font-medium text-center p-2 line-clamp-2">
                        {photo.alt_description ||
                          photo.description ||
                          `Photo by ${photo.user.name}`}
                      </p>
                    </div>

                    {selectedPhotos.some((p) => p.id === photo.id) && (
                      <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                        <Check className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {loading && (
              <div className="flex justify-center items-center h-24">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
          </div>

          {/* Action buttons */}
          {multiSelect && (
            <div className="p-4 border-t border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {selectedPhotos.length} image
                  {selectedPhotos.length !== 1 ? "s" : ""} selected
                </span>
                {selectedPhotos.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={resetSelection}>
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={applySelection}
                  disabled={selectedPhotos.length === 0}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Image preview dialog that shows the full-sized image
interface ImagePreviewDialogProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  imageUrl: string;
}

function ImagePreviewDialog({
  isOpen,
  setIsOpen,
  imageUrl,
}: ImagePreviewDialogProps) {
  if (!imageUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-5xl w-full max-h-[90dvh] flex flex-col p-4">
        <DialogHeader>
          <DialogTitle className="sr-only">Image Preview</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex items-center justify-center">
          <img
            src={imageUrl}
            alt="Preview"
            className="max-w-full max-h-[70dvh] object-contain"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setIsOpen(false)}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
