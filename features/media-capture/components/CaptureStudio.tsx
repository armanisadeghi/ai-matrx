"use client";

/**
 * features/media-capture/components/CaptureStudio.tsx
 *
 * The Capture Studio — photo, VIDEO, and AUDIO modes:
 * - photo: live preview (viewport-crop default, full-frame toggle, front
 *   camera mirrored PREVIEW-ONLY) → shutter (usePhotoCapture, canvas
 *   primary) → review → durable `<InlineMediaRef>` by file_id.
 * - video: pinned lease + optional shared-mic clone via `startVideoRecording`
 *   (recording/video-recorder.ts — captureLock, session registry, chunk
 *   journal). Record / pause / resume / stop / cancel; elapsed from the
 *   controller's pause-aware monotonic clock.
 * - audio: same engine via `startAudioRecording` — NOT a parallel recorder.
 *
 * Recovery UX: on open, `listRecoverable()` surfaces interrupted/unsaved
 * journals with LOUD "recovered N of M" phrasing — finish (assemble + save)
 * or discard. Recovery only ever promises chunks the browser emitted.
 *
 * Lifecycle rules honored here:
 * - ONE camera lease per open studio (photo/video modes only; audio mode
 *   releases it), acquired on mount, released on unmount/spec change.
 * - Every local preview is a TRACKED object URL, revoked on retake, replace,
 *   unmount, AND (photos) after the save-swap to the durable render.
 * - Terminal errors are explicit CaptureError kinds — including
 *   unsupported-codec, storage-quota, and lock-takeover for recordings.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  History,
  LifeBuoy,
  Loader2,
  Mic,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  createTrackedObjectUrl,
  revokeTrackedObjectUrl,
} from "@/lib/media/object-url-registry";
import { listDevices } from "@/features/media-devices/deviceManager";
import { useAudioDevices } from "@/features/audio/useAudioDevices";
import { useStreamAudioLevel } from "@/features/audio/useStreamAudioLevel";
import {
  acquireCameraLease,
  subscribeCameraInterruption,
  type CameraLease,
} from "@/features/media-capture/runtime/camera-stream-manager";
import {
  buildAudioCaptureMetadata,
  buildPhotoCaptureMetadata,
  buildVideoCaptureMetadata,
  type CaptureError,
  type CaptureMetadata,
  type CaptureQualityProfile,
  type FramingMode,
  type VisualSourceSettings,
} from "@/features/media-capture/core/capture-types";
import { extensionForMime } from "@/features/media-capture/core/mime-selection";
import { usePhotoCapture } from "@/features/media-capture/hooks/usePhotoCapture";
import { uploadCapture } from "@/features/media-capture/upload/capture-uploader";
import {
  startAudioRecording,
  startVideoRecording,
  type CaptureRecordingHandle,
  type CaptureRecordingResult,
} from "@/features/media-capture/recording/video-recorder";
import {
  StorageQuotaError,
  discardJournal,
  listRecoverable,
  purgeExpired,
  type RecoverableJournal,
} from "@/features/media-capture/recording/chunk-journal";
import { finishJournalRecovery } from "@/features/media-capture/recording/journal-recovery";
import {
  recordCaptureFailure,
  registerLiveCaptureControls,
  type LiveCaptureSaveResult,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { VoiceTroubleshootingModal } from "@/features/audio/components/VoiceTroubleshootingModal";
import { CameraPreview } from "@/features/media-capture/components/CameraPreview";
import {
  CaptureControls,
  type CaptureMode,
  type RecordingUiState,
} from "@/features/media-capture/components/CaptureControls";
import { CaptureReview } from "@/features/media-capture/components/CaptureReview";
import { RecordingHud } from "@/features/media-capture/components/RecordingHud";
import {
  DeviceFallbackInput,
  type DeviceFallbackInputHandle,
  type DeviceFallbackPhoto,
} from "@/features/media-capture/components/DeviceFallbackInput";

type StudioPhase = "starting" | "preview" | "review" | "error";

/** Studio recording ceilings (controller-enforced hard stops). */
const MAX_RECORDING_DURATION_MS = 60 * 60 * 1000; // 1 hour
const MAX_RECORDING_BYTES = 4 * 1024 * 1024 * 1024; // 4 GiB (under the 5 GB transport cap)

