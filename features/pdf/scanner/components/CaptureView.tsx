"use client";

/**
 * CaptureView — full-screen rapid-capture camera overlay.
 *
 * Built on the media-capture runtime (`acquireCameraLease` +
 * `<CameraPreview framing="full-frame">` + `capturePhotoFromVideo`) with the
 * scanner contract: rear camera preferred, `maximum-available` profile (4096
 * over-ask — browsers clamp to the sensor max), and strict WYSIWYG — the
 * letterboxed full-frame preview shows the ENTIRE stream frame and each shot
 * captures exactly that frame via the canvas path (output dims ===
 * videoWidth×videoHeight; native takePhoto() is deliberately NOT used here
 * because it may return a different resolution than the stream).
 *
 * Per-shot output is a JPEG **Blob** at quality 0.92 (data URLs are banned in
 * the capture pipeline); the session layer turns it into a File + tracked
 * object URL. Filmstrip thumbs open a full-screen preview (stay in capture
 * mode) so blurry shots can be re-taken immediately.
 *
 * When getUserMedia is unavailable (permission denied, in-app webview), the
 * fallback button opens the OS camera via `<input capture="environment">` —
 * the raw file is passed through byte-identical (the scan pipeline handles
 * processing server-side).
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Camera as CameraIcon, SwitchCamera, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getMediaDevicesSnapshot,
  listDevices,
  subscribeMediaDevices,
} from "@/features/media-devices/deviceManager";
import {
  acquireCameraLease,
  type CameraLease,
} from "@/features/media-capture/runtime/camera-stream-manager";
import { CameraPreview } from "@/features/media-capture/components/CameraPreview";
import { capturePhotoFromVideo } from "@/features/media-capture/hooks/usePhotoCapture";

const SCANNER_JPEG_QUALITY = 0.92;

export interface CaptureShot {
  itemId: string;
  previewUrl: string;
}

interface CaptureViewProps {
  /** Fired per shot with the JPEG Blob — upload starts immediately. */
  onCapture: (blob: Blob) => void;
  /** Session shots for the filmstrip (newest last). */
  shots: CaptureShot[];
  onRemoveShot: (itemId: string) => void;
  uploadingCount: number;
  onDone: () => void;
}

