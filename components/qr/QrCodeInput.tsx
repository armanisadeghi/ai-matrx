"use client";

/**
 * components/qr/QrCodeInput.tsx — THE way a user hands us a QR code.
 *
 * One control, every route a real person actually takes:
 *   • **Paste** a screenshot (⌘V / Ctrl+V anywhere inside it) — the desktop path.
 *   • **Drop** an image file onto it.
 *   • **Choose** a file from disk.
 *   • **Scan** with the camera — the phone path, live-decoding the preview.
 *
 * Nothing is uploaded, stored, or persisted: the image lives in a canvas for
 * the length of one `decodeQrFromImageFile` call and is dropped. Decoding is
 * local (`lib/qr/decode.ts`), so the answer is instant and the surface can show
 * the user WHAT it read before anything is committed.
 *
 * Generic on purpose — reach for this for any QR intake, never a second one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImageUp, Loader2, ScanLine, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  decodeQrFromElement,
  decodeQrFromImageFile,
} from "@/lib/qr/decode";
import {
  acquireCameraLease,
  type CameraLease,
} from "@/features/media-capture/runtime/camera-stream-manager";
import { CameraPreview } from "@/features/media-capture/components/CameraPreview";

/** How often the live preview is sampled for a code. 5/s reads instantly to a
 *  human while leaving the main thread alone between frames. */
const SCAN_INTERVAL_MS = 200;

export interface QrCodeInputProps {
  /** Called with the decoded text. The component never interprets it. */
  onDecoded: (text: string) => void;
  /** Reported when an image was readable but held no QR code, or the camera
   *  could not start. Callers render it in their own error slot. */
  onError?: (message: string) => void;
  disabled?: boolean;
  /** Single line under the title. Keep it to one sentence. */
  hint?: string;
  className?: string;
}

export function QrCodeInput({
  onDecoded,
  onError,
  disabled = false,
  hint,
  className,
}: QrCodeInputProps) {
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const leaseRef = useRef<CameraLease | null>(null);

  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const fail = useCallback(
    (message: string) => {
      onError?.(message);
    },
    [onError],
  );

  const stopScan = useCallback(() => {
    leaseRef.current?.release();
    leaseRef.current = null;
    setStream(null);
    setScanning(false);
  }, []);

  // Release the camera on unmount — a lease that outlives its surface leaves
  // the device light on.
  useEffect(() => stopScan, [stopScan]);

  const handleImage = useCallback(
    async (file: Blob) => {
      if (disabled) return;
      setBusy(true);
      try {
        const text = await decodeQrFromImageFile(file);
        if (!text) {
          fail(
            "No QR code found in that image. Crop closer to the code, or type the setup key instead.",
          );
          return;
        }
        stopScan();
        onDecoded(text);
      } catch (err) {
        fail(err instanceof Error ? err.message : "That image could not be read.");
      } finally {
        setBusy(false);
      }
    },
    [disabled, fail, onDecoded, stopScan],
  );

  // ── Paste: the desktop path. Screenshot → ⌘V, anywhere inside this control.
  useEffect(() => {
    const root = rootRef.current;
    if (!root || disabled) return undefined;
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            event.preventDefault();
            void handleImage(blob);
            return;
          }
        }
      }
    };
    root.addEventListener("paste", onPaste);
    return () => root.removeEventListener("paste", onPaste);
  }, [disabled, handleImage]);

  // ── Live camera scan: the phone path.
  const startScan = useCallback(async () => {
    if (disabled || scanning) return;
    setBusy(true);
    try {
      const lease = await acquireCameraLease({
        facingMode: "environment",
        profile: "1080p",
      });
      leaseRef.current = lease;
      setStream(lease.stream);
      setScanning(true);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      fail(
        name === "NotAllowedError"
          ? "Camera access was blocked. Allow it in your browser, or take a screenshot of the QR code and paste it here."
          : "No camera available here. Paste or upload a picture of the QR code instead.",
      );
    } finally {
      setBusy(false);
    }
  }, [disabled, fail, scanning]);

  // Decode the live preview on a tick until a code appears.
  useEffect(() => {
    if (!scanning) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video) {
        try {
          const text = await decodeQrFromElement(video);
          if (text && !cancelled) {
            stopScan();
            onDecoded(text);
            return;
          }
        } catch {
          // A frame that will not decode is a miss, not a failure — keep going.
        }
      }
      if (!cancelled) timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };

    timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [scanning, onDecoded, stopScan]);

  if (scanning) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border bg-black",
          className,
        )}
      >
        <div className="aspect-[4/3] w-full">
          <CameraPreview
            stream={stream}
            framing="viewport-crop"
            videoRef={videoRef}
            className="h-full w-full"
          />
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-40 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/60 p-2">
          <span className="inline-flex items-center gap-1.5 text-xs text-white">
            <ScanLine className="h-3.5 w-3.5" />
            Point at the QR code
          </span>
          <Button size="sm" variant="secondary" onClick={stopScan}>
            <X className="mr-1 h-3.5 w-3.5" />
            Stop
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      tabIndex={disabled ? -1 : 0}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void handleImage(file);
      }}
      className={cn(
        "rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center outline-none transition-colors",
        "focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary",
        dragging && "border-primary bg-primary/5",
        disabled && "opacity-60",
        className,
      )}
    >
      {busy ? (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading the code…
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">
            {isMobile ? "Scan the QR code" : "Paste or drop the QR code"}
          </p>
          {hint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={isMobile ? "default" : "outline"}
              disabled={disabled}
              onClick={() => void startScan()}
            >
              <Camera className="mr-1.5 h-4 w-4" />
              Scan with camera
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => fileRef.current?.click()}
            >
              <ImageUp className="mr-1.5 h-4 w-4" />
              Choose an image
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleImage(file);
            }}
          />
        </>
      )}
    </div>
  );
}
