import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { wrap } from "popmotion";
import { Button } from "@/components/ui/button";
import { X, Download, Heart, Share2, Check } from "lucide-react";

interface SimplePhoto {
  id: string;
  url: string;
  description: string;
}

interface MobileImageViewerProps {
  photos: SimplePhoto[];
  initialIndex: number;
  onClose: () => void;
  onDownload: (photo: SimplePhoto) => void;
  onFavorite: (photo: SimplePhoto) => void;
  onShare: (photo: SimplePhoto) => void;
  isFavorite: (photo: SimplePhoto) => boolean;
}

export function MobileImageViewer({
  photos,
  initialIndex,
  onClose,
  onDownload,
  onFavorite,
  onShare,
  isFavorite,
}: MobileImageViewerProps) {
  const [[page, direction], setPage] = useState([initialIndex, 0]);
  const [buffer, setBuffer] = useState<string[]>([]);
  const [isSharing, setIsSharing] = useState(false);
  const [startX, setStartX] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const preloadCount = 3; // Fewer preloaded images for mobile
  const imageIndex = wrap(0, photos.length, page);
  const viewerRef = useRef<HTMLDivElement>(null);

  // Preload images centered around current image
  const preloadImages = useCallback(
    async (currentPage: number) => {
      const imagesToLoad: (string | undefined)[] = [];
      for (let i = -preloadCount; i <= preloadCount; i++) {
        const idx = wrap(0, photos.length, currentPage + i);
        imagesToLoad.push(photos[idx]?.url);
      }

      const loadedImages = await Promise.all(
        imagesToLoad
          .filter((src): src is string => Boolean(src))
          .map(
            (src) =>
              new Promise<string>((resolve) => {
                const img = new Image();
                img.src = src;
                img.onload = () => resolve(src);
                img.onerror = () => resolve(src);
              }),
          ),
      );
      setBuffer(loadedImages);
    },
    [photos],
  );

  useEffect(() => {
    preloadImages(page);
  }, [page, photos, preloadImages]);

  // Navigate to next/previous image
  const paginate = (newDirection: number) => {
    setPage([page + newDirection, newDirection]);
  };

  // Handle share with clipboard
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(photos[imageIndex]?.url);
      setIsSharing(true);
      setTimeout(() => setIsSharing(false), 2000);
      onShare(photos[imageIndex]);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  // Touch handlers for swiping
  const handleTouchStart = (e: React.TouchEvent) => {
    setStartX(e.touches[0].clientX);
    setSwiped(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!startX) return;

    const currentX = e.touches[0].clientX;
    const diff = startX - currentX;
    const threshold = 50; // Minimum distance to register a swipe

    if (Math.abs(diff) > threshold) {
      setSwiped(true);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!swiped) return;

    const currentX = e.changedTouches[0].clientX;
    const diff = startX - currentX;

    if (diff > 0) {
      // Swiped left, go to next
      paginate(1);
    } else {
      // Swiped right, go to previous
      paginate(-1);
    }

    setStartX(0);
    setSwiped(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black flex flex-col z-50"
      ref={viewerRef}
    >
      {/* Full-screen image container with touch handlers */}
      <div
        className="flex-grow w-full relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={page}
            custom={direction}
            initial={{ opacity: 0, x: direction > 0 ? 300 : -300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction < 0 ? 300 : -300 }}
            transition={{
              opacity: { duration: 0.2 },
              x: { type: "spring", stiffness: 300, damping: 30 },
            }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <img
              src={
                buffer[Math.floor(preloadCount / 2)] || photos[imageIndex]?.url
              }
              alt={photos[imageIndex]?.description}
              className="w-full h-full object-contain"
            />
          </motion.div>
        </AnimatePresence>

        {/* Close button - repositioned to top right */}
        <Button
          className="absolute top-safe right-4 z-10 rounded-full w-12 h-12 p-0 bg-black/50 text-white backdrop-blur-sm border border-white/20 shadow-md"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Bottom control bar */}
      <div className="bg-black text-white p-4 pt-2">
        <p className="text-center mb-3 text-sm text-neutral-300">
          {imageIndex + 1} / {photos.length}
        </p>

        <div className="flex justify-around">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-12 w-12"
            onClick={() => onDownload(photos[imageIndex])}
          >
            <Download className="h-6 w-6" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-12 w-12"
            onClick={() => onFavorite(photos[imageIndex])}
          >
            <Heart
              className={`h-6 w-6 ${isFavorite(photos[imageIndex]) ? "fill-current text-red-500" : ""}`}
            />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-12 w-12"
            onClick={handleShare}
          >
            {isSharing ? (
              <Check className="h-6 w-6 text-green-500" />
            ) : (
              <Share2 className="h-6 w-6" />
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
