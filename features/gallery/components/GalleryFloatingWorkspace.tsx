"use client";

/**
 * GalleryFloatingWorkspace — compact image gallery for floating WindowPanel.
 *
 * Features:
 * • Unsplash search with orientation/sort filters
 * • Masonry-style grid optimized for small viewports
 * • Click-to-view opens ImageViewerWindow (multi-window pattern)
 * • Favorites collection persisted in sidebar
 * • Quick topic shortcuts for instant browsing
 * • Download, copy-link, and open-original actions
 * • Footer with result count and view controls
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { mimeToExtension } from "@/utils/file-operations/utils";
import {
  Search,
  Heart,
  Download,
  ExternalLink,
  Link2,
  Loader2,
  ImageIcon,
  Star,
  X,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useUnsplashSearch } from "@/hooks/images/useUnsplashSearch";
import { openImageViewer } from "@/features/window-panels/windows/image/ImageViewerWindow";
import { toast } from "sonner";
import { InlineMediaRef } from "@/features/files";

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "grid" | "masonry" | "compact";
type OrientationFilter = "all" | "landscape" | "portrait" | "squarish";

interface FavoriteImage {
  id: string;
  url: string;
  thumbUrl: string;
  alt: string;
  author: string;
  downloadUrl?: string;
}

const QUICK_TOPICS = [
  "Nature",
  "Architecture",
  "Technology",
  "Abstract",
  "Minimal",
  "Space",
  "Ocean",
  "Mountains",
  "Urban",
  "Texture",
  "Dark",
  "Colorful",
];

const ORIENTATION_OPTIONS: { value: OrientationFilter; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "landscape", label: "Wide" },
  { value: "portrait", label: "Tall" },
  { value: "squarish", label: "Square" },
];

// ─── GalleryFloatingWorkspace ────────────────────────────────────────────────

export function GalleryFloatingWorkspace() {
  const dispatch = useAppDispatch();
  const {
    photos,
    loading,
    hasMore,
    handleSearch,
    loadMore,
    handleRecentPhotos,
    resetSearch,
    query: activeQuery,
  } = useUnsplashSearch();

  const [searchInput, setSearchInput] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("masonry");
  const [orientationFilter, setOrientationFilter] =
    useState<OrientationFilter>("all");
  const [favorites, setFavorites] = useState<FavoriteImage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("gallery-window-favorites");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showTopics, setShowTopics] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Persist favorites
  useEffect(() => {
    try {
      localStorage.setItem(
        "gallery-window-favorites",
        JSON.stringify(favorites),
      );
    } catch {}
  }, [favorites]);

  // Load recent photos on mount
  useEffect(() => {
    if (photos.length === 0 && !loading) {
      handleRecentPhotos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Search ──────────────────────────────────────────────────────────────
  const executeSearch = useCallback(
    (term: string) => {
      const orientation =
        orientationFilter === "all" ? undefined : orientationFilter;
      handleSearch(term, { orientation: orientation as any });
    },
    [handleSearch, orientationFilter],
  );

  const handleSearchSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!searchInput.trim()) return;
      executeSearch(searchInput.trim());
      setShowTopics(false);
    },
    [searchInput, executeSearch],
  );

  const handleTopicClick = useCallback(
    (topic: string) => {
      setSearchInput(topic);
      executeSearch(topic);
      setShowTopics(false);
    },
    [executeSearch],
  );

  const handleReset = useCallback(() => {
    setSearchInput("");
    setOrientationFilter("all");
    resetSearch();
    setShowTopics(false);
  }, [resetSearch]);

  // ── Infinite scroll ─────────────────────────────────────────────────────
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || loading || !hasMore) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      loadMore();
    }
  }, [loading, hasMore, loadMore]);

  // ── Photo actions ───────────────────────────────────────────────────────
  const handleViewPhoto = useCallback(
    (photo: any, index: number) => {
      const urls = photos.map((p: any) => p.urls?.regular || p.urls?.small);
      const alts = photos.map(
        (p: any) =>
          p.alt_description || p.description || `Photo by ${p.user?.name}`,
      );
      openImageViewer(dispatch, {
        images: urls,
        initialIndex: index,
        alts,
        title: activeQuery ? `"${activeQuery}" Results` : "Gallery",
        instanceId: "gallery",
      });
    },
    [dispatch, photos, activeQuery],
  );

  const handleDownload = useCallback(
    async (photo: any, e: React.MouseEvent) => {
      e.stopPropagation();
      const url = photo.urls?.full || photo.urls?.regular;
      if (!url) return;
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        const ext = mimeToExtension(blob.type || "image/jpeg");
        a.download = `unsplash-${photo.id}${ext}`;
        a.click();
        URL.revokeObjectURL(blobUrl);
        toast.success("Download started");
      } catch {
        toast.error("Download failed");
      }
    },
    [],
  );

  const handleCopyLink = useCallback((photo: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = photo.urls?.regular || photo.links?.html;
    if (url) {
      navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  }, []);

  const handleToggleFavorite = useCallback(
    (photo: any, e: React.MouseEvent) => {
      e.stopPropagation();
      setFavorites((prev) => {
        const exists = prev.find((f) => f.id === photo.id);
        if (exists) {
          toast("Removed from favorites");
          return prev.filter((f) => f.id !== photo.id);
        }
        toast.success("Added to favorites");
        return [
          ...prev,
          {
            id: photo.id,
            url: photo.urls?.regular || photo.urls?.small,
            thumbUrl: photo.urls?.thumb || photo.urls?.small,
            alt: photo.alt_description || photo.description || "",
            author: photo.user?.name || "Unknown",
            downloadUrl: photo.urls?.full,
          },
        ];
      });
    },
    [],
  );

  const isFavorited = useCallback(
    (photoId: string) => favorites.some((f) => f.id === photoId),
    [favorites],
  );

  // ── Sidebar ─────────────────────────────────────────────────────────────
  const sidebar = useMemo(
    () => (
      <div className="flex flex-col min-h-0 h-full">
        <div className="px-2 py-1.5 border-b border-border/50">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Favorites
          </span>
          {favorites.length > 0 && (
            <span className="ml-1 text-[10px] text-muted-foreground/60">
              ({favorites.length})
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 p-1 space-y-1 overflow-y-auto scrollbar-thin">
          {favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Heart className="w-5 h-5 text-muted-foreground/30 mb-1.5" />
              <p className="text-[10px] text-muted-foreground/50 leading-tight px-2">
                Click the heart on any image to save it here
              </p>
            </div>
          ) : (
            favorites.map((fav, idx) => (
              <button
                key={fav.id}
                type="button"
                onClick={() => {
                  openImageViewer(dispatch, {
                    images: favorites.map((f) => f.url),
                    initialIndex: idx,
                    alts: favorites.map((f) => f.alt || `By ${f.author}`),
                    title: "Favorites",
                    instanceId: "gallery-favorites",
                  });
                }}
                className="group relative w-full rounded overflow-hidden border border-transparent hover:border-primary/40 transition-all"
              >
                <InlineMediaRef
                  ref={fav.thumbUrl}
                  size="fill"
                  fit="cover"
                  rounded="none"
                  fallback={null}
                  className="w-full aspect-square"
                  alt={fav.alt}
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                  <ImageIcon className="w-3.5 h-3.5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFavorites((prev) => prev.filter((f) => f.id !== fav.id));
                    toast("Removed from favorites");
                  }}
                  className="absolute top-0 right-0 p-0.5 bg-black/50 text-white rounded-bl opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </button>
            ))
          )}
        </div>
      </div>
    ),
    [favorites, dispatch],
  );

  // ── Grid columns based on view mode ─────────────────────────────────────
  const gridClass =
    viewMode === "compact"
      ? "grid grid-cols-4 gap-0.5"
      : viewMode === "grid"
        ? "grid grid-cols-3 gap-1.5"
        : "columns-2 gap-1.5 space-y-1.5 [column-fill:balance]";

  return {
    sidebar,
    body: (
      <div className="flex flex-col h-full min-h-0">
        {/* Search bar */}
        <div className="shrink-0 px-2 py-1.5 border-b border-border bg-muted/10 space-y-1">
          <form
            onSubmit={handleSearchSubmit}
            className="flex items-center gap-1.5"
          >
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search photos..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full h-6 pl-6 pr-2 text-[11px] rounded-md border border-border bg-background focus:ring-1 focus:ring-primary outline-none placeholder:text-muted-foreground/40 transition-all"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/40 hover:text-foreground"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowTopics((v) => !v)}
              title="Quick topics"
              className={cn(
                "h-6 px-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                showTopics && "bg-accent text-foreground",
              )}
            >
              <Star className="w-3 h-3" />
            </button>

            {activeQuery && (
              <button
                type="button"
                onClick={handleReset}
                title="Clear search"
                className="h-6 px-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </form>

          {/* Quick Topics */}
          {showTopics && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {QUICK_TOPICS.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => handleTopicClick(topic)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] rounded-full border transition-colors",
                    activeQuery?.toLowerCase() === topic.toLowerCase()
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {topic}
                </button>
              ))}
            </div>
          )}

          {/* Orientation filter row */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider mr-0.5">
              Orientation
            </span>
            {ORIENTATION_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setOrientationFilter(value);
                  if (activeQuery) {
                    const orientation = value === "all" ? undefined : value;
                    handleSearch(activeQuery, {
                      orientation: orientation as any,
                    });
                  }
                }}
                className={cn(
                  "px-1.5 py-0.5 text-[9px] rounded transition-colors",
                  orientationFilter === value
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Image grid */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-1.5 scrollbar-thin"
        >
          {photos.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <div className="w-10 h-10 rounded-full border border-border bg-muted flex items-center justify-center mb-2">
                <ImageIcon className="w-5 h-5 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-muted-foreground">
                {activeQuery
                  ? "No results found"
                  : "Search for images or browse topics"}
              </p>
            </div>
          ) : (
            <div className={gridClass}>
              {photos.map((photo: any, idx: number) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  index={idx}
                  viewMode={viewMode}
                  isFavorited={isFavorited(photo.id)}
                  onView={() => handleViewPhoto(photo, idx)}
                  onDownload={(e) => handleDownload(photo, e)}
                  onCopyLink={(e) => handleCopyLink(photo, e)}
                  onToggleFavorite={(e) => handleToggleFavorite(photo, e)}
                />
              ))}
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            </div>
          )}
        </div>
      </div>
    ),
  };
}

