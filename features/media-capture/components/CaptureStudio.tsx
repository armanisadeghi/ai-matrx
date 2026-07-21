"use client";

/**
 * features/media-capture/components/CaptureStudio.tsx
 *
 * Photo-mode Capture Studio: live preview (CameraPreview; viewport-crop
 * default with full-frame toggle; front camera mirrored PREVIEW-ONLY) →
 * shutter (usePhotoCapture, canvas primary) → review (retake / download /
 * save) → durable state (`<InlineMediaRef>` by file_id via CaptureReview).
 *
 * Lifecycle rules honored here:
 * - ONE camera lease per open studio, acquired on mount (user-initiated
 *   surface — never at app boot), released on unmount/spec change; the
 *   manager stops the camera on last release.
 * - Every local preview is a TRACKED object URL, revoked on retake, replace,
 *   unmount, AND after the save-swap to the durable render.
 * - Terminal errors are explicit CaptureError kinds: permission-denied,
 *   device-removed, stream-ended, not-supported — each with a visible
 *   message; permission/not-supported offer the OS-camera fallback input.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AlertTriangle, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  createTrackedObjectUrl,
  revokeTrackedObjectUrl,
} from "@/lib/media/object-url-registry";
import {
  listDevices,
  getMediaDevicesSnapshot,
  subscribeMediaDevices,
} from "@/features/media-devices/deviceManager";
import {
  acquireCameraLease,
  subscribeCameraInterruption,
  type CameraLease,
} from "@/features/media-capture/runtime/camera-stream-manager";
import {
  buildPhotoCaptureMetadata,
  type CaptureError,
  type CaptureQualityProfile,
  type FramingMode,
  type PhotoCaptureMetadata,
} from "@/features/media-capture/core/capture-types";
import { usePhotoCapture } from "@/features/media-capture/hooks/usePhotoCapture";
import { uploadCapture } from "@/features/media-capture/upload/capture-uploader";
import { CameraPreview } from "@/features/media-capture/components/CameraPreview";
import { CaptureControls } from "@/features/media-capture/components/CaptureControls";
import { CaptureReview } from "@/features/media-capture/components/CaptureReview";
import {
  DeviceFallbackInput,
  type DeviceFallbackInputHandle,
  type DeviceFallbackPhoto,
} from "@/features/media-capture/components/DeviceFallbackInput";

type StudioPhase = "starting" | "preview" | "review" | "error";

interface CapturedDraft {
  file: File;
  previewUrl: string;
  metadata: PhotoCaptureMetadata;
}

export interface CaptureStudioProps {
  /** metadata.capture.source_feature. Default "camera". */
  sourceFeature?: string;
  /** Quality profile requested from the stream manager. Default "1080p". */
  profile?: CaptureQualityProfile;
  onSaved?: (fileId: string) => void;
  className?: string;
}

function classifyAcquireError(err: unknown): CaptureError {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      kind: "permission-denied",
      message:
        "Camera access was denied. Allow camera access in your browser settings, or use your device camera below.",
    };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return {
      kind: "device-removed",
      message: "No usable camera was found on this device.",
    };
  }
  if (name === "NotReadableError" || name === "AbortError") {
    return {
      kind: "stream-ended",
      message:
        "The camera could not be started — it may be in use by another application.",
    };
  }
  return {
    kind: "not-supported",
    message:
      "In-page camera capture is not supported here. You can still use your device camera below.",
  };
}

