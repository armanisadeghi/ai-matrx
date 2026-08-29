"use client";

/**
 * IntakeCaptureScreen — the full-screen camera-first capture surface of the
 * intake app (W4), rebuilt from the proven prototype flow
 * (/projects/ebay-store-management/PROTOTYPE-CONCEPTS.md §3) onto the C1
 * `commerce` tables.
 *
 * Platform pieces reused, never reimplemented: camera runtime
 * (`acquireCameraLease` / `CameraPreview` / `capturePhotoFromVideo` /
 * `startVideoRecording`), the ONE QR decoder via `useQrAutoScan`, the
 * canonical recorder behind `VoiceNoteButton`, `NotesPanel`, `MediaPager`,
 * `CaptureThumb`, `fileHandler` (through the feature's uploads.ts).
 *
 * The §2 policies on this surface:
 * - Full-sensor shutter behind the cropped preview (policy 6): the preview
 *   is `viewport-crop`, the capture is `framing: "full-frame"` — the
 *   pipeline receives everything the sensor saw.
 * - QR dedupe BY ABSENCE (policy 2): `useQrAutoScan` re-fires a code only
 *   after 4 s out of frame; `currentCode` is passed null so deliberately
 *   re-scanning the same code starts the next unit as a NEW asset.
 * - Hide-all-controls with honesty chips (P17): the Eye toggle hides every
 *   control except itself, the recording timer and the QR confirmation.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  Camera as CameraIcon,
  Check,
  Eye,
  EyeOff,
  FileAudio,
  LayoutGrid,
  Loader2,
  PackagePlus,
  Play,
  ScanLine,
  Scissors,
  SwitchCamera,
  Trash2,
  Video,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
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
import {
  startVideoRecording,
  type CaptureRecordingHandle,
} from "@/features/media-capture/recording/video-recorder";
import { extensionForMime } from "@/features/media-capture/core/mime-selection";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
// Prototype-proven leaf components, generic by props — shared until the
// prototype feature is retired, at which point they move here.
import { NotesPanel } from "@/features/product-capture/components/NotesPanel";
import { VoiceNoteButton } from "@/features/product-capture/components/VoiceNoteButton";
import { MediaPager } from "@/features/product-capture/components/MediaPager";
import { useQrAutoScan } from "@/features/product-capture/hooks/useQrAutoScan";

import type { PendingIntakeArtifact } from "../types";
import { useIntakeSession } from "../hooks/useIntakeSession";

const PHOTO_JPEG_QUALITY = 0.92;

export interface IntakeCaptureScreenProps {
  /** Open with this asset current (the `?asset=` deep link). */
  initialAssetId?: string | null;
}

