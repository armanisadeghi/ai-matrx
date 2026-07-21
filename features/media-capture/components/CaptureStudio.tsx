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

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AlertTriangle, Camera, History, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
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
import { recordCaptureFailure } from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { CameraPreview } from "@/features/media-capture/components/CameraPreview";
import {
  CaptureControls,
  type CaptureMode,
  type RecordingUiState,
} from "@/features/media-capture/components/CaptureControls";
import { CaptureReview } from "@/features/media-capture/components/CaptureReview";
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
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [captured, setCaptured] = useState<CapturedDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFileId, setSavedFileId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Recording state (video/audio modes) ───────────────────────────────────
  const [recUi, setRecUi] = useState<RecordingUiState>("idle");
  const [withMic, setWithMic] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const recordingRef = useRef<CaptureRecordingHandle | null>(null);

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

  const devices = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    getMediaDevicesSnapshot,
  );

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
          ...(deviceId && !isMobile ? { deviceId } : {}),
          ...(isMobile ? { facingMode: facing } : {}),
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
  }, [profile, deviceId, facing, isMobile, needsCamera]);

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

  // ── Elapsed ticker while recording ────────────────────────────────────────
  useEffect(() => {
    if (recUi !== "recording" && recUi !== "paused") return;
    const t = setInterval(() => {
      const h = recordingRef.current;
      if (h) setElapsedMs(h.getElapsedMs());
    }, 200);
    return () => clearInterval(t);
  }, [recUi]);

  // ── Revoke any outstanding preview URL + kill a live recording on unmount ─
  useEffect(() => {
    return () => {
      revokeTrackedObjectUrl(capturedRef.current?.previewUrl);
      const h = recordingRef.current;
      if (h) {
        // Route unmount mid-recording: stop and PRESERVE the journal — the
        // recovery banner offers it on the next open.
        console.error(
          "[CaptureStudio] unmounted mid-recording — stopping and preserving the journal.",
        );
        recordingRef.current = null;
        h.done.catch(() => undefined);
        void h.stop().catch(() => undefined);
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
      const metadata: CaptureMetadata =
        kind === "video"
          ? buildVideoCaptureMetadata({
              source: "browser-media-devices",
              sourceFeature,
              sourceSettings: toVisualSourceSettings(
                leaseRef.current?.getTrackSummary() ?? null,
              ),
              framing: "full-frame", // the recorder records the full stream
              mirroredOutput: false,
              hasAudio: result.hasAudio,
              recorderMimeType: result.mime,
            })
          : buildAudioCaptureMetadata({
              source: "browser-media-devices",
              sourceFeature,
              recorderMimeType: result.mime,
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
      setRecUi("recording");
      void handle.done
        .then((result) => {
          recordingRef.current = null;
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
          setRecUi("idle");
          console.error("[CaptureStudio] recording failed", err);
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

  const handleModeChange = useCallback(
    (next: CaptureMode) => {
      if (recordingRef.current) return; // locked while recording
      setMode(next);
      setError(null);
      if (phase === "error") setPhase("starting");
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
            className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30"
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
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                {isRecordingLive ? (
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${recUi === "paused" ? "bg-muted-foreground" : "animate-pulse bg-destructive"}`}
                    />
                    {recUi === "paused" ? "Paused" : "Recording audio…"}
                  </span>
                ) : (
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Audio-only capture — the microphone starts when you hit
                    Record.
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
                {showFallbackOffer && (
                  <Button size="sm" onClick={() => fallbackRef.current?.open()}>
                    <Camera className="mr-1.5 h-4 w-4" />
                    Use device camera
                  </Button>
                )}
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
            cameras={devices.cameras}
            selectedDeviceId={deviceId}
            onSelectDevice={setDeviceId}
            onShutter={() => void handleShutter()}
            shutterDisabled={phase !== "preview" || capturing}
            capturing={capturing}
            recordingState={recUi}
            elapsedMs={elapsedMs}
            withMic={withMic}
            onToggleMic={() => setWithMic((v) => !v)}
            onStartRecording={() => void handleStartRecording()}
            onPauseResume={handlePauseResume}
            onStopRecording={handleStopRecording}
            onCancelRecording={handleCancelRecording}
            recordDisabled={
              mode === "video" ? phase !== "preview" : phase === "error"
            }
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
