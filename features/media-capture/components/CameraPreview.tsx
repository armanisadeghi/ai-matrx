"use client";

/**
 * features/media-capture/components/CameraPreview.tsx
 *
 * The canonical live camera <video> preview for a stream held by a camera
 * lease (features/media-capture/runtime/camera-stream-manager.ts). Renders the
 * stream only — it never acquires or releases leases (the owning surface does).
 *
 * - framing "full-frame"    → object-contain letterbox (WYSIWYG for full-stream
 *                             capture, the PDF-scanner contract).
 * - framing "viewport-crop" → object-cover (preview crops; capture must map
 *                             back through core/geometry.ts sourceRect).
 * - `mirror` is PREVIEW-ONLY (CSS transform). Output mirroring is a separate,
 *   explicit capture decision — never implied by this component.
 * - Intrinsic dimensions (videoWidth/videoHeight — NEVER element offsets, plan
 *   §5 invariant 5) are re-read on loadedmetadata / resize / orientationchange
 *   and surfaced via `onIntrinsicSize`.
 */

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { FramingMode } from "@/features/media-capture/core/capture-types";

export interface CameraPreviewProps {
  stream: MediaStream | null;
  framing: FramingMode;
  /** Mirror the PREVIEW only (front camera). CSS transform — output unaffected. */
  mirror?: boolean;
  /** Reports the stream's intrinsic pixel size (videoWidth × videoHeight).
   *  Fires on loadedmetadata and again on resize/orientationchange. */
  onIntrinsicSize?: (size: { width: number; height: number }) => void;
  /** Access to the underlying <video> element for capture surfaces (the
   *  shutter needs a CanvasImageSource). Read-only — never manage the
   *  element's srcObject through this ref. */
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  className?: string;
}

export function CameraPreview({
  stream,
  framing,
  mirror = false,
  onIntrinsicSize,
  videoRef: externalVideoRef,
  className,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Mirror the internal element into the caller's ref (capture surfaces).
  useEffect(() => {
    if (externalVideoRef) externalVideoRef.current = videoRef.current;
    return () => {
      if (externalVideoRef) externalVideoRef.current = null;
    };
  }, [externalVideoRef]);
  const onIntrinsicSizeRef = useRef(onIntrinsicSize);
  useEffect(() => {
    onIntrinsicSizeRef.current = onIntrinsicSize;
  }, [onIntrinsicSize]);

  // Attach the stream imperatively — srcObject is not a React DOM prop.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    return () => {
      video.srcObject = null;
    };
  }, [stream]);

  // Intrinsic-size reporting: loadedmetadata (first known size) + window
  // resize/orientationchange (rotation swaps videoWidth/videoHeight on mobile).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const report = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width > 0 && height > 0) {
        onIntrinsicSizeRef.current?.({ width, height });
      }
    };

    video.addEventListener("loadedmetadata", report);
    window.addEventListener("resize", report);
    window.addEventListener("orientationchange", report);
    // Already-loaded stream (attached before this effect ran).
    report();
    return () => {
      video.removeEventListener("loadedmetadata", report);
      window.removeEventListener("resize", report);
      window.removeEventListener("orientationchange", report);
    };
  }, [stream]);

  // Inline styles, deliberately (replicating the fix first documented in the
  // now-deleted legacy components/matrx/camera/camera-view.tsx): globals.css has an
  // UNLAYERED mobile rule `img, video, iframe { height: auto }`
  // (@media max-width:768px) that beats every Tailwind utility — with
  // height:auto the video takes its intrinsic aspect at full width and the
  // container clips the bottom, so the live view silently shows LESS than the
  // captured frame (the scanner's finger test). Inline style wins over any
  // stylesheet rule, guaranteeing the preview fills its container in both
  // framing modes.
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: framing === "full-frame" ? "contain" : "cover",
    ...(mirror ? { transform: "scaleX(-1)" } : {}),
  };

  return (
    <video
      ref={videoRef}
      style={style}
      className={className}
      muted
      autoPlay
      playsInline
    />
  );
}