interface CapturedDraft {
  kind: "photo" | "video" | "audio";
  file: File;
  previewUrl: string;
  metadata: CaptureMetadata;
  /** LOUD note when the artifact is a partial (environment stop / chunk gap). */
  partialNote: string | null;
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

function classifyRecordingError(err: unknown): CaptureError {
  if (err instanceof StorageQuotaError) {
    return { kind: "storage-quota", message: err.message };
  }
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  if (name === "UnsupportedCodecError") {
    return {
      kind: "unsupported-codec",
      message:
        "This browser cannot record in any supported format. Recording is unavailable here.",
    };
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return {
      kind: "permission-denied",
      message: "Microphone access was denied — recording needs it. Allow it and retry.",
    };
  }
  if (name === "CameraBusyError") {
    return {
      kind: "mic-conflict",
      message: err instanceof Error ? err.message : "The camera is busy recording.",
    };
  }
  return {
    kind: "stream-ended",
    message:
      err instanceof Error ? err.message : "Recording failed — try again.",
  };
}

function toVisualSourceSettings(
  summary: { effective: { width: number | null; height: number | null; frameRate: number | null; facingMode: string | null } } | null,
): VisualSourceSettings {
  const eff = summary?.effective;
  const facing =
    eff?.facingMode === "user" || eff?.facingMode === "environment"
      ? eff.facingMode
      : null;
  return {
    width: eff?.width ?? 0,
    height: eff?.height ?? 0,
    frame_rate: eff?.frameRate ?? null,
    facing_mode: facing,
  };
}

function captureFileName(mime: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `capture-${stamp}.${extensionForMime(mime)}`;
}

/**
 * ONE metadata path for a finished recording — used by the in-studio review
 * flow AND by the out-of-studio salvage (`stopAndSave`). The visual settings
 * are a SNAPSHOT taken when recording started, so a salvage that runs after
 * the camera lease is gone still describes the real source.
 */
function buildRecordingMetadata(args: {
  result: CaptureRecordingResult;
  kind: "video" | "audio";
  sourceFeature: string;
  sourceSettings: VisualSourceSettings;
}): CaptureMetadata {
  if (args.kind === "audio") {
    return buildAudioCaptureMetadata({
      source: "browser-media-devices",
      sourceFeature: args.sourceFeature,
      recorderMimeType: args.result.mime,
    });
  }
  return buildVideoCaptureMetadata({
    source: "browser-media-devices",
    sourceFeature: args.sourceFeature,
    sourceSettings: args.sourceSettings,
    framing: "full-frame", // the recorder records the full stream
    mirroredOutput: false,
    hasAudio: args.result.hasAudio,
    recorderMimeType: args.result.mime,
  });
}

const EMPTY_VISUAL_SETTINGS: VisualSourceSettings = {
  width: 0,
  height: 0,
  frame_rate: null,
  facing_mode: null,
};

export function CaptureStudio({
  sourceFeature = "camera",
  profile = "1080p",
  onSaved,
  className,
}: CaptureStudioProps) {
  const isMobile = useIsMobile();
  const { capturing, capturePhoto } = usePhotoCapture();

  const [mode, setMode] = useState<CaptureMode>("photo");
  const [phase, setPhase] = useState<StudioPhase>("starting");
  const [error, setError] = useState<CaptureError | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [framing, setFraming] = useState<FramingMode>("viewport-crop");
  const [facing, setFacing] = useState<"user" | "environment">(
    isMobile ? "environment" : "user",
  );
  const [captured, setCaptured] = useState<CapturedDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFileId, setSavedFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /**
   * Bumped to force a fresh camera acquisition. Without this, clearing an error
   * (Try again, or switching photo↔video) changed no lease-effect dep, so the
   * effect never re-ran and the studio sat on a blank "starting" skeleton
   * forever with no way out but a page reload.
   */
  const [acquireToken, setAcquireToken] = useState(0);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);

