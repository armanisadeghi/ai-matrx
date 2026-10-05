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
  PencilIcon,
} from "lucide-react";
import {
  useMediaBlob,
  useMediaLoadRecovery,
  useMediaResolution,
} from "@ai-matrx/media/core";
import { fileSourceToMediaRef } from "@/features/files/media-client/refs";
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";
import { RemoteImageGate, remoteImageHost } from "@/components/rich-content/prose/remote-image-policy";
import { Button } from "@ai-matrx/design-system/controls";
import { TapTargetButton } from "@ai-matrx/design-system/tap-target";

const MAX_IMAGE_HEIGHT = 700;

interface ImageBlockProps {
  src: string;
  alt?: string;
}

const ImageBlockImpl: React.FC<ImageBlockProps> = ({ src: srcProp, alt = "Image" }) => {
  // IDENTITY BEATS THE STORED STRING.
  //
  // A markdown image is frequently one of OUR files whose URL was written into
  // the message long ago. Historically that string was an EXPIRING signed S3
  // URL, so rendering `srcProp` verbatim shows a broken image the moment the
  // signature lapses — no session refresh can resurrect it (see the media recovery hook's
  // header). `recognizeOurFileUrl` hands back the STRONGEST FileSource it can
  // recover — a `file_id` when the URL carries one — and the handler re-mints a
  // live URL from that identity, so every historical row heals itself on read
  // with no rewrite of stored content.
  //
  // A URL we don't recognise (a genuinely external image) yields no match, the
  // handler is called with `null`, and `srcProp` passes through untouched.
  const ourFile = recognizeOurFileUrl(srcProp);
  const mediaRef = fileSourceToMediaRef(ourFile?.source);
  const { resolution } = useMediaResolution(mediaRef);
  const needsBlob = resolution?.transport === "blob";
  const authenticatedBlob = useMediaBlob(needsBlob ? mediaRef : null);
  const resolvedFromIdentity = needsBlob
    ? authenticatedBlob.url
    : (resolution?.src ?? null);
  // The resolver's transport verdict is authoritative. In particular, a
  // private image endpoint must never fall back to a direct <img src> while
  // its bearer-authenticated blob is still loading.
  const effectiveSrc = mediaRef ? resolvedFromIdentity : srcProp;
  // Session-cookie self-heal still applies on top: the identity-resolved URL is
  // durable, so a load failure means the file session needs re-establishing.
  const src = effectiveSrc ?? "";
  const renderSrc = effectiveSrc ?? undefined;
  // A remote image that draws tells its website nothing about where it was opened (remote-image-policy.tsx).
  const remoteReferrer = renderSrc && remoteImageHost(renderSrc) ? ("no-referrer" as const) : undefined;
  const {
    retryKey,
    onLoadError: handleImageError,
  } = useMediaLoadRecovery(effectiveSrc ?? null, {
    recoverable:
      !needsBlob &&
      (!!ourFile?.fileId ||
        (!!effectiveSrc && recognizeOurFileUrl(effectiveSrc) !== null)),
    failureRef: mediaRef,
  });
  // Our own media has a recoverable file_id → offer the "Edit" escape hatch
  // (open the real image editor); external/unknown URLs simply don't show it.
  const editableFileId = ourFile?.fileId ?? null;
  const [feedback, setFeedback] = useState<"none" | "like" | "dislike">("none");
  const [showCopySuccess, setShowCopySuccess] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showExpandedView, setShowExpandedView] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleDownload = async (e?: React.MouseEvent) => {
    e?.preventDefault();

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

  const handleCopyUrl = (e?: React.MouseEvent) => {
    e?.preventDefault();
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

  const handleCopyImage = async (e?: React.MouseEvent) => {
    e?.preventDefault();
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

  const handleShare = async (e?: React.MouseEvent) => {
    e?.preventDefault();
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
    if (!showExpandedView) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCloseExpanded();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showExpandedView]);

  return (
    <div className="relative my-4 rounded-3xl group max-w-[900px]" data-matrx-glass-plane="">
      <img
        key={retryKey}
        ref={imageRef}
        src={renderSrc}
        referrerPolicy={remoteReferrer}
        alt={alt}
        onDoubleClick={handleExpand}
        onError={handleImageError}
        className="w-full h-auto rounded-3xl object-contain cursor-zoom-in"
        style={{ maxHeight: MAX_IMAGE_HEIGHT }}
      />

      {/* Action buttons - visible on group hover */}
      <div className="absolute top-4 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TapTargetButton icon={<DownloadIcon />} ariaLabel="Download" onClick={handleDownload} />
        <TapTargetButton icon={<ClipboardCopyIcon />} ariaLabel="Copy URL" onClick={handleCopyUrl} />
        <TapTargetButton icon={<CopyIcon />} ariaLabel="Copy Image" onClick={handleCopyImage} />
        <TapTargetButton icon={<ShareIcon />} ariaLabel="Share" onClick={handleShare} />
        {editableFileId && (
          <TapTargetButton icon={<PencilIcon />} ariaLabel="Edit image" onClick={() =>
              window.open(
                `/images/edit/${editableFileId}`,
                "_blank",
                "noopener,noreferrer",
              )
            } />
        )}
        <TapTargetButton icon={<Maximize2Icon />} ariaLabel="Expand" onClick={handleExpand} />
      </div>

      {/* Feedback section - now on bottom left */}
      <div className="absolute bottom-2 left-2 flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TapTargetButton icon={<ThumbsUpIcon />} ariaLabel="Like" pressed={feedback === "like"} onClick={() => handleFeedback("like")} />
        <TapTargetButton icon={<ThumbsDownIcon />} ariaLabel="Dislike" pressed={feedback === "dislike"} onClick={() => handleFeedback("dislike")} />
      </div>

      {/* Share modal */}
      {showShareModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setShowShareModal(false)}
        >
          <div
            className="bg-card text-card-foreground border border-border p-6 rounded-lg max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">Share this image</h3>
            <div className="flex flex-wrap gap-4 mb-4">
              <Button variant="quiet" onClick={() =>
                  openInNewTab(
                    `https://twitter.com/intent/tweet?url=${encodeURIComponent(src)}`,
                  )
                }>
                Twitter
              </Button>
              <Button variant="quiet" onClick={() =>
                  openInNewTab(
                    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(src)}`,
                  )
                }>
                Facebook
              </Button>
              <Button variant="quiet" onClick={() =>
                  openInNewTab(
                    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(src)}`,
                  )
                }>
                LinkedIn
              </Button>
            </div>
            <div className="flex justify-between items-center mt-4">
              <input
                type="text"
                value={src}
                readOnly
                className="flex-1 border border-border bg-background p-2 rounded mr-2"
              />
              <Button variant="quiet" onClick={handleCopyUrl}>
                {showCopySuccess ? "Copied!" : "Copy"}
              </Button>
            </div>
            <Button variant="quiet" onClick={() => setShowShareModal(false)} className="mt-4 w-full">
              Close
            </Button>
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
            key={retryKey}
            src={renderSrc}
            referrerPolicy={remoteReferrer}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={handleCloseExpanded}
            onError={handleImageError}
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: "center center",
            }}
            className="h-[94dvh] w-[96vw] object-contain transition-transform duration-200 cursor-zoom-out"
          />

          {/* Top-center close button — avoids sidebar (left) and avatar (right) */}
          <Button variant="quiet" icon={<XIcon />} onClick={handleCloseExpanded} title="Close (Esc)" className="fixed top-3 left-1/2 z-[10000]">
            <span>Close</span>
          </Button>

          {/* Bottom controls: zoom + close */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] flex items-center gap-3 bg-black/70 backdrop-blur-sm px-5 py-2.5 rounded-full">
            <Button variant="quiet" icon={<ZoomOutIcon />} onClick={(e) => {
                e.stopPropagation();
                handleZoomOut();
              }} title="Zoom Out" aria-label="Zoom Out" />
            <span className="text-white text-sm font-medium min-w-[3rem] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <Button variant="quiet" icon={<ZoomInIcon />} onClick={(e) => {
                e.stopPropagation();
                handleZoomIn();
              }} title="Zoom In" aria-label="Zoom In" />
            <div className="w-px h-5 bg-white/20" />
            <Button variant="quiet" icon={<XIcon />} onClick={handleCloseExpanded} title="Close (Esc)" aria-label="Close (Esc)" />
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

/** A remote image obeys the surrounding policy (remote-image-policy.tsx); our own files always draw. */
const ImageBlock: React.FC<ImageBlockProps> = (props) => (
  <RemoteImageGate src={props.src} alt={props.alt} block>
    <ImageBlockImpl {...props} />
  </RemoteImageGate>
);

export default ImageBlock;
