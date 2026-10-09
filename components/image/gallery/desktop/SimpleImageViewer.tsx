import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { wrap } from "popmotion";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  X,
  Download,
  Heart,
  Share2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Check,
} from "lucide-react";

const variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
  }),
};

const swipeConfidenceThreshold = 10000;
const swipePower = (offset: number, velocity: number) =>
  Math.abs(offset) * velocity;

interface SimplePhoto {
  id: string;
  url: string;
  description: string;
}

interface SimpleImageViewerProps {
  photos: SimplePhoto[];
  initialIndex: number;
  onClose: () => void;
  onDownload: (photo: SimplePhoto) => void;
  onFavorite: (photo: SimplePhoto) => void;
  onShare: (photo: SimplePhoto) => void;
  isFavorite: (photo: SimplePhoto) => boolean;
  onRelatedPhotoClick: (photo: SimplePhoto) => void;
  loadMorePhotos: () => void;
}

export function SimpleImageViewer({
  photos,
  initialIndex,
  onClose,
  onDownload,
  onFavorite,
  onShare,
  isFavorite,
  onRelatedPhotoClick,
  loadMorePhotos,
}: SimpleImageViewerProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [[page, direction], setPage] = useState([initialIndex, 0]);
  const [buffer, setBuffer] = useState<string[]>([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [imageDimensions, setImageDimensions] = useState<{
    [key: string]: { width: number; height: number };
  }>({});
  const [isSharing, setIsSharing] = useState(false);
  const preloadCount = 5; // Number of images to preload in each direction
  const imageIndex = wrap(0, photos.length, page);
  const containerRef = useRef<HTMLDivElement>(null);

  const preloadImages = useCallback(
    async (currentPage: number) => {
      // Create an array of indices to preload centered around current image
      const offsets: number[] = [];
      for (let i = -preloadCount; i <= preloadCount; i++) {
        offsets.push(i);
      }

      const imagesToLoad = offsets
        .map((offset) => {
          const idx = wrap(0, photos.length, currentPage + offset);
          return photos[idx]?.url;
        })
        .filter(Boolean);

      const loadedImages = await Promise.all(
        imagesToLoad.map(
          (src) =>
            new Promise<string>((resolve) => {
              const img = new Image();
              img.src = src;
              img.onload = () => {
                // Store image dimensions
                setImageDimensions((prev) => ({
                  ...prev,
                  [src]: { width: img.width, height: img.height },
                }));
                resolve(src);
              };
              img.onerror = () => resolve(src); // Resolve even on error to prevent blocking
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

  const paginate = (newDirection: number) => {
    setPage([page + newDirection, newDirection]);
    if (page + newDirection >= photos.length - preloadCount) {
      loadMorePhotos();
    }
  };

  const handleShare = async (photo: SimplePhoto) => {
    if (!(await copyText(photo.url))) return;
    setIsSharing(true);
    setTimeout(() => setIsSharing(false), 2000);
  };

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
    setScale(1); // Reset zoom when toggling full screen
  };

  const handleZoom = (zoomIn: boolean) => {
    setScale((prevScale) => {
      const newScale = zoomIn ? prevScale * 1.2 : prevScale / 1.2;
      return Math.min(Math.max(newScale, 0.5), 3); // Limit scale between 0.5 and 3
    });
  };

  // Calculate the optimal dimensions for displaying the image
  const calculateImageDimensions = (imageUrl: string) => {
    const dims = imageDimensions[imageUrl];

    if (!dims || !containerRef.current) return {};

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const containerRatio = containerWidth / containerHeight;
    const imageRatio = dims.width / dims.height;

    // Determine if image should be constrained by width or height
    if (imageRatio > containerRatio) {
      // Image is wider relative to container
      return {
        width: containerWidth,
        height: containerWidth / imageRatio,
        objectFit: "contain" as const,
      };
    } else {
      // Image is taller relative to container
      return {
        width: containerHeight * imageRatio,
        height: containerHeight,
        objectFit: "contain" as const,
      };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={`fixed inset-0 ${isFullScreen ? "bg-black" : "bg-black/50 backdrop-blur-md"} flex items-center justify-center z-50`}
      onClick={onClose}
    >
      <motion.div
        ref={containerRef}
        className={`relative bg-transparent rounded-lg overflow-hidden shadow-xl ${
          isFullScreen ? "w-full h-full" : "max-w-4xl w-full max-h-[90dvh]"
        } flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
      >
        <div className="relative flex-grow overflow-hidden bg-black/20">
          {/* Fixed height container to prevent layout shifts */}
          <div
            className={`${isFullScreen ? "h-dvh" : "h-[60dvh]"} w-full relative`}
          >
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={page}
                className="absolute inset-0 flex items-center justify-center"
                custom={direction}
                variants={variants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 },
                }}
                drag={isFullScreen ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={1}
                onDragEnd={(e, { offset, velocity }) => {
                  const swipe = swipePower(offset.x, velocity.x);
                  if (swipe < -swipeConfidenceThreshold) {
                    paginate(1);
                  } else if (swipe > swipeConfidenceThreshold) {
                    paginate(-1);
                  }
                }}
              >
                {/* Image container with fixed position */}
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    src={photos[imageIndex]?.url}
                    alt={photos[imageIndex]?.description}
                    className="max-w-full max-h-full object-contain"
                    style={{
                      scale,
                      ...calculateImageDimensions(photos[imageIndex]?.url),
                    }}
                  />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <Button
            icon={<X />} aria-label="Close"
            className="absolute top-2 right-2 z-10"
            variant="quiet"
            onClick={onClose}
          />
          <Button
            className="absolute top-2 right-10 z-10"
            variant="quiet"
            icon={isFullScreen ? <Minimize2 /> : <Maximize2 />}
            aria-label={isFullScreen ? "Exit full screen" : "Full screen"}
            onClick={toggleFullScreen}
          />
          {isFullScreen && (
            <>
              <Button
                icon={<ZoomIn />} aria-label="Zoom in"
                className="absolute bottom-2 right-10 z-10"
                variant="quiet"
                onClick={() => handleZoom(true)}
              />
              <Button
                icon={<ZoomOut />} aria-label="Zoom out"
                className="absolute bottom-2 right-2 z-10"
                variant="quiet"
                onClick={() => handleZoom(false)}
              />
            </>
          )}
        </div>
        <Button
          icon={<ChevronLeft />} aria-label="Previous"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 transition-opacity"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            paginate(-1);
          }}
        />
        <Button
          icon={<ChevronRight />} aria-label="Next"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 transition-opacity"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            paginate(1);
          }}
        />
        {!isFullScreen && (
          <>
            <div className="p-4 bg-card/80 backdrop-blur-sm text-card-foreground">
              <h3 className="text-lg font-semibold">Image {imageIndex + 1}</h3>
              <p className="text-sm text-muted-foreground mb-2">
                {photos[imageIndex]?.description}
              </p>
              <div className="flex space-x-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      icon={<Download />} aria-label="Download"
                      variant="outline"
                      onClick={() => onDownload(photos[imageIndex])}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      icon={<Heart
                        className={`h-4 w-4 ${isFavorite(photos[imageIndex]) ? "fill-current text-red-500" : ""}`}
                      />} aria-label="Favorite"
                      variant="outline"
                      onClick={() => onFavorite(photos[imageIndex])}
                    />
                  </TooltipTrigger>
                  <TooltipContent>Favorite</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      icon={isSharing ? (
                        <Check className="text-green-500" />
                      ) : (
                        <Share2 />
                      )} aria-label={isSharing ? "Copied!" : "Copy Link"}
                      variant="outline"
                      onClick={() => handleShare(photos[imageIndex])}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {isSharing ? "Copied!" : "Copy Link"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
            <div className="p-4 bg-card/80 backdrop-blur-sm">
              <h4 className="text-md font-semibold mb-2">All Images</h4>
              <div
                className="flex space-x-2 overflow-x-auto pb-2 relative"
                id="thumbnailContainer"
              >
                {photos.map((photo, index) => (
                  <img
                    key={photo.id}
                    id={`thumbnail-${index}`}
                    ref={
                      index === imageIndex
                        ? (el) => {
                            // Auto-scroll to keep current thumbnail centered/visible
                            if (el) {
                              setTimeout(() => {
                                const container =
                                  document.getElementById("thumbnailContainer");
                                if (container) {
                                  const containerWidth = container.offsetWidth;
                                  const thumbPosition = el.offsetLeft;
                                  const thumbWidth = el.offsetWidth;

                                  // Center the thumbnail
                                  container.scrollLeft =
                                    thumbPosition -
                                    containerWidth / 2 +
                                    thumbWidth / 2;
                                }
                              }, 10);
                            }
                          }
                        : null
                    }
                    src={photo.url}
                    alt={photo.description}
                    className={`w-20 h-20 object-cover rounded cursor-pointer ${
                      index === imageIndex ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => {
                      setPage([index, index > imageIndex ? 1 : -1]);
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