export function CaptureStudio({
  sourceFeature = "camera",
  profile = "1080p",
  onSaved,
  className,
}: CaptureStudioProps) {
  const isMobile = useIsMobile();
  const { capturing, capturePhoto } = usePhotoCapture();

  const [phase, setPhase] = useState<StudioPhase>("starting");
  const [error, setError] = useState<CaptureError | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [framing, setFraming] = useState<FramingMode>("viewport-crop");
  const [facing, setFacing] = useState<"user" | "environment">(
    isMobile ? "environment" : "user",
  );
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CapturedDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFileId, setSavedFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const leaseRef = useRef<CameraLease | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackRef = useRef<DeviceFallbackInputHandle | null>(null);
  const capturedRef = useRef<CapturedDraft | null>(null);
  capturedRef.current = captured;

  const devices = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    getMediaDevicesSnapshot,
  );

  // ── Camera lease lifecycle — one lease per (deviceId|facing) spec ─────────
  useEffect(() => {
    let cancelled = false;
    let myLease: CameraLease | null = null;
    let unsubscribe: (() => void) | null = null;

    setPhase((p) => (p === "review" ? p : "starting"));
    setError(null);

    acquireCameraLease({
      profile,
      ...(deviceId && !isMobile ? { deviceId } : {}),
      ...(isMobile ? { facingMode: facing } : {}),
    })
      .then((lease) => {
        if (cancelled) {
          lease.release();
          return;
        }
        myLease = lease;
        leaseRef.current = lease;
        setStream(lease.stream);
        unsubscribe = lease.on("reconfigured", (next) => setStream(next));
        setPhase((p) => (p === "review" ? p : "preview"));
        // Labels unlock after a grant — refresh the shared device list.
        void listDevices();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(classifyAcquireError(err));
        setPhase("error");
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
  }, [profile, deviceId, facing, isMobile]);

  // ── Interruptions are LOUD terminal states while previewing ───────────────
  useEffect(() => {
    return subscribeCameraInterruption((reason) => {
      if (reason === "ended") {
        setError({
          kind: "device-removed",
          message: "The camera stream ended — the device was removed or taken over.",
        });
        setPhase((p) => (p === "review" ? p : "error"));
      } else if (reason === "permission-revoked") {
        setError({
          kind: "permission-denied",
          message: "Camera permission was revoked while capturing.",
        });
        setPhase((p) => (p === "review" ? p : "error"));
      }
    });
  }, []);

  // ── Revoke any outstanding preview URL on unmount ─────────────────────────
  useEffect(() => {
    return () => {
      revokeTrackedObjectUrl(capturedRef.current?.previewUrl);
    };
  }, []);

  const clearDraft = useCallback(() => {
    setCaptured((prev) => {
      revokeTrackedObjectUrl(prev?.previewUrl);
      return null;
    });
    setSavedFileId(null);
    setUploadError(null);
  }, []);

  const handleShutter = useCallback(async () => {
    const video = videoRef.current;
    const lease = leaseRef.current;
    const container = containerRef.current;
    if (!video || !lease || video.videoWidth === 0) return;
    try {
      const box = container?.getBoundingClientRect();
      const result = await capturePhoto({
        video,
        framing,
        lease,
        ...(framing === "viewport-crop" && box
          ? { container: { width: box.width, height: box.height } }
          : {}),
        allowNativeTakePhoto: framing === "full-frame",
      });
      const metadata = buildPhotoCaptureMetadata({
        source: "browser-media-devices",
        sourceFeature,
        sourceSettings: result.sourceSettings,
        framing,
        mirroredOutput: false, // mirror is preview-only, never applied to output
      });
      clearDraft();
      setCaptured({
        file: result.file,
        previewUrl: createTrackedObjectUrl(result.blob),
        metadata,
      });
      setPhase("review");
    } catch (err) {
      console.error("[CaptureStudio] shutter failed", err);
      setError({
        kind: "stream-ended",
        message: "Capturing the frame failed — the stream may have ended. Try again.",
      });
      setPhase("error");
    }
  }, [capturePhoto, framing, sourceFeature, clearDraft]);

  const handleFallbackPhoto = useCallback(
    (photo: DeviceFallbackPhoto) => {
      clearDraft();
      setCaptured({
        file: photo.file,
        previewUrl: createTrackedObjectUrl(photo.blob),
        metadata: photo.metadata,
      });
      setPhase("review");
    },
    [clearDraft],
  );

  const handleRetake = useCallback(() => {
    clearDraft();
    setPhase(leaseRef.current ? "preview" : error ? "error" : "starting");
  }, [clearDraft, error]);

  const handleDownload = useCallback(() => {
    const draft = capturedRef.current;
    if (!draft) return;
    const a = document.createElement("a");
    a.href = draft.previewUrl;
    a.download = draft.file.name;
    a.click();
  }, []);

  const handleSave = useCallback(async () => {
    const draft = capturedRef.current;
    if (!draft || saving) return;
    setSaving(true);
    setUploadError(null);
    try {
      const uploaded = await uploadCapture({
        file: draft.file,
        capture: draft.metadata,
      });
      const fileId = uploaded.fileId as string; // uploader throws when absent
      setSavedFileId(fileId);
      // Save-swap: the durable InlineMediaRef renders now — the local
      // ephemeral preview URL is done.
      setCaptured((prev) => {
        revokeTrackedObjectUrl(prev?.previewUrl);
        return prev ? { ...prev, previewUrl: "" } : prev;
      });
      onSaved?.(fileId);
    } catch (err) {
      console.error("[CaptureStudio] save failed", err);
      setUploadError(
        err instanceof Error ? err.message : "Upload failed — try again.",
      );
    } finally {
      setSaving(false);
    }
  }, [saving, onSaved]);

  const showFallbackOffer =
    error?.kind === "permission-denied" || error?.kind === "not-supported";

  return (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ""}`}>
      {phase === "review" && captured ? (
        <CaptureReview
          previewUrl={captured.previewUrl}
          fileName={captured.file.name}
          saving={saving}
          savedFileId={savedFileId}
          uploadError={uploadError}
          onRetake={handleRetake}
          onDownload={handleDownload}
          onSave={() => void handleSave()}
        />
      ) : (
        <>
          <div
            ref={containerRef}
            className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30"
          >
            {phase === "starting" && <Skeleton className="h-full w-full" />}
            {phase === "preview" && (
              <CameraPreview
                stream={stream}
                framing={framing}
                mirror={isMobile ? facing === "user" : true}
                videoRef={videoRef}
              />
            )}
            {phase === "error" && error && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  {error.message}
                </p>
                {showFallbackOffer && (
                  <Button size="sm" onClick={() => fallbackRef.current?.open()}>
                    <Camera className="mr-1.5 h-4 w-4" />
                    Use device camera
                  </Button>
                )}
              </div>
            )}
          </div>

          <CaptureControls
            framing={framing}
            onFramingChange={setFraming}
            isMobile={isMobile}
            facing={facing}
            onToggleFacing={() =>
              setFacing((f) => (f === "user" ? "environment" : "user"))
            }
            cameras={devices.cameras}
            selectedDeviceId={deviceId}
            onSelectDevice={setDeviceId}
            onShutter={() => void handleShutter()}
            shutterDisabled={phase !== "preview" || capturing}
            capturing={capturing}
          />
        </>
      )}

      <DeviceFallbackInput
        ref={fallbackRef}
        captureFacing="environment"
        sourceFeature={sourceFeature}
        onPhoto={handleFallbackPhoto}
        onError={(err) => {
          setUploadError(null);
          setError({ kind: "stream-ended", message: err.message });
          setPhase("error");
        }}
      />
    </div>
  );
}
