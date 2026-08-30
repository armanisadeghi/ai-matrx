"use client";

/**
 * useCameraCaptureHost — APP-SIDE glue (stays in matrx-frontend when
 * `features/capture-camera` is mirrored into `@ai-matrx/capture`).
 *
 * Adapts the canonical media-capture runtime — `acquireCameraLease`,
 * `CameraPreview`, `capturePhotoFromVideo`, `startVideoRecording` — to the
 * package's `CaptureCameraEngine` port. Reused, never reimplemented; the
 * lease/permission/mic-warm-hold behavior is the proven IntakeCaptureScreen
 * contract, extracted generically.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  getMediaDevicesSnapshot,
  listDevices,
  queryCameraPermission,
  subscribeMediaDevices,
} from "@/features/media-devices/deviceManager";
import { useAudioDevices } from "@/features/audio/useAudioDevices";
import {
  acquireMicStream,
  releaseMicStream,
} from "@/features/audio/micStream";
import {
  acquireCameraLease,
  type CameraLease,
} from "@/features/media-capture/runtime/camera-stream-manager";
import { capturePhotoFromVideo } from "@/features/media-capture/hooks/usePhotoCapture";
import {
  startVideoRecording,
  type CaptureRecordingHandle,
} from "@/features/media-capture/recording/video-recorder";
import { extensionForMime } from "@/features/media-capture/core/mime-selection";
import { toast } from "@/lib/toast";

import type {
  CaptureAspect,
  CaptureCameraEngine,
  CaptureCameraMode,
} from "@ai-matrx/capture";

const PHOTO_JPEG_QUALITY = 0.92;

/** Center-crops a captured JPEG to the requested output aspect. The crop is
 *  applied to the FULL sensor frame (honest pixels, not a preview grab). */
async function cropBlobToAspect(
  blob: Blob,
  aspect: CaptureAspect,
): Promise<Blob> {
  if (aspect === "full") return blob;
  const [wRatio, hRatio] =
    aspect === "1:1" ? [1, 1] : aspect === "4:3" ? [4, 3] : [16, 9];
  const bitmap = await createImageBitmap(blob);
  try {
    const srcW = bitmap.width;
    const srcH = bitmap.height;
    // Orient the target ratio to the frame (portrait sensor → portrait crop).
    const target =
      srcW >= srcH ? wRatio / hRatio : hRatio / wRatio;
    let cropW = srcW;
    let cropH = Math.round(srcW / target);
    if (cropH > srcH) {
      cropH = srcH;
      cropW = Math.round(srcH * target);
    }
    if (cropW === srcW && cropH === srcH) return blob;
    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return blob;
    ctx.drawImage(
      bitmap,
      Math.round((srcW - cropW) / 2),
      Math.round((srcH - cropH) / 2),
      cropW,
      cropH,
      0,
      0,
      cropW,
      cropH,
    );
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob(
        (out) => resolve(out ?? blob),
        "image/jpeg",
        PHOTO_JPEG_QUALITY,
      ),
    );
  } finally {
    bitmap.close();
  }
}

export interface CameraCaptureHostOptions {
  /** Filename prefix for shutter captures (host feature vocabulary). */
  fileNamePrefix: string;
  /** Recording label shown in the media diagnostics registry. */
  recordingLabel: string;
  /** Receives every shutter photo (full-sensor frame). */
  onPhoto: (blob: Blob, opts?: { fileNamePrefix?: string }) => void;
  /** Receives every finished video recording. */
  onVideo: (blob: Blob, fileName: string, durationMs: number) => void;
  /** Opens the host's upload picker. */
  onUpload: () => void;
  /** Current mode — drives the video-mode mic warm hold. */
  mode: CaptureCameraMode;
}

export interface CameraCaptureHost {
  engine: CaptureCameraEngine;
  /** Take a photo with a non-default filename prefix (e.g. delineators). */
  capturePhotoWith: (opts: {
    fileNamePrefix: string;
    aspect?: CaptureAspect;
  }) => void;
  /** White shutter-flash flag (120 ms). */
  flash: boolean;
  cameraBlocked: boolean;
  permissionDenied: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  recording: boolean;
}

