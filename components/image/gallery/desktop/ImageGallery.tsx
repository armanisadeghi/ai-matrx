"use client";
import React, { useRef, useCallback, useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { DesktopImageCard } from "@/components/image/shared/DesktopImageCard";
import { SimpleImageViewer } from "@/components/image/gallery/desktop/SimpleImageViewer";
import { SearchBar } from "@/components/image/shared/SearchBar";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Grid, Grid3X3 } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { mimeToExtension } from "@/utils/file-operations/utils";

export interface SimplePhoto {
  id: string;
  url: string;
  description: string;
}

export function ImageGallery({ imageUrls = [] }: { imageUrls?: string[] }) {
  const [photos, setPhotos] = useState<SimplePhoto[]>([]);
  const [filteredPhotos, setFilteredPhotos] = useState<SimplePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<SimplePhoto | null>(null);
  const [favorites, setFavorites] = useState<SimplePhoto[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "natural">("grid");

  const { toast } = useToast();

  const observer = useRef<IntersectionObserver | null>(null);
  const photosPerPage = 12;
  const [visiblePhotos, setVisiblePhotos] = useState<SimplePhoto[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);

  // Initialize photos from imageUrls
  useEffect(() => {
    const formattedPhotos = imageUrls.map((url, index) => ({
      id: `img-${index}`,
      url,
      description: `Image ${index + 1}`,
    }));

    setPhotos(formattedPhotos);
    setFilteredPhotos(formattedPhotos);
    setVisiblePhotos(formattedPhotos.slice(0, photosPerPage));
    setHasMore(formattedPhotos.length > photosPerPage);
  }, [imageUrls]);

  const loadMore = useCallback(() => {
    if (loading) return;

    setLoading(true);
    setTimeout(() => {
      const nextPage = page + 1;
      const nextPhotos = filteredPhotos.slice(0, nextPage * photosPerPage);

      setVisiblePhotos(nextPhotos);
      setPage(nextPage);
      setHasMore(nextPhotos.length < filteredPhotos.length);
      setLoading(false);
    }, 500); // Simulated loading delay
  }, [filteredPhotos, loading, page]);

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

  const handlePhotoClick = (photo: SimplePhoto) => {
    setSelectedPhoto(photo);
  };

  const closePhotoView = () => {
    setSelectedPhoto(null);
  };

  const toggleFavorite = (photo: SimplePhoto) => {
    const isFavorite = favorites.some((fav) => fav.id === photo.id);

    if (isFavorite) {
      setFavorites(favorites.filter((fav) => fav.id !== photo.id));
      toast({
        title: "Removed from favorites",
        description: "The image has been removed from your favorites.",
      });
    } else {
      setFavorites([...favorites, photo]);
      toast({
        title: "Added to favorites",
        description: "The image has been added to your favorites.",
      });
    }
  };

  const downloadImage = async (photo: SimplePhoto) => {
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = mimeToExtension(blob.type || "image/jpeg");
      a.download = `image-${photo.id}${ext}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Download started",
        description: "Your image is being downloaded.",
      });
    } catch (err) {
      console.error("Failed to download: ", err);
      toast({
        title: "Download failed",
        description: "There was an issue downloading the image.",
        variant: "destructive",
      });
    }
  };

  const handleShare = async (photo: SimplePhoto) => {
    try {
      if ("share" in navigator) {
        await navigator.share({
          title: photo.description || "Shared image",
          text: `Check out this image!`,
          url: photo.url,
        });
      } else if (
        "clipboard" in
        (navigator as {
          clipboard: { writeText: (text: string) => Promise<void> };
        })
      ) {
        await (
          navigator as {
            clipboard: { writeText: (text: string) => Promise<void> };
          }
        ).clipboard.writeText(photo.url);
        toast({
          title: "Link copied",
          description: "The image link has been copied to your clipboard.",
        });
      } else {
        throw new Error("Sharing or clipboard not supported");
      }
    } catch (err) {
      console.error("Failed to share or copy: ", err);
      toast({
        title: "Copy/Share failed",
        description: "There was an issue sharing or copying the link.",
        variant: "destructive",
      });
    }
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setLoading(true);

    setTimeout(() => {
      if (!query.trim()) {
        setFilteredPhotos(photos);
        setVisiblePhotos(photos.slice(0, photosPerPage));
        setHasMore(photos.length > photosPerPage);
      } else {
        // Simple filtering by description
        const filtered = photos.filter((photo) =>
          photo.description.toLowerCase().includes(query.toLowerCase()),
        );
        setFilteredPhotos(filtered);
        setVisiblePhotos(filtered.slice(0, photosPerPage));
        setHasMore(filtered.length > photosPerPage);
      }

      setPage(1);
      setLoading(false);
    }, 300);
  };

  return (
    <div className="container mx-auto p-4 space-y-8">
      <h1 className="text-4xl font-bold text-foreground mb-6">Image Gallery</h1>
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
        <SearchBar
          onSearch={handleSearchChange}
          loading={loading}
          placeholder="Search images..."
          defaultValue={searchQuery}
          className="max-w-3xl w-full"
          debounceTime={300}
          showClearButton={true}
          autoFocus={false}
        />

        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) =>
            value && setViewMode(value as "grid" | "natural")
          }
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

      <div
        className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 ${viewMode === "natural" ? "items-start" : ""}`}
      >
        {visiblePhotos.map((photo, index) => (
          <div
            key={photo.id}
            ref={
              index === visiblePhotos.length - 1
                ? lastPhotoElementRef
                : undefined
            }
          >
            <DesktopImageCard
              photo={{
                id: photo.id,
                urls: { regular: photo.url, thumb: photo.url },
                alt_description: photo.description,
                user: { name: "Gallery" },
              }}
              onClick={() => handlePhotoClick(photo)}
              viewMode={viewMode}
            />
          </div>
        ))}
      </div>
      {loading && (
        <div className="flex justify-center items-center h-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <AnimatePresence>
        {selectedPhoto && (
          <SimpleImageViewer
            photos={visiblePhotos}
            initialIndex={visiblePhotos.findIndex(
              (photo) => photo.id === selectedPhoto.id,
            )}
            onClose={closePhotoView}
            onDownload={downloadImage}
            onFavorite={toggleFavorite}
            onShare={handleShare}
            isFavorite={(photo) => favorites.some((fav) => fav.id === photo.id)}
            onRelatedPhotoClick={handlePhotoClick}
            loadMorePhotos={loadMore}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