export function CaptureView({
  onCapture,
  shots,
  onRemoveShot,
  uploadingCount,
  onDone,
}: CaptureViewProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [notSupported, setNotSupported] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [previewShot, setPreviewShot] = useState<CaptureShot | null>(null);

  const leaseRef = useRef<CameraLease | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const devices = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    getMediaDevicesSnapshot,
  );
  const numberOfCameras = devices.cameras.length;

  // Acquire/release the scanner lease: environment facing, sensor maximum.
  useEffect(() => {
    let cancelled = false;
    let myLease: CameraLease | null = null;
    let unsubscribe: (() => void) | null = null;

    acquireCameraLease({
      profile: "maximum-available",
      ...(deviceId ? { deviceId } : { facingMode: "environment" as const }),
    })
      .then((lease) => {
        if (cancelled) {
          lease.release();
          return;
        }
        myLease = lease;
        leaseRef.current = lease;
        setStream(lease.stream);
        setPermissionDenied(false);
        setNotSupported(false);
        unsubscribe = lease.on("reconfigured", (next) => setStream(next));
        // Labels/counts unlock after the grant.
        void listDevices();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name: unknown }).name)
            : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setPermissionDenied(true);
        } else {
          setNotSupported(true);
        }
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (myLease) {
        myLease.release();
        if (leaseRef.current === myLease) leaseRef.current = null;
      }
      setStream(null);
    };
  }, [deviceId]);

  const cameraBlocked = notSupported || permissionDenied;

  const switchCamera = useCallback(() => {
    const cams = getMediaDevicesSnapshot().cameras;
    if (cams.length < 2) return;
    const currentIdx = deviceId
      ? cams.findIndex((c) => c.deviceId === deviceId)
      : cams.findIndex(
          (c) =>
            c.deviceId ===
            leaseRef.current?.stream.getVideoTracks()[0]?.getSettings().deviceId,
        );
    const next = cams[(Math.max(currentIdx, 0) + 1) % cams.length];
    if (next) setDeviceId(next.deviceId);
  }, [deviceId]);

  const handleShutter = useCallback(() => {
    const video = videoRef.current;
    const lease = leaseRef.current;
    if (!video || !lease || video.videoWidth === 0) return;
    void capturePhotoFromVideo({
      video,
      lease,
      framing: "full-frame",
      quality: SCANNER_JPEG_QUALITY,
      fileNamePrefix: "scan",
      // WYSIWYG contract: canvas only — output dims must equal the stream's
      // videoWidth×videoHeight, which native takePhoto() does not guarantee.
      allowNativeTakePhoto: false,
    })
      .then((result) => {
        onCapture(result.blob);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 120);
      })
      .catch((err: unknown) => {
        console.error("[pdf-scanner] shutter capture failed", err);
      });
  }, [onCapture]);

  const handleFallbackChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      // A File IS a Blob — raw bytes pass through; the scan pipeline
      // processes (crop/enhance) server-side.
      onCapture(file);
    },
    [onCapture],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <CameraPreview stream={stream} framing="full-frame" videoRef={videoRef} />
        {flash && <div className="absolute inset-0 z-20 bg-white/70" />}
        {cameraBlocked && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-8 text-center">
            <p className="text-sm text-white/90">
              The in-page camera isn&apos;t available here. Use your device
              camera instead — each photo is added the moment you take it.
            </p>
            <Button size="sm" onClick={() => fallbackInputRef.current?.click()}>
              <CameraIcon className="mr-1.5 h-4 w-4" />
              Open system camera
            </Button>
          </div>
        )}
      </div>

      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFallbackChange}
        className="hidden"
      />

      {/* Bottom bar: filmstrip + shutter + done. Sits BELOW the contained
          video — never covers the frame being photographed. */}
      <div className="z-30 shrink-0 bg-black px-4 pb-safe">
        {shots.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-2">
            {shots.slice(-10).map((shot, i, arr) => (
              <button
                key={shot.itemId}
                type="button"
                onClick={() => setPreviewShot(shot)}
                aria-label={`View photo ${shots.length - arr.length + i + 1}`}
                className="shrink-0"
              >
                { }
                <img
                  src={shot.previewUrl}
                  alt=""
                  className="h-12 w-9 rounded object-cover"
                />
              </button>
            ))}
            <span className="shrink-0 pl-1 text-[11px] tabular-nums text-white/60">
              {shots.length} page{shots.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between py-3">
          <div className="w-16">
            {numberOfCameras > 1 && !cameraBlocked && (
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 rounded-full text-white hover:bg-white/10 hover:text-white"
                onClick={switchCamera}
                aria-label="Switch camera"
              >
                <SwitchCamera className="h-5 w-5" />
              </Button>
            )}
          </div>
          <button
            type="button"
            onClick={handleShutter}
            disabled={cameraBlocked}
            aria-label="Take photo"
            className={cn(
              "flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/80 transition-transform active:scale-90",
              cameraBlocked && "opacity-30",
            )}
          >
            <span className="block h-14 w-14 rounded-full bg-white" />
          </button>
          <div className="flex w-16 justify-end">
            <Button
              size="sm"
              className="h-11 whitespace-nowrap rounded-full px-5"
              onClick={onDone}
            >
              Done
            </Button>
          </div>
        </div>
        {uploadingCount > 0 && (
          <p className="pb-2 text-center text-[11px] text-white/60">
            Saving {uploadingCount} photo{uploadingCount === 1 ? "" : "s"} in
            the background…
          </p>
        )}
      </div>

      {/* Full-screen shot preview — stays in capture mode */}
      {previewShot && (
        <div className="absolute inset-0 z-40 flex flex-col bg-black">
          <div className="relative min-h-0 flex-1">
            { }
            <img
              src={previewShot.previewUrl}
              alt="Captured photo"
              className="absolute inset-0 h-full w-full object-contain"
            />
          </div>
          <div className="flex shrink-0 items-center justify-center gap-3 bg-black px-4 py-3 pb-safe">
            <Button
              variant="destructive"
              className="h-11 px-5"
              onClick={() => {
                onRemoveShot(previewShot.itemId);
                setPreviewShot(null);
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete & retake
            </Button>
            <Button
              variant="secondary"
              className="h-11 px-5"
              onClick={() => setPreviewShot(null)}
            >
              <X className="mr-1.5 h-4 w-4" />
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
