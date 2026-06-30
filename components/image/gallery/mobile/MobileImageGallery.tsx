"use client";
import React, { useRef, useCallback, useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { MobileImageCard } from "@/components/image/shared/MobileImageCard";
import { MobileImageViewer } from "@/components/image/gallery/mobile/MobileImageViewer";
import { SearchBar } from "@/components/image/shared/SearchBar";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";
import { mimeToExtension } from "@/utils/file-operations/utils";

export interface SimplePhoto {
  id: string;
  url: string;
  description: string;
}

export function MobileImageGallery({
  imageUrls = [],
}: {
  imageUrls?: string[];
}) {
  const [photos, setPhotos] = useState<SimplePhoto[]>([]);
  const [filteredPhotos, setFilteredPhotos] = useState<SimplePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<SimplePhoto | null>(null);
  const [favorites, setFavorites] = useState<SimplePhoto[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const observer = useRef<IntersectionObserver | null>(null);
  const photosPerPage = 6; // Fewer photos per page for mobile
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
    }, 300); // Shorter loading delay for mobile
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
      await navigator.clipboard.writeText(photo.url);
      toast({
        title: "Link copied",
        description: "The image link has been copied to your clipboard.",
      });
    } catch (err) {
      console.error("Failed to copy: ", err);
      toast({
        title: "Copy failed",
        description: "There was an issue copying the link.",
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
    <div className="container-fluid p-2 space-y-4">
      <h1 className="text-2xl font-bold text-foreground mb-2">Gallery</h1>
      <SearchBar
        onSearch={handleSearchChange}
        loading={loading}
        placeholder="Search..."
        defaultValue={searchQuery}
        className="w-full"
        debounceTime={300}
        showClearButton={true}
        autoFocus={false}
        buttonClassName="min-w-[70px]"
      />

      <div className="grid grid-cols-2 gap-2">
        {visiblePhotos.map((photo, index) => (
          <div
            key={photo.id}
            ref={
              index === visiblePhotos.length - 1
                ? lastPhotoElementRef
                : undefined
            }
          >
            <MobileImageCard
              photo={photo}
              onClick={() => handlePhotoClick(photo)}
            />
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center items-center h-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      <AnimatePresence>
        {selectedPhoto && (
          <MobileImageViewer
            photos={visiblePhotos}
            initialIndex={visiblePhotos.findIndex(
              (photo) => photo.id === selectedPhoto.id,
            )}
            onClose={closePhotoView}
            onDownload={downloadImage}
            onFavorite={toggleFavorite}
            onShare={handleShare}
            isFavorite={(photo) => favorites.some((fav) => fav.id === photo.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