  // ── Recording state (video/audio modes) ───────────────────────────────────
  const [recUi, setRecUi] = useState<RecordingUiState>("idle");
  const [withMic, setWithMic] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [estimatedBytes, setEstimatedBytes] = useState(0);
  /** The composed recording stream, exposed for the HUD's level meter only. */
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(
    null,
  );
  const recordingRef = useRef<CaptureRecordingHandle | null>(null);
  /**
   * Source settings SNAPSHOT taken when recording starts. A salvage
   * (`stopAndSave`) can run after this component unmounted and the camera
   * lease was released, so metadata must never depend on a live lease.
   */
  const visualSettingsRef = useRef<VisualSourceSettings>(EMPTY_VISUAL_SETTINGS);
  /** In-flight salvage for the CURRENT recording — makes stop-and-save
   *  idempotent when the nav guard and the unmount path both fire. */
  const salvageRef = useRef<Promise<LiveCaptureSaveResult> | null>(null);
  /**
   * Stop-the-recording-and-UPLOAD-it for the current recording, or null when
   * nothing is recording. Built at recording start (where the handle, the kind
   * and the source settings are all fixed for the recording's lifetime) so it
   * closes over no component state and can complete AFTER this component
   * unmounts — which is exactly when it matters.
   */
  const salvageFnRef = useRef<(() => Promise<LiveCaptureSaveResult>) | null>(
    null,
  );
  /** Clears this recording's entry in the live-capture controls registry. */
  const unregisterControlsRef = useRef<(() => void) | null>(null);

  // Live mic level off the COMPOSED stream — meters exactly what is recorded
  // (and correctly reads 0 when the user recorded with the mic off).
  const audioLevel = useStreamAudioLevel(recordingStream);

  // ── Recovery (interrupted journals) ──────────────────────────────────────
  const [recoverables, setRecoverables] = useState<RecoverableJournal[]>([]);
  const [recovering, setRecovering] = useState<string | null>(null);

  const leaseRef = useRef<CameraLease | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fallbackRef = useRef<DeviceFallbackInputHandle | null>(null);
  const capturedRef = useRef<CapturedDraft | null>(null);
  useEffect(() => {
    capturedRef.current = captured;
  }, [captured]);

  // Canonical device state — the SAME hook the rail writes through, so a
  // camera chosen in the rail re-acquires the lease here. Never a parallel
  // device store, never raw enumerateDevices.
  const { selectedCameraId } = useAudioDevices();

  const needsCamera = mode !== "audio";

  // ── Camera lease lifecycle — one lease per (deviceId|facing) spec ─────────
  useEffect(() => {
    if (!needsCamera) {
      // Async by convention (same as the acquire path below) — never setState
      // synchronously in the effect body.
      let skipped = false;
      void Promise.resolve().then(() => {
        if (skipped) return;
        setStream(null);
        setPhase((p) => (p === "review" ? p : "preview"));
      });
      return () => {
        skipped = true;
      };
    }
    let cancelled = false;
    let myLease: CameraLease | null = null;
    let unsubscribe: (() => void) | null = null;

    // Async by design (external system: camera acquisition). State updates
    // happen in the promise chain, never synchronously in the effect body.
    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setPhase((p) => (p === "review" ? p : "starting"));
        setError(null);
        return acquireCameraLease({
          profile,
          // An explicit device choice wins everywhere; on mobile with no
          // explicit choice, facingMode selects front/rear.
          ...(selectedCameraId ? { deviceId: selectedCameraId } : {}),
          ...(isMobile && !selectedCameraId ? { facingMode: facing } : {}),
        });
      })
      .then((lease) => {
        if (!lease) return;
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
        const classified = classifyAcquireError(err);
        recordCaptureFailure({ scope: "camera", message: classified.message });
        setError(classified);
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
  }, [profile, selectedCameraId, facing, isMobile, needsCamera, acquireToken]);

