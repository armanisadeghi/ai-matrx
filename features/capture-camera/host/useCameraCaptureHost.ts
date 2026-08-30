"use client";

/**
 * useCameraCaptureHost — APP-SIDE lease-integration wiring for
 * `@ai-matrx/capture` (collapsed 2026-08-30 in the C22/C23 retrofit).
 *
 * WHAT THIS FILE IS ALLOWED TO BE (C22): injection of values and identity
 * only. The portable hard parts — aspect crop, gUM-error classification, the
 * flip-cycling algorithm, the warm-mic quirk handling, the whole default
 * engine — live in the package (`@ai-matrx/capture/react`, `src/engine/`).
 * What remains here, each with its justification, is the coupling to THIS
 * app's cross-feature media runtime, which spans the PDF scanner, `/camera`
 * studio, voice notes and diagnostics and therefore stays host-side:
 *
 * - LEASE LIFECYCLE: `acquireCameraLease` (the app-wide refcounted camera
 *   manager — combined-prompt policy, reconfigure events, recording pins).
 * - DEVICE PERSISTENCE: the flip target is persisted via
 *   `useAudioDevices().setCamera` so the same camera comes back next session.
 * - MIC WARM HOLD: holds the APP's mic singleton (`@ai-matrx/browser-audio/core`)
 *   — the same warm stream voice notes and the recorder share; using the
 *   package's own warm-mic manager here would create two competing mic
 *   holders. The four iOS recovery branches live in that singleton (and,
 *   for runtime-less hosts, verbatim in the package's `engine/warm-mic.ts`).
 * - CAPTURE/RECORD PATHS: `capturePhotoFromVideo` + `startVideoRecording`
 *   (the app's canonical recorder with chunk journal + diagnostics registry).
 * - TOASTS: the app's notification sink for loud failures.
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
import { acquireMicStream, releaseMicStream } from "@ai-matrx/browser-audio/core";
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
import {
  classifyCameraBlockReason,
  cropBlobToAspect,
  nextCameraDevice,
  PHOTO_JPEG_QUALITY,
} from "@ai-matrx/capture/react";

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
  /** Development-only deterministic camera inputs for browser QA. */
  qaPermissionDenied?: boolean;
  qaImageUrl?: string | null;
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
    qaPermissionDenied = false,
    qaImageUrl = null,
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

  // ── Lease lifecycle — KEPT (C22): binds the chrome to the app's ONE camera
  //    manager (refcounted leases, combined-prompt policy, reconfigure
  //    events shared with the PDF scanner and /camera studio). ─────────────
  useEffect(() => {
    let cancelled = false;
    let myLease: CameraLease | null = null;
    let fixtureStream: MediaStream | null = null;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      if (qaPermissionDenied) {
        setStream(null);
        setPermissionDenied(true);
        setNotSupported(false);
        return;
      }
      if (qaImageUrl) {
        try {
          const image = new Image();
          image.decoding = "async";
          image.src = qaImageUrl;
          await image.decode();
          if (cancelled) return;
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, image.naturalWidth);
          canvas.height = Math.max(1, image.naturalHeight);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("QA camera fixture needs a 2D canvas");
          context.drawImage(image, 0, 0);
          fixtureStream = canvas.captureStream(5);
          setStream(fixtureStream);
          setPermissionDenied(false);
          setNotSupported(false);
          return;
        } catch (err) {
          if (cancelled) return;
          console.error("[capture-camera] QA image fixture failed", err);
          setNotSupported(true);
          return;
        }
      }
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
            ...(deviceId
              ? { deviceId }
              : { facingMode: "environment" as const }),
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
        // Classification is the PACKAGE's branch — never re-implemented here.
        if (classifyCameraBlockReason(err) === "permission-denied") {
          setPermissionDenied(true);
        } else {
          setNotSupported(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      fixtureStream?.getTracks().forEach((track) => track.stop());
      if (myLease) {
        myLease.release();
        if (leaseRef.current === myLease) leaseRef.current = null;
      }
      setStream(null);
    };
  }, [deviceId, qaImageUrl, qaPermissionDenied]);

  const cameraBlocked = notSupported || permissionDenied;

  // ── Camera flip — KEPT (C22) for the two host facts it injects: the app's
  //    device snapshot and the persisted preferred camera (setCamera). The
  //    cycling algorithm itself is the package's `nextCameraDevice`. ───────
  const { setCamera } = useAudioDevices();
  const switchCamera = useCallback(() => {
    // Flipping reacquires the lease and stops the current tracks — doing it
    // mid-recording would kill the recording. The button is hidden while
    // recording (engine.onFlipCamera goes null), and this guard backstops it.
    if (recordingRef.current) return;
    const cams = getMediaDevicesSnapshot().cameras;
    const current =
      deviceId ??
      leaseRef.current?.stream.getVideoTracks()[0]?.getSettings().deviceId ??
      null;
    const next = nextCameraDevice(cams, current);
    if (next) {
      setDeviceId(next.deviceId);
      setCamera(next.deviceId, next.label);
    }
  }, [deviceId, setCamera]);

  // ── Video-mode mic warm hold — KEPT (C22): this holds the APP's shared
  //    mic singleton (voice notes + recorder share the same warm grant); a
  //    second warm-mic manager here would fight it. The quirk branches live
  //    in that singleton — and verbatim in the package for other hosts. ────
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

  // ── Recording clock — KEPT (C22): reads the HOST recorder handle's
  //    pause-aware monotonic clock (`getElapsedMs`), which only exists here. ─
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const h = recordingRef.current;
      if (h) setRecordElapsed(Math.floor(h.getElapsedMs() / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  // ── Capture paths — KEPT (C22): they call the app's canonical photo and
  //    recorder pipelines (journal, diagnostics, lease pinning). The aspect
  //    crop is the package's `cropBlobToAspect`. ───────────────────────────
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
      numberOfCameras > 1 && !cameraBlocked && !recording ? switchCamera : null,
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
