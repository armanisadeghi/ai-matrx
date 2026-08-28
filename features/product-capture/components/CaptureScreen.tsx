"use client";

/**
 * CaptureScreen — the full-screen rapid-capture surface of product capture.
 *
 * Built on the platform camera runtime exactly like the PDF scanner's
 * CaptureView (`acquireCameraLease` environment/maximum-available →
 * `<CameraPreview framing="full-frame">` → `capturePhotoFromVideo` canvas
 * path), plus this surface's own contract:
 *
 * - **Mode 1 (rapid):** shutter, shutter, shutter → "Next item" → repeat.
 *   Items are created lazily on the first artifact, so Next can never mint
 *   an empty row.
 * - **Mode 2 (QR auto-switch):** the ScanLine toggle runs `useQrAutoScan`
 *   over the live preview; a scanned code closes the current item and opens
 *   a new one carrying the code (or names the untouched current item).
 * - Photo ↔ video toggle at any time (video records the SAME pinned lease
 *   via `startVideoRecording`, mic on).
 * - SKU quick entry, collapsible autosaving notes, one-tap voice notes with
 *   background transcription — all rendered here, all owned by
 *   `useProductCaptureSession`.
 *
 * When getUserMedia is unavailable the OS-camera fallback input keeps photo
 * capture working; SKU/notes/voice stay fully functional.
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

import type { PendingArtifact } from "../types";
import { useProductCaptureSession } from "../hooks/useProductCaptureSession";
import { useQrAutoScan } from "../hooks/useQrAutoScan";
import { NotesPanel } from "./NotesPanel";
import { VoiceNoteButton } from "./VoiceNoteButton";
import { ItemsSheet } from "./ItemsSheet";

const PHOTO_JPEG_QUALITY = 0.92;
const QR_MODE_STORAGE_KEY = "product-capture:qr-auto";

export interface CaptureScreenProps {
  /** Open with this item current (the `?item=` deep link). */
  initialItemId?: string | null;
}

