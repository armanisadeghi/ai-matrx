"use client";
import React, { useState, useRef, useEffect } from "react";
import {
  DownloadIcon,
  ClipboardCopyIcon,
  ThumbsUpIcon,
  ThumbsDownIcon,
  CheckIcon,
  ShareIcon,
  Maximize2Icon,
  ZoomInIcon,
  ZoomOutIcon,
  XIcon,
  CopyIcon,
} from "lucide-react";

const MAX_IMAGE_HEIGHT = 700;

interface ImageBlockProps {
  src: string;
  alt?: string;
}

const ImageBlock: React.FC<ImageBlockProps> = ({ src, alt = "Image" }) => {
  const [feedback, setFeedback] = useState<"none" | "like" | "dislike">("none");
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExpandedView, setShowExpandedView] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleDownload = async (e: React.MouseEvent) => {
    e.preventDefault();

    try {
      // Fetch the image first
      const response = await fetch(src);
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = src.split("/").pop() || "image";
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download image:", err);
    }
  };

  const handleCopyUrl = (e: React.MouseEvent) => {
    e.preventDefault();
    navigator.clipboard
      .writeText(src)
      .then(() => {
        setShowCopySuccess(true);
        setTimeout(() => setShowCopySuccess(false), 2000);
      })
      .catch((err) => {
        console.error("Failed to copy URL:", err);
      });
  };

  const handleCopyImage = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(src);
      const blob = await response.blob();

      // Copy the image to clipboard
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
          }),
        ]);
        setShowCopySuccess(true);
        setTimeout(() => setShowCopySuccess(false), 2000);
      } else {
        console.error("Clipboard API not supported");
      }
    } catch (err) {
      console.error("Failed to copy image to clipboard:", err);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Shared Image",
          url: src,
        });
      } catch (err) {
        console.error("Failed to share:", err);
      }
    } else {
      setShowShareModal(true);
    }
  };

  const handleFeedback = (type: "like" | "dislike") => {
    setFeedback(type);
    // Here you could send the feedback to your backend
    console.log(`User ${type}d this image`);
  };

  const openInNewTab = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleExpand = () => {
    setShowExpandedView(true);
    setZoomLevel(1);
  };

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleCloseExpanded = () => {
    setShowExpandedView(false);
    setZoomLevel(1);
  };

  useEffect(() => {
    if (!showExpandedView) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseExpanded();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showExpandedView]);

  return (
    <div className="relative my-4 rounded-3xl group max-w-[900px]">
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        onDoubleClick={handleExpand}
        className="w-full h-auto rounded-3xl object-contain cursor-zoom-in"
        style={{ maxHeight: MAX_IMAGE_HEIGHT }}
      />

      {/* Action buttons - visible on group hover */}
      <div className="absolute top-4 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={handleDownload}
          className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
          title="Download"
        >
          <DownloadIcon className="w-4 h-4" />
        </button>
        <button
          onClick={handleCopyUrl}
          className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
          title="Copy URL"
        >
          <ClipboardCopyIcon className="w-4 h-4" />
        </button>
        <button
          onClick={handleCopyImage}
          className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
          title="Copy Image"
        >
          <CopyIcon className="w-4 h-4" />
        </button>
        <button
          onClick={handleShare}
          className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
          title="Share"
        >
          <ShareIcon className="w-4 h-4" />
        </button>
        <button
          onClick={handleExpand}
          className="text-white bg-black/40 hover:bg-black/60 p-2 rounded-full transition-all duration-200"
          title="Expand"
        >
          <Maximize2Icon className="w-4 h-4" />
        </button>
      </div>

      {/* Feedback section - now on bottom left */}
      <div className="absolute bottom-2 left-2 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={() => handleFeedback("like")}
          className={`p-2 rounded-full transition-all duration-200 ${
            feedback === "like"
              ? "bg-green-500 text-white"
              : "text-white bg-black/40 hover:bg-black/60"
          }`}
          title="Like"
        >
          <ThumbsUpIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => handleFeedback("dislike")}
          className={`p-2 rounded-full transition-all duration-200 ${
            feedback === "dislike"
              ? "bg-red-500 text-white"
              : "text-white bg-black/40 hover:bg-black/60"
          }`}
          title="Dislike"
        >
          <ThumbsDownIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Share modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-white p-6 rounded-lg max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Share this image</h3>
            <div className="flex flex-wrap gap-4 mb-4">
              <button
                onClick={() =>
                  openInNewTab(
                    `https://twitter.com/intent/tweet?url=${encodeURIComponent(src)}`,
                  )
                }
                className="bg-blue-400 text-white px-4 py-2 rounded hover:bg-blue-500"
              >
                Twitter
              </button>
              <button
                onClick={() =>
                  openInNewTab(
                    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(src)}`,
                  )
                }
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Facebook
              </button>
              <button
                onClick={() =>
                  openInNewTab(
                    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(src)}`,
                  )
                }
                className="bg-blue-800 text-white px-4 py-2 rounded hover:bg-blue-900"
              >
                LinkedIn
              </button>
            </div>
            <div className="flex justify-between items-center mt-4">
              <input
                type="text"
                value={src}
                readOnly
                className="flex-1 border p-2 rounded mr-2"
              />
              <button
                onClick={handleCopyUrl}
                className="bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
              >
                {showCopySuccess ? "Copied!" : "Copy"}
              </button>
            </div>
            <button
              onClick={() => setShowShareModal(false)}
              className="mt-4 w-full bg-gray-200 px-4 py-2 rounded hover:bg-gray-300"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Expanded view modal — z-[9999] to sit above header/avatar */}
      {showExpandedView && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
          onClick={handleCloseExpanded}
        >
          <img
            src={src}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={handleCloseExpanded}
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: "center center",
            }}
            className="h-[94dvh] w-[96vw] object-contain transition-transform duration-200 cursor-zoom-out"
          />

          {/* Top-center close button — avoids sidebar (left) and avatar (right) */}
          <button
            onClick={handleCloseExpanded}
            className="fixed top-3 left-1/2 -translate-x-1/2 z-[10000] text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-full transition-all duration-200 flex items-center gap-1.5 text-xs"
            title="Close (Esc)"
          >
            <XIcon className="w-4 h-4" />
            <span>Close</span>
          </button>

          {/* Bottom controls: zoom + close */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 bg-black/70 backdrop-blur-sm px-5 py-2.5 rounded-full">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleZoomOut();
              }}
              className="text-white hover:text-gray-300 p-1.5"
              title="Zoom Out"
            >
              <ZoomOutIcon className="w-5 h-5" />
            </button>
            <span className="text-white text-sm font-medium min-w-[3rem] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleZoomIn();
              }}
              className="text-white hover:text-gray-300 p-1.5"
              title="Zoom In"
            >
              <ZoomInIcon className="w-5 h-5" />
            </button>
            <div className="w-px h-5 bg-white/20" />
            <button
              onClick={handleCloseExpanded}
              className="text-white/70 hover:text-white p-1.5"
              title="Close (Esc)"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Copy success toast notification */}
      {showCopySuccess && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg">
          Copied to clipboard!
        </div>
      )}
    </div>
  );
};

export default ImageBlock;