export function IntakeCaptureScreen({
  initialAssetId = null,
}: IntakeCaptureScreenProps) {
  const router = useRouter();
  const session = useIntakeSession({ initialAssetId });

  // ── Camera lease (scanner contract) ──────────────────────────────────────
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [notSupported, setNotSupported] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const leaseRef = useRef<CameraLease | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);

  const devices = useSyncExternalStore(
    subscribeMediaDevices,
    getMediaDevicesSnapshot,
    getMediaDevicesSnapshot,
  );
  const numberOfCameras = devices.cameras.length;

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
            leaseRef.current?.stream.getVideoTracks()[0]?.getSettings()
              .deviceId,
        );
    const next = cams[(Math.max(currentIdx, 0) + 1) % cams.length];
    if (next) setDeviceId(next.deviceId);
  }, [deviceId]);

  // ── Capture modes ────────────────────────────────────────────────────────
  const [mediaMode, setMediaMode] = useState<"photo" | "video">("photo");
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const recordingRef = useRef<CaptureRecordingHandle | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceStartedAtRef = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const h = recordingRef.current;
      if (h) setRecordElapsed(Math.floor(h.getElapsedMs() / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  const takePhoto = useCallback(
    (opts: { isDelineator?: boolean } = {}) => {
      const video = videoRef.current;
      const lease = leaseRef.current;
      if (!video || !lease || video.videoWidth === 0) return;
      // Full-sensor shutter behind the cropped preview (§2 policy 6).
      void capturePhotoFromVideo({
        video,
        lease,
        framing: "full-frame",
        quality: PHOTO_JPEG_QUALITY,
        fileNamePrefix: opts.isDelineator ? "delineator" : "intake",
        allowNativeTakePhoto: false,
      })
        .then((result) => {
          session.addPhoto(result.blob, opts);
          setFlash(true);
          window.setTimeout(() => setFlash(false), 120);
        })
        .catch((err: unknown) => {
          console.error("[commerce-intake] shutter capture failed", err);
        });
    },
    [session],
  );

  const startVideo = useCallback(async () => {
    const lease = leaseRef.current;
    if (!lease) return;
    try {
      const handle = await startVideoRecording({
        lease,
        withMic: true,
        sourceFeature: "files",
        label: "Intake video",
      });
      recordingRef.current = handle;
      setRecordElapsed(0);
      setRecording(true);
      void handle.done
        .then((result) => {
          if (result) {
            const ext = extensionForMime(result.mime);
            session.addVideo(
              result.blob,
              `intake-video-${Date.now()}.${ext}`,
              result.durationMs,
            );
          }
        })
        .catch((err: unknown) => {
          console.error("[commerce-intake] video recording failed", err);
          toast.error("The video recording failed.");
        })
        .finally(() => {
          recordingRef.current = null;
          setRecording(false);
        });
    } catch (err) {
      console.error("[commerce-intake] video start failed", err);
      toast.error("Could not start the video recording.");
    }
  }, [session]);

  const stopVideo = useCallback(() => {
    void recordingRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => {
      void recordingRef.current?.stop();
    };
  }, []);

  const onShutter = useCallback(() => {
    if (mediaMode === "photo") {
      takePhoto();
    } else if (recording) {
      stopVideo();
    } else {
      void startVideo();
    }
  }, [mediaMode, recording, takePhoto, startVideo, stopVideo]);

  const handleFallbackChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      session.addPhoto(file);
    },
    [session],
  );

  // ── Voice notes (duration measured for the artifact row's CHECK) ─────────
  const onVoiceActiveChange = useCallback((active: boolean) => {
    setVoiceActive(active);
    if (active) voiceStartedAtRef.current = Date.now();
  }, []);

  const onVoiceComplete = useCallback(
    (blob: Blob) => {
      const durationMs = Math.max(1, Date.now() - voiceStartedAtRef.current);
      session.addAudioNote(blob, durationMs);
    },
    [session],
  );

  // ── QR mode (serialized) vs untracked ────────────────────────────────────
  const qrMode = session.captureMode === "serialized";
  const [qrFlash, setQrFlash] = useState<string | null>(null);
  const qrFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleQrMode = useCallback(() => {
    session.setCaptureMode(qrMode ? "untracked" : "serialized");
  }, [session, qrMode]);

  const onQrCode = useCallback(
    (code: string) => {
      void session.onQrCode(code).then(() => {
        navigator.vibrate?.(80);
        setQrFlash(code);
        if (qrFlashTimerRef.current) clearTimeout(qrFlashTimerRef.current);
        qrFlashTimerRef.current = setTimeout(() => setQrFlash(null), 1600);
      });
    },
    [session],
  );

  // Dedupe is BY ABSENCE only (the hook's 4 s out-of-frame rule) —
  // `currentCode: null` so a deliberate re-scan of the same code after
  // absence starts the NEXT UNIT of that product as a new asset.
  useQrAutoScan({
    videoRef,
    enabled: qrMode && !cameraBlocked && !recording,
    currentCode: null,
    onCode: onQrCode,
  });

  useEffect(() => {
    return () => {
      if (qrFlashTimerRef.current) clearTimeout(qrFlashTimerRef.current);
    };
  }, []);

  // ── Panels ───────────────────────────────────────────────────────────────
  const [notesOpen, setNotesOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] =
    useState<PendingIntakeArtifact | null>(null);
  const [controlsHidden, setControlsHidden] = useState(false);
  const toggleControls = useCallback(() => {
    setControlsHidden((h) => {
      if (!h) setNotesOpen(false);
      return !h;
    });
  }, []);

  const { currentAsset, artifacts } = session;
  const photoCount = artifacts.filter(
    (a) => a.kind === "photo" && !a.isDelineator,
  ).length;
  const pagerMedia = artifacts
    .filter((a) => a.kind !== "audio")
    .map((a) => ({
      key: a.localId,
      kind: a.kind === "video" ? ("video" as const) : ("photo" as const),
      fileId: a.fileId,
      previewUrl: a.previewUrl,
    }));
  const itemLabel = qrMode
    ? currentAsset
      ? (currentAsset.qrCode ?? `Item ${session.currentAssetSeq}`)
      : "New item"
    : "Untracked stream";

  const shutterDisabled =
    cameraBlocked || voiceActive || session.organizationId === null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Full-bleed stage: viewport-crop preview, FULL-SENSOR shutter. */}
      <div className="absolute inset-0">
        <CameraPreview
          stream={stream}
          framing="viewport-crop"
          videoRef={videoRef}
        />
      </div>
      {flash && <div className="absolute inset-0 z-20 bg-white/70" />}

      {/* Top bar */}
      {!controlsHidden && (
        <div className="absolute inset-x-0 top-0 z-30 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3 pt-safe">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white"
            // Always land on the assets list — the overlay covers the whole
            // shell, so router.back() could strand the user.
            onClick={() => router.push("/commerce/intake/assets")}
            aria-label="Close capture and open the intake assets list"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-semibold text-white">
              {itemLabel}
            </p>
            <p className="text-[11px] text-white/70">
              {photoCount === 0
                ? "No photos yet"
                : `${photoCount} photo${photoCount === 1 ? "" : "s"}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white",
              qrMode && "bg-primary text-primary-foreground hover:bg-primary",
            )}
            onClick={toggleQrMode}
            aria-label={
              qrMode
                ? "Switch to untracked capture"
                : "Switch to QR (serialized) capture"
            }
            aria-pressed={qrMode}
          >
            <ScanLine className="h-5 w-5" />
          </Button>
          {numberOfCameras > 1 && !cameraBlocked && (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full text-white hover:bg-white/10 hover:text-white"
              onClick={switchCamera}
              aria-label="Switch camera"
            >
              <SwitchCamera className="h-5 w-5" />
            </Button>
          )}
        </div>
      )}

      {/* Hide/show controls — always present, same spot in both states. */}
      <button
        type="button"
        onClick={toggleControls}
        aria-label={controlsHidden ? "Show controls" : "Hide controls"}
        aria-pressed={controlsHidden}
        className={cn(
          "absolute right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors",
          controlsHidden
            ? "top-14 mt-safe bg-black/50 hover:bg-black/70"
            : "top-14 mt-safe bg-white/10 hover:bg-white/20",
        )}
      >
        {controlsHidden ? (
          <Eye className="h-5 w-5" />
        ) : (
          <EyeOff className="h-5 w-5" />
        )}
      </button>

      {/* QR feedback — an honesty chip; survives hide-controls. */}
      {qrMode && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-30 mt-safe flex justify-center">
          {qrFlash ? (
            <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-lg">
              <Check className="h-4 w-4" />
              {qrFlash}
            </span>
          ) : (
            !controlsHidden && (
              <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80">
                QR mode — scan a code to start its item
              </span>
            )
          )}
        </div>
      )}

      {/* Recording timer — an honesty chip; survives hide-controls. */}
      {recording && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 z-30 flex justify-center",
            controlsHidden ? "bottom-6 mb-safe" : "top-28 mt-safe",
          )}
        >
          <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium text-white">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            {Math.floor(recordElapsed / 60)}:
            {String(recordElapsed % 60).padStart(2, "0")}
          </span>
        </div>
      )}

      {cameraBlocked && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/80 px-8 text-center">
          <p className="text-sm text-white/90">
            The in-page camera isn&apos;t available here. Use your device
            camera instead — each photo is added the moment you take it.
            Notes and voice notes keep working.
          </p>
          <Button size="sm" onClick={() => fallbackInputRef.current?.click()}>
            <CameraIcon className="mr-1.5 h-4 w-4" />
            Open system camera
          </Button>
        </div>
      )}

      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFallbackChange}
        className="hidden"
      />

      {/* Bottom controls — overlaid on the frame over a gradient scrim. */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pb-safe pt-8",
          controlsHidden && "hidden",
        )}
      >
        {artifacts.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-2">
            {artifacts.slice(-12).map((artifact) => (
              <button
                key={artifact.localId}
                type="button"
                onClick={() => setPreviewArtifact(artifact)}
                aria-label="View capture"
                className={cn(
                  "relative h-12 w-9 shrink-0 overflow-hidden rounded bg-white/10",
                  artifact.isDelineator && "ring-2 ring-inset ring-amber-400",
                )}
              >
                <ArtifactThumb artifact={artifact} />
                {artifact.status === "uploading" && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                  </span>
                )}
                {artifact.status === "error" && (
                  <span className="absolute inset-0 rounded ring-2 ring-inset ring-red-500" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Serial quick entry + notes + voice */}
        <div className="flex items-center gap-2 py-2">
          {qrMode && (
            <SerialQuickEntry
              key={currentAsset?.id ?? "none"}
              onCommit={session.addManualIdentifier}
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-10 shrink-0 rounded-full px-3 text-white/90 hover:bg-white/20 hover:text-white",
              session.notes.trim() !== "" ? "bg-white/20" : "bg-white/10",
              !qrMode && "flex-1",
            )}
            onClick={() => setNotesOpen((o) => !o)}
            aria-label={qrMode ? "Item notes" : "Batch notes"}
          >
            Notes
          </Button>
          <VoiceNoteButton
            onRecordingComplete={onVoiceComplete}
            onActiveChange={onVoiceActiveChange}
            disabled={recording || session.organizationId === null}
          />
        </div>

        {/* Photo/video toggle */}
        <div className="flex justify-center pb-1">
          <div className="flex rounded-full bg-white/10 p-0.5">
            <button
              type="button"
              onClick={() => setMediaMode("photo")}
              disabled={recording}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-medium",
                mediaMode === "photo" ? "bg-white text-black" : "text-white/80",
              )}
            >
              <CameraIcon className="h-3.5 w-3.5" />
              Photo
            </button>
            <button
              type="button"
              onClick={() => setMediaMode("video")}
              disabled={recording}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full px-4 text-xs font-medium",
                mediaMode === "video" ? "bg-white text-black" : "text-white/80",
              )}
            >
              <Video className="h-3.5 w-3.5" />
              Video
            </button>
          </div>
        </div>

        {/* List · shutter · next/break */}
        <div className="flex items-center justify-between py-2">
          <div className="flex w-20 justify-start">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full text-white hover:bg-white/10 hover:text-white"
              onClick={() => router.push("/commerce/intake/assets")}
              aria-label="Open the intake assets list"
            >
              <LayoutGrid className="h-5 w-5" />
            </Button>
          </div>
          <button
            type="button"
            onClick={onShutter}
            disabled={shutterDisabled}
            aria-label={
              mediaMode === "photo"
                ? "Take photo"
                : recording
                  ? "Stop recording"
                  : "Start recording"
            }
            className={cn(
              "flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/80 transition-transform active:scale-90",
              shutterDisabled && "opacity-30",
            )}
          >
            {mediaMode === "photo" ? (
              <span className="block h-14 w-14 rounded-full bg-white" />
            ) : recording ? (
              <span className="block h-7 w-7 rounded-sm bg-red-500" />
            ) : (
              <span className="block h-14 w-14 rounded-full bg-red-500" />
            )}
          </button>
          <div className="flex w-20 justify-end">
            {qrMode ? (
              <Button
                size="sm"
                className="h-11 whitespace-nowrap rounded-full px-4"
                onClick={session.nextItem}
                disabled={currentAsset === null || recording}
              >
                <PackagePlus className="mr-1.5 h-4 w-4" />
                Next
              </Button>
            ) : (
              // Untracked mode: a delineator FRAME breaks items — the button
              // shoots one immediately, flagged `is_delineator`, so the
              // boundary is in the artifact stream itself.
              <Button
                size="sm"
                variant="secondary"
                className="h-11 whitespace-nowrap rounded-full px-4"
                onClick={() => takePhoto({ isDelineator: true })}
                disabled={recording || cameraBlocked}
              >
                <Scissors className="mr-1.5 h-4 w-4" />
                Break
              </Button>
            )}
          </div>
        </div>

        {(session.uploadingCount > 0 || session.errorCount > 0) && (
          <p className="pb-2 text-center text-[11px] text-white/60">
            {session.uploadingCount > 0 &&
              `Saving ${session.uploadingCount} file${session.uploadingCount === 1 ? "" : "s"} in the background… `}
            {session.errorCount > 0 && (
              <span className="text-red-400">
                {session.errorCount} upload
                {session.errorCount === 1 ? "" : "s"} failed — tap the red
                thumbnail.
              </span>
            )}
          </p>
        )}
      </div>

      <NotesPanel
        open={notesOpen && !controlsHidden}
        notes={session.notes}
        saving={session.notesSaving}
        transcribing={false}
        onChange={session.setNotes}
        onClose={() => setNotesOpen(false)}
      />

      {previewArtifact && previewArtifact.kind !== "audio" && (
        <MediaPager
          media={pagerMedia}
          initialIndex={Math.max(
            pagerMedia.findIndex((m) => m.key === previewArtifact.localId),
            0,
          )}
          onClose={() => setPreviewArtifact(null)}
          onDelete={(pagerItem) => {
            session.removeArtifact(pagerItem.key);
          }}
        />
      )}
      {previewArtifact && previewArtifact.kind === "audio" && (
        <div className="absolute inset-0 z-40 flex flex-col bg-black">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-white/80">
              <FileAudio className="h-10 w-10" />
              <p className="px-8 text-center text-sm">
                Voice note — the pipeline transcribes it into the item notes.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-center gap-3 bg-black px-4 py-3 pb-safe">
            <Button
              variant="destructive"
              className="h-11 px-5"
              onClick={() => {
                session.removeArtifact(previewArtifact.localId);
                setPreviewArtifact(null);
              }}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
            <Button
              variant="secondary"
              className="h-11 px-5"
              onClick={() => setPreviewArtifact(null)}
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

function SerialQuickEntry({ onCommit }: { onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onCommit(trimmed);
    setDraft("");
  };

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="Serial / tag"
      enterKeyHint="done"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      className="h-10 min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 text-base text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
    />
  );
}

function ArtifactThumb({ artifact }: { artifact: PendingIntakeArtifact }) {
  if (artifact.kind === "audio") {
    return (
      <span className="flex h-full w-full items-center justify-center">
        <FileAudio className="h-4 w-4 text-white/80" />
      </span>
    );
  }
  if (artifact.previewUrl) {
    if (artifact.kind === "video") {
      return (
        <span className="relative block h-full w-full">
          <video
            src={artifact.previewUrl}
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <Play className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />
        </span>
      );
    }
    return (
      <img
        src={artifact.previewUrl}
        alt=""
        className="h-full w-full object-cover"
      />
    );
  }
  if (artifact.fileId) {
    return <CaptureThumb fileId={artifact.fileId} alt="Captured file" />;
  }
  return (
    <span className="flex h-full w-full items-center justify-center">
      <CameraIcon className="h-4 w-4 text-white/60" />
    </span>
  );
}
