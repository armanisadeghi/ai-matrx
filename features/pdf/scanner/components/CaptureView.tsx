"use client";

/**
 * CaptureView — full-screen rapid-capture camera overlay.
 *
 * Built on the canonical camera primitives (`CameraProvider` +
 * `CameraView` from components/matrx/camera) with scanner constraints:
 * rear camera preferred, 4K ideal (browsers clamp to the sensor max).
 * Every shutter tap hands the shot up immediately — the session hook
 * uploads it in the background while the user keeps shooting.
 *
 * When getUserMedia is unavailable (permission denied, in-app webview),
 * the fallback button opens the OS camera via `<input capture>`.
 */

import React, { useCallback, useRef, useState } from "react";
import { Camera as CameraIcon, Check, SwitchCamera } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CameraProvider,
  useCamera,
} from "@/components/matrx/camera/camera-provider";
import { CameraView } from "@/components/matrx/camera/camera-view";
import type { CameraType } from "@/components/matrx/camera/camera-types";
import { cn } from "@/lib/utils";

interface CaptureViewProps {
  /** Fired per shot with the JPEG data URL — upload starts immediately. */
  onCapture: (dataUrl: string) => void;
  /** Recent shot previews for the filmstrip (newest last). */
  recentPreviews: string[];
  uploadingCount: number;
  onDone: () => void;
}

export function CaptureView(props: CaptureViewProps) {
  return (
    <CameraProvider
      videoConstraints={{
        facingMode: { ideal: "environment" },
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        aspectRatio: undefined,
      }}
      photoQuality={0.92}
    >
      <CaptureViewInner {...props} />
    </CameraProvider>
  );
}

function CaptureViewInner({
  onCapture,
  recentPreviews,
  uploadingCount,
  onDone,
}: CaptureViewProps) {
  const cameraRef = useRef<CameraType | null>(null);
  const { numberOfCameras, switchCamera, stopStream, notSupported, permissionDenied } =
    useCamera();
  const [flash, setFlash] = useState(false);
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
            <Button
              size="sm"
              onClick={() => fallbackInputRef.current?.click()}
            >
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

      {/* Bottom bar: filmstrip + shutter + done */}
      <div className="z-30 shrink-0 bg-black/90 px-4 pb-safe">
        {recentPreviews.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto py-2">
            {recentPreviews.slice(-8).map((src, i) => (
              
              <img
                key={`${i}-${src.slice(-24)}`}
                src={src}
                alt=""
                className="h-12 w-9 shrink-0 rounded object-cover"
              />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between py-3">
          <div className="w-20">
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
          <div className="flex w-20 justify-end">
            <Button
              size="sm"
              className="h-11 rounded-full px-4"
              onClick={handleDone}
            >
              <Check className="mr-1 h-4 w-4" />
              Done
              {recentPreviews.length > 0 && (
                <span className="ml-1 tabular-nums">
                  ({recentPreviews.length})
                </span>
              )}
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
    </div>
  );
}