  // ── Interruptions are LOUD terminal states while previewing ───────────────
  useEffect(() => {
    return subscribeCameraInterruption((reason) => {
      // Live recordings handle their own interruption (stop + preserve journal
      // inside video-recorder) — don't double-report here.
      if (recordingRef.current) return;
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

  // ── Recovery: surface interrupted journals on studio open ─────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await purgeExpired();
        const found = await listRecoverable();
        if (!cancelled) setRecoverables(found);
      } catch (err) {
        console.error("[CaptureStudio] recovery listing failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Elapsed + size ticker while recording ─────────────────────────────────
  // Both numbers come from the controller (pause-aware monotonic clock and the
  // same projected size the maxBytes hard stop enforces) — never derived here.
  useEffect(() => {
    if (recUi !== "recording" && recUi !== "paused") return;
    const t = setInterval(() => {
      const h = recordingRef.current;
      if (!h) return;
      setElapsedMs(h.getElapsedMs());
      setEstimatedBytes(h.getEstimatedBytes());
    }, 200);
    return () => clearInterval(t);
  }, [recUi]);

  // ── Closing the tab mid-recording must WARN ──────────────────────────────
  //
  // A tab close or reload is the ONE exit this app cannot rescue: there is no
  // time to finalize and upload, so the recording drops to the journal and the
  // user meets a "recovered N of M / interrupted" banner instead. The browser
  // prompt is the only guard available there, so a live recording arms it and
  // a stopped one disarms it immediately. In-app navigation is handled far
  // better by `LiveCaptureIndicator`'s guard (confirm → stop → save) and by
  // this component's unmount salvage.
  useEffect(() => {
    if (recUi !== "recording" && recUi !== "paused") return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [recUi]);

  // ── Revoke any outstanding preview URL + SALVAGE a live recording on unmount
  //
  // A route unmount mid-recording used to stop the recorder and merely preserve
  // the journal, so the user's recording silently became an "Interrupted —
  // only media captured before the interruption can be recovered" banner on
  // their next visit. That is data loss with extra steps.
  //
  // The recorder handle and the uploader are both framework-free, so the
  // recording can be finalized AND uploaded after this component is gone.
  // `stopAndSave` is idempotent, so when the navigation guard already started
  // the save this just joins it. The journal stays intact on failure, so the
  // recovery banner remains the last line of defence — it is no longer the
  // FIRST one.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      revokeTrackedObjectUrl(capturedRef.current?.previewUrl);
      const h = recordingRef.current;
      if (h) {
        console.error(
          "[CaptureStudio] unmounted mid-recording — stopping and saving the recording.",
        );
        h.done.catch(() => undefined);
        const salvage = salvageFnRef.current?.();
        recordingRef.current = null;
        unregisterControlsRef.current?.();
        unregisterControlsRef.current = null;
        salvageFnRef.current = null;
        void salvage
          ?.then(({ partial }) => {
            toast.success(
              partial
                ? "Recording stopped and saved to your captures — it was interrupted, so only the media captured before the interruption is included."
                : "Recording stopped and saved to your captures.",
            );
          })
          .catch((err: unknown) => {
            console.error("[CaptureStudio] unmount salvage failed", err);
            toast.error(
              "Your recording could not be saved automatically. Open the camera to recover it from the interrupted-recording banner.",
            );
          });
      }
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

  // ── Photo shutter ─────────────────────────────────────────────────────────
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
        kind: "photo",
        file: result.file,
        previewUrl: createTrackedObjectUrl(result.blob),
        metadata,
        partialNote: null,
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

  // ── Recording flow (video + audio modes, ONE engine) ─────────────────────
  const acceptRecordingResult = useCallback(
    (result: CaptureRecordingResult, kind: "video" | "audio") => {
      const metadata = buildRecordingMetadata({
        result,
        kind,
        sourceFeature,
        sourceSettings: visualSettingsRef.current,
      });
      const file = new File([result.blob], captureFileName(result.mime), {
        type: result.mime,
      });
      clearDraft();
      setCaptured({
        kind,
        file,
        previewUrl: createTrackedObjectUrl(result.blob),
        metadata,
        partialNote: result.partial
          ? "This recording was interrupted — only the media captured before the interruption is included."
          : null,
      });
      setPhase("review");
    },
    [sourceFeature, clearDraft],
  );

  const handleStartRecording = useCallback(async () => {
    if (recordingRef.current) return;
    const kind: "video" | "audio" = mode === "audio" ? "audio" : "video";
    if (kind === "video" && !leaseRef.current) return;
    setRecUi("starting");
    setError(null);
    setElapsedMs(0);
    setEstimatedBytes(0);
    try {
      const common = {
        maxDurationMs: MAX_RECORDING_DURATION_MS,
        maxBytes: MAX_RECORDING_BYTES,
        sourceFeature,
        onAutoStopped: (reason: string) => {
          if (reason === "takeover") {
            toast.error(
              "Recording discarded — another recording took over the microphone.",
            );
          } else if (reason === "max-duration") {
            toast.warning("Recording stopped — maximum duration reached.");
          } else if (reason === "max-bytes") {
            toast.warning("Recording stopped — maximum size reached.");
          } else {
            toast.warning(
              "Recording stopped — the device or page was interrupted. Captured media was preserved.",
            );
          }
        },
      };
      const handle =
        kind === "video"
          ? await startVideoRecording({
              lease: leaseRef.current as CameraLease,
              withMic,
              label: "Camera recording",
              ...common,
            })
          : await startAudioRecording({ label: "Audio recording", ...common });
      recordingRef.current = handle;
      salvageRef.current = null;
      // Snapshot the source settings while the lease is guaranteed live — a
      // salvage after unmount has no lease to read.
      const sourceSettings =
        kind === "video"
          ? toVisualSourceSettings(leaseRef.current?.getTrackSummary() ?? null)
          : EMPTY_VISUAL_SETTINGS;
      visualSettingsRef.current = sourceSettings;

      // Stop → assemble from the journal → UPLOAD, in one idempotent step.
      // Everything it needs is captured here, so it survives this component.
      const salvage = (): Promise<LiveCaptureSaveResult> => {
        const inFlight = salvageRef.current;
        if (inFlight) return inFlight;
        const started = (async (): Promise<LiveCaptureSaveResult> => {
          const result = await handle.stop();
          const metadata = buildRecordingMetadata({
            result,
            kind,
            sourceFeature,
            sourceSettings,
          });
          const file = new File([result.blob], captureFileName(result.mime), {
            type: result.mime,
          });
          const uploaded = await uploadCapture({ file, capture: metadata });
          // uploadCapture throws when fileId is absent — this narrows, it
          // never defaults.
          return { fileId: uploaded.fileId as string, partial: result.partial };
        })();
        salvageRef.current = started;
        return started;
      };
      salvageFnRef.current = salvage;

      // Publish stop-and-SAVE controls so the app-wide indicator and the
      // navigation guard can rescue this recording from outside the studio.
      unregisterControlsRef.current?.();
      unregisterControlsRef.current = registerLiveCaptureControls(
        handle.captureId,
        {
          pause: () => {
            handle.pause();
            setRecUi("paused");
          },
          resume: () => {
            handle.resume();
            setRecUi("recording");
          },
          returnPath:
            typeof window === "undefined" ? "/camera" : window.location.pathname,
          stopAndSave: salvage,
        },
      );
      // Read-only observation for the level meter — the engine owns every
      // track's lifetime; we never stop or mutate this stream.
      setRecordingStream(handle.getRecordingStream());
      setRecUi("recording");
      void handle.done
        .then((result) => {
          recordingRef.current = null;
          unregisterControlsRef.current?.();
          unregisterControlsRef.current = null;
          salvageFnRef.current = null;
          // After an unmount the salvage path owns this result — building a
          // review draft here would strand a tracked object URL with nothing
          // left alive to revoke it.
          if (!mountedRef.current) return;
          setRecordingStream(null);
          setRecUi("idle");
          if (result) {
            acceptRecordingResult(result, kind);
          } else if (handle.endReason() === "takeover") {
            setError({
              kind: "lock-takeover",
              message:
                "This recording was discarded because another recording took over.",
            });
            setPhase((p) => (p === "review" ? p : "error"));
          }
        })
        .catch((err: unknown) => {
          recordingRef.current = null;
          unregisterControlsRef.current?.();
          unregisterControlsRef.current = null;
          salvageFnRef.current = null;
          console.error("[CaptureStudio] recording failed", err);
          if (!mountedRef.current) return;
          setRecordingStream(null);
          setRecUi("idle");
          const classified = classifyRecordingError(err);
          recordCaptureFailure({
            scope: "recording",
            message: classified.message,
          });
          setError(classified);
          setPhase("error");
        });
    } catch (err) {
      recordingRef.current = null;
      unregisterControlsRef.current?.();
      unregisterControlsRef.current = null;
      salvageFnRef.current = null;
      setRecordingStream(null);
      setRecUi("idle");
      console.error("[CaptureStudio] recording start failed", err);
      const classified = classifyRecordingError(err);
      recordCaptureFailure({ scope: "recording", message: classified.message });
      setError(classified);
      setPhase("error");
    }
  }, [mode, withMic, sourceFeature, acceptRecordingResult]);

  const handlePauseResume = useCallback(() => {
    const h = recordingRef.current;
    if (!h) return;
    if (h.getState() === "paused") {
      h.resume();
      setRecUi("recording");
    } else {
      h.pause();
      setRecUi("paused");
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    // Result delivery flows through handle.done (wired at start).
    recordingRef.current?.stop().catch(() => undefined);
  }, []);

  const handleCancelRecording = useCallback(() => {
    const h = recordingRef.current;
    if (!h) return;
    void h.cancel().then(() => {
      recordingRef.current = null;
      unregisterControlsRef.current?.();
      unregisterControlsRef.current = null;
      salvageFnRef.current = null;
      setRecordingStream(null);
      setRecUi("idle");
    });
  }, []);

  // ── Recovery actions ──────────────────────────────────────────────────────
  const handleFinishRecovery = useCallback(
    async (entry: RecoverableJournal) => {
      const id = entry.manifest.capture_id;
      setRecovering(id);
      try {
        // Shared assemble+save flow (recording/journal-recovery.ts) — the
        // /camera library's Recovery section runs the exact same code.
        const result = await finishJournalRecovery(entry);
        setRecoverables((prev) =>
          prev.filter((r) => r.manifest.capture_id !== id),
        );
        if (result.outcome === "empty") {
          toast.error("Nothing recoverable — no media chunks survived.");
          return;
        }
        // LOUD partial phrasing — recovery never pretends to be whole.
        toast.success(`${result.recoveredNote} — saved to your captures.`);
        onSaved?.(result.fileId);
      } catch (err) {
        console.error("[CaptureStudio] recovery failed", err);
        toast.error(
          err instanceof Error ? err.message : "Recovering the recording failed.",
        );
      } finally {
        setRecovering(null);
      }
    },
    [onSaved],
  );

  const handleDiscardRecovery = useCallback(async (captureId: string) => {
    try {
      await discardJournal(captureId);
    } catch (err) {
      console.error("[CaptureStudio] recovery discard failed", err);
    }
    setRecoverables((prev) =>
      prev.filter((r) => r.manifest.capture_id !== captureId),
    );
  }, []);

  // ── Shared review actions ─────────────────────────────────────────────────
  const handleFallbackPhoto = useCallback(
    (photo: DeviceFallbackPhoto) => {
      clearDraft();
      setCaptured({
        kind: "photo",
        file: photo.file,
        previewUrl: createTrackedObjectUrl(photo.blob),
        metadata: photo.metadata,
        partialNote: null,
      });
      setPhase("review");
    },
    [clearDraft],
  );

  const handleRetake = useCallback(() => {
    clearDraft();
    setPhase(
      !needsCamera || leaseRef.current ? "preview" : error ? "error" : "starting",
    );
  }, [clearDraft, error, needsCamera]);

  const handleDownload = useCallback(() => {
    const draft = capturedRef.current;
    if (!draft || !draft.previewUrl) return;
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
      if (draft.kind === "photo") {
        // Save-swap: the durable InlineMediaRef renders now — the local
        // ephemeral preview URL is done. (Video/audio keep local playback
        // for review; their URL is revoked on retake/unmount.)
        setCaptured((prev) => {
          revokeTrackedObjectUrl(prev?.previewUrl);
          return prev ? { ...prev, previewUrl: "" } : prev;
        });
      }
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

  /**
   * Re-attempt camera acquisition after a terminal error — the way OUT of a
   * permission-denied / device-busy state once the user has fixed it in their
   * browser settings, without reloading the page.
   */
  const handleRetryCamera = useCallback(() => {
    setError(null);
    setPhase("starting");
    setAcquireToken((t) => t + 1);
  }, []);

  const handleModeChange = useCallback(
    (next: CaptureMode) => {
      if (recordingRef.current) return; // locked while recording
      setMode(next);
      // Leaving an error state must actually retry: clearing `error` alone
      // changes no lease-effect dep, so the acquire token is what re-runs it.
      if (phase === "error") {
        setError(null);
        setPhase("starting");
        setAcquireToken((t) => t + 1);
      }
    },
    [phase],
  );

  const showFallbackOffer =
    mode === "photo" &&
    (error?.kind === "permission-denied" || error?.kind === "not-supported");

  const isRecordingLive = recUi === "recording" || recUi === "paused";

  const savedFolderLabel =
    captured?.kind === "video"
      ? "Captures/Videos"
      : captured?.kind === "audio"
        ? "Captures/Audio"
        : "Captures/Photos";

  return (
    <div className={`flex h-full min-h-0 flex-col ${className ?? ""}`}>
      {recoverables.length > 0 && phase !== "review" && (
        <div className="mb-2 shrink-0 rounded-md border border-border bg-card px-3 py-2">
          {recoverables.map((entry) => (
            <div
              key={entry.manifest.capture_id}
              className="flex items-center gap-2 py-1 text-xs"
            >
              <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {entry.interrupted ? "Interrupted" : "Unsaved"}{" "}
                {entry.manifest.mime?.startsWith("audio/") ? "audio" : "video"}{" "}
                recording from{" "}
                {new Date(entry.manifest.created_at).toLocaleString()} —{" "}
                {entry.manifest.last_sequence + 1} saved segment(s),{" "}
                {Math.round(entry.manifest.emitted_bytes / 1024)} KB.
                {entry.interrupted &&
                  " Only media captured before the interruption can be recovered."}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={recovering !== null}
                onClick={() => void handleFinishRecovery(entry)}
              >
                {recovering === entry.manifest.capture_id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Finish & save"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={recovering !== null}
                onClick={() => void handleDiscardRecovery(entry.manifest.capture_id)}
                aria-label="Discard recovered recording"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {phase === "review" && captured ? (
        <CaptureReview
          kind={captured.kind}
          previewUrl={captured.previewUrl}
          fileName={captured.file.name}
          saving={saving}
          savedFileId={savedFileId}
          uploadError={uploadError}
          partialNote={captured.partialNote}
          savedFolderLabel={savedFolderLabel}
          onRetake={handleRetake}
          onDownload={handleDownload}
          onSave={() => void handleSave()}
        />
      ) : (
        <>
          <div
            ref={containerRef}
            // The stage is the point of the screen — it never gets squeezed
            // below a usable height by the control strip wrapping under it.
            className="relative min-h-[240px] flex-1 overflow-hidden rounded-lg border border-border bg-muted/30 sm:min-h-[280px]"
          >
            {needsCamera && phase === "starting" && (
              <Skeleton className="h-full w-full" />
            )}
            {needsCamera && phase === "preview" && (
              <CameraPreview
                stream={stream}
                framing={mode === "video" ? "full-frame" : framing}
                mirror={
                  !isRecordingLive && (isMobile ? facing === "user" : true)
                }
                videoRef={videoRef}
              />
            )}
            {!needsCamera && phase !== "error" && (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                {/* Ceremonial recorder stage (the transcripts recorder's
                    pulsing circle), scaled by the LIVE mic level. */}
                <div
                  className={`relative flex h-28 w-28 items-center justify-center rounded-full transition-colors ${
                    isRecordingLive
                      ? "bg-destructive/10"
                      : "bg-primary/10"
                  }`}
                >
                  {isRecordingLive && recUi !== "paused" && (
                    <span
                      className="absolute inset-0 rounded-full bg-destructive/15"
                      style={{
                        transform: `scale(${1 + audioLevel / 160})`,
                        transition: "transform 75ms",
                      }}
                      aria-hidden
                    />
                  )}
                  <Mic
                    className={`relative h-12 w-12 ${
                      isRecordingLive
                        ? "text-destructive"
                        : "text-primary"
                    }`}
                  />
                </div>
                {!isRecordingLive && (
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Audio-only capture. The microphone starts when you press
                    Record — nothing is listening until then.
                  </p>
                )}
              </div>
            )}
            {phase === "error" && error && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  {error.message}
                </p>
                {/* Every terminal error gets a way forward — a retry for the
                    user who just fixed the grant, the device fallback where a
                    photo can still be taken, and the shared diagnostics. */}
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {needsCamera && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9"
                      onClick={handleRetryCamera}
                    >
                      <RefreshCw className="mr-1.5 h-4 w-4" />
                      Try again
                    </Button>
                  )}
                  {showFallbackOffer && (
                    <Button
                      size="sm"
                      className="h-9"
                      onClick={() => fallbackRef.current?.open()}
                    >
                      <Camera className="mr-1.5 h-4 w-4" />
                      Use device camera
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9"
                    onClick={() => setShowTroubleshooting(true)}
                  >
                    <LifeBuoy className="mr-1.5 h-4 w-4" />
                    Get help
                  </Button>
                </div>
              </div>
            )}
            {isRecordingLive && needsCamera && (
              <span className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-card/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
                <span
                  className={`h-2 w-2 rounded-full ${recUi === "paused" ? "bg-muted-foreground" : "animate-pulse bg-destructive"}`}
                />
                {recUi === "paused" ? "Paused" : "REC"}
              </span>
            )}
          </div>

          {isRecordingLive ? (
            <RecordingHud
              kind={mode === "audio" ? "audio" : "video"}
              paused={recUi === "paused"}
              elapsedMs={elapsedMs}
              maxDurationMs={MAX_RECORDING_DURATION_MS}
              estimatedBytes={estimatedBytes}
              maxBytes={MAX_RECORDING_BYTES}
              audioLevel={audioLevel}
              hasAudio={mode === "audio" || withMic}
              onPauseResume={handlePauseResume}
              onStop={handleStopRecording}
              onCancel={handleCancelRecording}
              className="shrink-0 pb-safe pt-3"
            />
          ) : (
            <CaptureControls
              mode={mode}
              onModeChange={handleModeChange}
              modeLocked={isRecordingLive || recUi === "starting"}
              framing={framing}
              onFramingChange={setFraming}
              isMobile={isMobile}
              facing={facing}
              onToggleFacing={() =>
                setFacing((f) => (f === "user" ? "environment" : "user"))
              }
              onShutter={() => void handleShutter()}
              shutterDisabled={phase !== "preview" || capturing}
              capturing={capturing}
              recordingState={recUi}
              withMic={withMic}
              onToggleMic={() => setWithMic((v) => !v)}
              onStartRecording={() => void handleStartRecording()}
              recordDisabled={
                mode === "video" ? phase !== "preview" : phase === "error"
              }
              blockedReason={
                phase === "error"
                  ? "Camera unavailable — fix access above, or switch to Audio."
                  : needsCamera && phase === "starting"
                    ? "Starting the camera…"
                    : null
              }
            />
          )}
        </>
      )}

      <VoiceTroubleshootingModal
        isOpen={showTroubleshooting}
        onClose={() => setShowTroubleshooting(false)}
        error={error?.message ?? null}
        errorCode={error?.kind ?? null}
      />

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