export function useCameraCaptureHost(
  options: CameraCaptureHostOptions,
): CameraCaptureHost {
  const {
    fileNamePrefix,
    recordingLabel,
    onPhoto,
    onVideo,
    onUpload,
    mode,
  } = options;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [notSupported, setNotSupported] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);

  const leaseRef = useRef<CameraLease | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recordingRef = useRef<CaptureRecordingHandle | null>(null);

  const devices = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    getMediaDevicesSnapshot,
  );
  const numberOfCameras = devices.cameras.length;

  // ── Lease lifecycle (the proven scanner/intake contract) ────────────────
  useEffect(() => {
    let cancelled = false;
    let myLease: CameraLease | null = null;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const known = await queryCameraPermission();
      if (cancelled) return;
      if (known === "denied") {
        setPermissionDenied(true);
        return;
      }
      try {
        const lease = await acquireCameraLease(
          {
            profile: "maximum-available",
            ...(deviceId ? { deviceId } : { facingMode: facing }),
          },
          { combineMicPrompt: true },
        );
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
        void listDevices();
      } catch (err: unknown) {
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
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (myLease) {
        myLease.release();
        if (leaseRef.current === myLease) leaseRef.current = null;
      }
      setStream(null);
    };
  }, [deviceId, facing]);

  const cameraBlocked = notSupported || permissionDenied;

  // ── Camera flip = a FACING toggle, never a deviceId cycle. ──────────────
  // The cycle version was "flip doesn't work" on every real phone: iPhones
  // enumerate several BACK lenses (wide, ultrawide, tele, dual...), so
  // "next camera" walked the back array and rarely reached the front. What
  // a flip button means is front↔back — ask for it by facingMode and let the
  // OS pick the lens. Clearing deviceId also drops any persisted preferred
  // camera from the spec so it cannot pin us to the previous side.
  const switchCamera = useCallback(() => {
    // Flipping reacquires the lease and stops the current tracks — doing it
    // mid-recording would kill the recording. The button is hidden while
    // recording (engine.onFlipCamera goes null), and this guard backstops it.
    if (recordingRef.current) return;
    setDeviceId(null);
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }, []);

  // ── Video-mode mic warm hold (one prompt per medium on iOS Safari) ──────
  useEffect(() => {
    if (mode !== "video" || cameraBlocked) return;
    if (getMediaDevicesSnapshot().permissionState === "denied") return;
    let cancelled = false;
    let held = false;
    acquireMicStream()
      .then(() => {
        if (cancelled) {
          releaseMicStream();
          return;
        }
        held = true;
      })
      .catch(() => {
        // Denied/unavailable — the record path surfaces its own error.
      });
    return () => {
      cancelled = true;
      if (held) releaseMicStream();
    };
  }, [mode, cameraBlocked]);

  // ── Recording clock ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const h = recordingRef.current;
      if (h) setRecordElapsed(Math.floor(h.getElapsedMs() / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  // ── Capture paths ───────────────────────────────────────────────────────
  const captureBusyRef = useRef(false);
  const capturePhotoWith = useCallback(
    (opts: { fileNamePrefix: string; aspect?: CaptureAspect }) => {
      const video = videoRef.current;
      const lease = leaseRef.current;
      if (!video || !lease || video.videoWidth === 0) return;
      // One capture at a time: a double-tap on the shutter must not produce
      // two near-identical frames.
      if (captureBusyRef.current) return;
      captureBusyRef.current = true;
      // Full-sensor shutter behind the cropped preview (§2 policy 6); the
      // aspect crop (when selected) is applied to that full frame.
      void capturePhotoFromVideo({
        video,
        lease,
        framing: "full-frame",
        quality: PHOTO_JPEG_QUALITY,
        fileNamePrefix: opts.fileNamePrefix,
        allowNativeTakePhoto: false,
      })
        .then(async (result) => {
          const blob = await cropBlobToAspect(
            result.blob,
            opts.aspect ?? "full",
          );
          onPhoto(blob, opts);
          setFlash(true);
          window.setTimeout(() => setFlash(false), 120);
        })
        .catch((err: unknown) => {
          console.error("[capture-camera] shutter capture failed", err);
          // A tapped shutter that produced nothing must say so.
          toast.error("The photo could not be captured — try again.");
        })
        .finally(() => {
          captureBusyRef.current = false;
        });
    },
    [onPhoto],
  );

  const onCapturePhoto = useCallback(
    (opts?: { aspect?: CaptureAspect }) => {
      capturePhotoWith({ fileNamePrefix, aspect: opts?.aspect });
    },
    [capturePhotoWith, fileNamePrefix],
  );

  const onStartRecording = useCallback(() => {
    const lease = leaseRef.current;
    if (!lease) return;
    void (async () => {
      try {
        const handle = await startVideoRecording({
          lease,
          withMic: true,
          sourceFeature: "files",
          label: recordingLabel,
        });
        recordingRef.current = handle;
        setRecordElapsed(0);
        setRecording(true);
        void handle.done
          .then((result) => {
            if (result) {
              const ext = extensionForMime(result.mime);
              onVideo(
                result.blob,
                `${fileNamePrefix}-video-${Date.now()}.${ext}`,
                result.durationMs,
              );
            }
          })
          .catch((err: unknown) => {
            console.error("[capture-camera] video recording failed", err);
            toast.error("The video recording failed.");
          })
          .finally(() => {
            recordingRef.current = null;
            setRecording(false);
          });
      } catch (err) {
        console.error("[capture-camera] video start failed", err);
        toast.error("Could not start the video recording.");
      }
    })();
  }, [recordingLabel, fileNamePrefix, onVideo]);

  const onStopRecording = useCallback(() => {
    void recordingRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => {
      void recordingRef.current?.stop();
    };
  }, []);

  const engine: CaptureCameraEngine = {
    stream,
    videoRef,
    blocked: cameraBlocked
      ? {
          reason: permissionDenied ? "permission-denied" : "not-supported",
        }
      : null,
    onCapturePhoto,
    onStartRecording,
    onStopRecording,
    recording,
    recordElapsedSeconds: recordElapsed,
    onUpload,
    // Hidden while recording: a flip reacquires the lease, which would kill
    // the recording mid-take.
    onFlipCamera:
      numberOfCameras > 1 && !cameraBlocked && !recording
        ? switchCamera
        : null,
  };

  return {
    engine,
    capturePhotoWith,
    flash,
    cameraBlocked,
    permissionDenied,
    videoRef,
    stream,
    recording,
  };
}