export function CaptureScreen({ initialItemId = null }: CaptureScreenProps) {
  const router = useRouter();
  const session = useProductCaptureSession({ initialItemId });

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

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const h = recordingRef.current;
      if (h) setRecordElapsed(Math.floor(h.getElapsedMs() / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [recording]);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;
    const lease = leaseRef.current;
    if (!video || !lease || video.videoWidth === 0) return;
    void capturePhotoFromVideo({
      video,
      lease,
      framing: "full-frame",
      quality: PHOTO_JPEG_QUALITY,
      fileNamePrefix: "product",
      allowNativeTakePhoto: false,
    })
      .then((result) => {
        session.addPhoto(result.blob);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 120);
      })
      .catch((err: unknown) => {
        console.error("[product-capture] shutter capture failed", err);
      });
  }, [session]);

  const startVideo = useCallback(async () => {
    const lease = leaseRef.current;
    if (!lease) return;
    try {
      const handle = await startVideoRecording({
        lease,
        withMic: true,
        sourceFeature: "files",
        label: "Product video",
      });
      recordingRef.current = handle;
      setRecordElapsed(0);
      setRecording(true);
      void handle.done
        .then((result) => {
          if (result) {
            const ext = extensionForMime(result.mime);
            session.addVideo(result.blob, `video-${Date.now()}.${ext}`);
          }
        })
        .catch((err: unknown) => {
          console.error("[product-capture] video recording failed", err);
          toast.error("The video recording failed.");
        })
        .finally(() => {
          recordingRef.current = null;
          setRecording(false);
        });
    } catch (err) {
      console.error("[product-capture] video start failed", err);
      toast.error("Could not start the video recording.");
    }
  }, [session]);

  const stopVideo = useCallback(() => {
    void recordingRef.current?.stop();
  }, []);

  // Leaving the screen mid-recording: stop gracefully so the journal path
  // still delivers the file.
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

  // ── QR auto-switch (Mode 2) ──────────────────────────────────────────────
  const [qrMode, setQrMode] = useState(() => {
    try {
      return window.localStorage.getItem(QR_MODE_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [qrFlash, setQrFlash] = useState<string | null>(null);
  const qrFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleQrMode = useCallback(() => {
    setQrMode((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(QR_MODE_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

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

  useQrAutoScan({
    videoRef,
    enabled: qrMode && !cameraBlocked && !recording,
    currentCode: session.currentItem?.code ?? null,
    onCode: onQrCode,
  });

  useEffect(() => {
    return () => {
      if (qrFlashTimerRef.current) clearTimeout(qrFlashTimerRef.current);
    };
  }, []);

  // ── SKU quick entry ──────────────────────────────────────────────────────
  const currentItemId = session.currentItem?.id ?? null;
  const currentItemCode = session.currentItem?.code ?? null;

  // ── Panels ───────────────────────────────────────────────────────────────
  const [notesOpen, setNotesOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] =
    useState<PendingArtifact | null>(null);

  // Hide every overlay control (except the toggle itself) so the full frame
  // can be checked unobstructed. Recording/QR feedback chips stay — honesty
  // beats a clean frame while something is actively happening.
  const [controlsHidden, setControlsHidden] = useState(false);
  const toggleControls = useCallback(() => {
    setControlsHidden((h) => {
      if (!h) setNotesOpen(false);
      return !h;
    });
  }, []);

  const { currentItem, artifacts } = session;
  const photoCount = artifacts.filter((a) => a.kind === "photo").length;
  const itemLabel = currentItem
    ? (currentItem.code ?? `Item ${session.currentItemSeq}`)
    : "New item";

  const shutterDisabled =
    (cameraBlocked && mediaMode === "video") ||
    (cameraBlocked && mediaMode === "photo") ||
    voiceActive ||
    session.organizationId === null;

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* ── Full-bleed stage: the preview fills the whole screen (viewport
           crop); the SHUTTER still captures the full sensor frame — the
           listing pipeline gets everything the sensor saw. ── */}
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
            onClick={() => router.back()}
            aria-label="Close capture"
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
              qrMode ? "Turn off QR auto-switch" : "Turn on QR auto-switch"
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

      {/* Hide/show controls — always present, same spot in both states so
          the thumb never has to hunt for it. */}
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

      {/* QR auto-switch feedback */}
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
                QR auto-switch on — scan a code to start its item
              </span>
            )
          )}
        </div>
      )}

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
            Notes, SKU and voice notes keep working.
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

      {/* ── Bottom controls — overlaid on the frame over a gradient scrim ── */}
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
                className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-white/10"
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

        {/* SKU quick entry + notes + voice */}
        <div className="flex items-center gap-2 py-2">
          <SkuQuickEntry
            // Remount when the item (or an externally assigned code, e.g. a
            // QR scan) changes so the draft always starts from the truth.
            key={`${currentItemId ?? "none"}:${currentItemCode ?? ""}`}
            initialCode={currentItemCode ?? ""}
            onCommit={session.setCode}
          />
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-10 shrink-0 rounded-full px-3 text-white/90 hover:bg-white/20 hover:text-white",
              session.notes.trim() !== "" ? "bg-white/20" : "bg-white/10",
            )}
            onClick={() => setNotesOpen((o) => !o)}
            aria-label="Item notes"
          >
            Notes
            {session.transcribingCount > 0 && (
              <Loader2 className="ml-1.5 h-3.5 w-3.5 animate-spin" />
            )}
          </Button>
          <VoiceNoteButton
            onRecordingComplete={session.addAudioNote}
            onActiveChange={setVoiceActive}
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
                mediaMode === "photo"
                  ? "bg-white text-black"
                  : "text-white/80",
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
                mediaMode === "video"
                  ? "bg-white text-black"
                  : "text-white/80",
              )}
            >
              <Video className="h-3.5 w-3.5" />
              Video
            </button>
          </div>
        </div>

        {/* Items · shutter · next */}
        <div className="flex items-center justify-between py-2">
          <div className="flex w-20 justify-start">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-full text-white hover:bg-white/10 hover:text-white"
              onClick={() => setItemsOpen(true)}
              aria-label="Captured items"
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
            <Button
              size="sm"
              className="h-11 whitespace-nowrap rounded-full px-4"
              onClick={session.nextItem}
              disabled={currentItem === null || recording}
            >
              <PackagePlus className="mr-1.5 h-4 w-4" />
              Next
            </Button>
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

      {/* ── Artifact preview overlay ── */}
      <NotesPanel
        open={notesOpen && !controlsHidden}
        notes={session.notes}
        saving={session.notesSaving}
        transcribing={session.transcribingCount > 0}
        onChange={session.setNotes}
        onClose={() => setNotesOpen(false)}
      />

      {previewArtifact && (
        <div className="absolute inset-0 z-40 flex flex-col bg-black">
          <div className="relative min-h-0 flex-1">
            <ArtifactPreview artifact={previewArtifact} />
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

      <ItemsSheet
        open={itemsOpen}
        onOpenChange={setItemsOpen}
        organizationId={session.organizationId}
        currentItemId={currentItemId}
        onResumeItem={session.resumeItem}
      />
    </div>
  );
}

function SkuQuickEntry({
  initialCode,
  onCommit,
}: {
  initialCode: string;
  onCommit: (code: string) => void;
}) {
  const [draft, setDraft] = useState(initialCode);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === initialCode) return;
    if (!trimmed && !initialCode) return;
    onCommit(trimmed);
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
      placeholder="SKU / product #"
      enterKeyHint="done"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      className="h-10 min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-4 text-base text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
    />
  );
}

function ArtifactThumb({ artifact }: { artifact: PendingArtifact }) {
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

function ArtifactPreview({ artifact }: { artifact: PendingArtifact }) {
  if (artifact.kind === "audio") {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-white/80">
          <FileAudio className="h-10 w-10" />
          <p className="text-sm">
            Voice note — its transcript lands in the item notes.
          </p>
        </div>
      </div>
    );
  }
  if (artifact.previewUrl) {
    if (artifact.kind === "video") {
      return (
        <video
          src={artifact.previewUrl}
          controls
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
        />
      );
    }
    return (
      <img
        src={artifact.previewUrl}
        alt="Captured photo"
        className="absolute inset-0 h-full w-full object-contain"
      />
    );
  }
  if (artifact.fileId) {
    return (
      <div className="absolute inset-0">
        <CaptureThumb fileId={artifact.fileId} alt="Captured file" />
      </div>
    );
  }
  return null;
}
