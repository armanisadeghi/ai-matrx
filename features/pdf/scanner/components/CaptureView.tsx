"use client";

/**
 * CaptureView — full-screen rapid-capture camera overlay.
 *
 * Built on the canonical camera primitives (`CameraProvider` +
 * `CameraView` from components/matrx/camera) with scanner behavior:
 * rear camera preferred, 4K ideal (browsers clamp to the sensor max),
 * and strict WYSIWYG — the `fill` view shows the ENTIRE sensor frame
 * (letterboxed) and `fullFrameCapture` photographs exactly that frame,
 * so nothing hidden under the controls sneaks into the photo.
 *
 * Filmstrip thumbs open a full-screen preview (stay in capture mode) so
 * blurry shots can be re-taken immediately.
 *
 * When getUserMedia is unavailable (permission denied, in-app webview),
 * the fallback button opens the OS camera via `<input capture>`.
 */

import React, { useCallback, useRef, useState } from "react";
import { Camera as CameraIcon, Check, SwitchCamera, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CameraProvider,
  useCamera,
} from "@/components/matrx/camera/camera-provider";
import { CameraView } from "@/components/matrx/camera/camera-view";
import type { CameraType } from "@/components/matrx/camera/camera-types";
import { cn } from "@/lib/utils";

export interface CaptureShot {
  itemId: string;
  previewUrl: string;
}

interface CaptureViewProps {
  /** Fired per shot with the JPEG data URL — upload starts immediately. */
  onCapture: (dataUrl: string) => void;
  /** Session shots for the filmstrip (newest last). */
  shots: CaptureShot[];
  onRemoveShot: (itemId: string) => void;
  uploadingCount: number;
  onDone: () => void;
}

export function CaptureView(props: CaptureViewProps) {
  return (
    <CameraProvider
      videoConstraints={{
        facingMode: { ideal: "environment" },
        // Square over-ask: the UA clamps each axis to the sensor max, so we
        // get the camera's NATIVE aspect (typically 4:3) at full resolution.
        // Asking 3840x2160 biased streams toward a 16:9 crop, which turned
        // portrait captures unnaturally tall and narrow.
        width: { ideal: 4096 },
        height: { ideal: 4096 },
        aspectRatio: undefined,
      }}
      photoQuality={0.92}
      fullFrameCapture
    >
      <CaptureViewInner {...props} />
    </CameraProvider>
  );
}

function CaptureViewInner({
  onCapture,
  shots,
  onRemoveShot,
  uploadingCount,
  onDone,
}: CaptureViewProps) {
  const cameraRef = useRef<CameraType | null>(null);
  const { numberOfCameras, switchCamera, stopStream, notSupported, permissionDenied } =
    useCamera();
  const [flash, setFlash] = useState(false);
  const [previewShot, setPreviewShot] = useState<CaptureShot | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const cameraBlocked = notSupported || permissionDenied;

  const handleShutter = useCallback(() => {
    const dataUrl = cameraRef.current?.takePhoto();
    if (!dataUrl) return;
    onCapture(dataUrl);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 120);
  }, [onCapture]);

  const handleDone = useCallback(() => {
    stopStream();
    onDone();
  }, [stopStream, onDone]);

  const handleFallbackChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") onCapture(reader.result);
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [onCapture],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <CameraView
          ref={cameraRef}
          variant="fill"
          errorMessages={undefined}
          videoReadyCallback={() => null}
        />
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
              onClick={handleDone}
            >
              <Check className="mr-1 h-4 w-4" />
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