// ─── PhotoCard ────────────────────────────────────────────────────────────────

interface PhotoCardProps {
  photo: any;
  index: number;
  viewMode: ViewMode;
  isFavorited: boolean;
  onView: () => void;
  onDownload: (e: React.MouseEvent) => void;
  onCopyLink: (e: React.MouseEvent) => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}

function PhotoCard({
  photo,
  index,
  viewMode,
  isFavorited,
  onView,
  onDownload,
  onCopyLink,
  onToggleFavorite,
}: PhotoCardProps) {
  const thumbUrl = photo.urls?.small || photo.urls?.thumb;
  const alt =
    photo.alt_description ||
    photo.description ||
    `Photo by ${photo.user?.name}`;
  const author = photo.user?.name || "Unknown";

  const isCompact = viewMode === "compact";
  const isMasonry = viewMode === "masonry";

  return (
    <div
      className={cn(
        "group relative overflow-hidden cursor-pointer transition-all",
        isCompact ? "rounded-sm" : "rounded-md",
        isMasonry ? "break-inside-avoid mb-0" : "",
      )}
      onClick={onView}
    >
      {/* `block` is set by InlineMediaRef's baseCls, so the
          isMasonry-only `display:block` from the previous <img> is now
          redundant and not propagated. */}
      <InlineMediaRef
        ref={thumbUrl ?? null}
        size="fill"
        fit="cover"
        rounded="none"
        fallback={null}
        className={cn(
          "w-full transition-transform group-hover:scale-[1.02]",
          isCompact ? "aspect-square" : isMasonry ? "w-full" : "aspect-[4/3]",
        )}
        alt={alt}
      />

      {/* Hover overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "flex flex-col justify-end",
          isCompact ? "p-0.5" : "p-1.5",
        )}
      >
        {!isCompact && (
          <p className="text-[9px] text-white/80 truncate leading-tight">
            {author}
          </p>
        )}

        {/* Action buttons */}
        <div
          className={cn(
            "flex items-center gap-0.5 mt-0.5",
            isCompact && "justify-center",
          )}
        >
          <ActionBtn
            onClick={onToggleFavorite}
            title={isFavorited ? "Remove from favorites" : "Add to favorites"}
            active={isFavorited}
          >
            <Heart
              className={cn("w-2.5 h-2.5", isFavorited && "fill-current")}
            />
          </ActionBtn>
          {!isCompact && (
            <>
              <ActionBtn onClick={onDownload} title="Download">
                <Download className="w-2.5 h-2.5" />
              </ActionBtn>
              <ActionBtn onClick={onCopyLink} title="Copy link">
                <Link2 className="w-2.5 h-2.5" />
              </ActionBtn>
              <ActionBtn
                onClick={(e) => {
                  e.stopPropagation();
                  const url = photo.links?.html;
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
                title="Open on Unsplash"
              >
                <ExternalLink className="w-2.5 h-2.5" />
              </ActionBtn>
            </>
          )}
        </div>
      </div>

      {/* Favorite indicator (always visible) */}
      {isFavorited && !isCompact && (
        <div className="absolute top-1 right-1">
          <Heart className="w-3 h-3 text-rose-400 fill-rose-400 drop-shadow" />
        </div>
      )}
    </div>
  );
}

// ─── ActionBtn ────────────────────────────────────────────────────────────────

function ActionBtn({
  onClick,
  title,
  active,
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "p-1 rounded-sm transition-colors",
        active
          ? "bg-rose-500/30 text-rose-300 hover:bg-rose-500/50"
          : "bg-black/30 text-white/70 hover:bg-black/50 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}
