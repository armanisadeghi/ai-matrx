"use client";

/**
 * IntakeCaptureScreenV3 — commerce intake on the v3 vertical-rail chrome
 * (`CameraCaptureV3` from `@ai-matrx/capture` 0.3.0). Isolated at
 * /commerce/intake/v3 while v1 and v2 stay live.
 *
 * What v3 changes (Arman, 2026-08-30), and how commerce maps onto it:
 * - ONE hold-shutter (tap = photo, hold = video) — no mode row. The mic
 *   warms on `onRecordIntent` (every press, idempotent) so a hold-recording
 *   never pays an iOS prompt or loses its first second of audio.
 * - The RIGHT RAIL carries the options; commerce appends QR and Notes to
 *   the package's core actions, and Process (instant lane) rides the rail
 *   too. Extras collapse behind the package chevron.
 * - Serial entry is a BUTTON that expands into a field (`topEntry` slot) —
 *   no permanently-occupied input row.
 * - UPLOAD is not a mode: the library drawer is the ONE door to existing
 *   media, with Upload inside it.
 *
 * Everything behavioral is UNCHANGED from v1/v2: `useIntakeSession` (both
 * ironclad write rules), the camera runtime via `useCameraCaptureHost`, the
 * ONE QR decoder, the canonical recorder behind `VoiceNoteButton`,
 * `fileHandler` through uploads.ts.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  BrainCircuit,
  Camera as CameraIcon,
  Check,
  Eye,
  EyeOff,
  FileAudio,
  Loader2,
  NotebookPen,
  PackagePlus,
  Play,
  ScanLine,
  Scissors,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { CameraPreview } from "@/features/media-capture/components/CameraPreview";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { NotesPanel } from "@/features/product-capture/components/NotesPanel";
import { VoiceNoteButton } from "@/features/product-capture/components/VoiceNoteButton";
import { InstantProcessSheet } from "@/features/product-capture/components/InstantProcessSheet";
import { useQrAutoScan } from "@/features/product-capture/hooks/useQrAutoScan";
import { useDeclaredSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";
import { fetchFileBlobUrl } from "@/features/files/hooks/useFileBlob";

import { CameraCaptureV3, CaptureExpandingField } from "@ai-matrx/capture/react";
import type { CaptureMediaItem } from "@ai-matrx/capture/react";
import type { CaptureRailAction } from "@ai-matrx/capture";
import { useCameraCaptureHost } from "@/features/capture-camera/host/useCameraCaptureHost";
import { CloudLibrarySheet } from "@/features/capture-camera/host/CloudLibrarySheet";

import type { PendingIntakeArtifact } from "../types";
import { useIntakeSession } from "../hooks/useIntakeSession";
import {
  INTAKE_INSTANT_ANALYSIS_MANDATE_KEY,
  useInstantIntakeAnalysis,
} from "../hooks/useInstantIntakeAnalysis";

const INSTANT_MANDATE_REFS = [
  {
    mandateKey: INTAKE_INSTANT_ANALYSIS_MANDATE_KEY,
    does: "Analyzes the current intake asset's photos into an intake record when you tap Process — streamed live.",
  },
];
const NO_MANDATE_REFS: typeof INSTANT_MANDATE_REFS = [];

export interface IntakeCaptureScreenV3Props {
  initialAssetId?: string | null;
  mode?: "standard" | "instant";
}

export function IntakeCaptureScreenV3({
  initialAssetId = null,
  mode = "standard",
}: IntakeCaptureScreenV3Props) {
  const router = useRouter();
  const instantMode = mode === "instant";
  const session = useIntakeSession({
    initialAssetId,
    lane: instantMode ? "instant" : "standard",
  });
  useDeclaredSurfaceMandates(
    instantMode ? INSTANT_MANDATE_REFS : NO_MANDATE_REFS,
  );

  // ── Instant lane ─────────────────────────────────────────────────────────
  const instant = useInstantIntakeAnalysis({
    asset: session.currentAsset,
    enabled: instantMode,
  });
  const [processOpen, setProcessOpen] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const runInstant = useCallback(() => {
    const asset = session.currentAsset;
    if (!asset) return;
    setLaunchError(null);
    setProcessOpen(true);
    void instant.process(asset).catch((err: unknown) => {
      setLaunchError(
        err instanceof Error ? err.message : "Processing failed — try again.",
      );
    });
  }, [session.currentAsset, instant]);

  const onProcess = useCallback(() => {
    if (instant.isRunning || instant.storedResult) {
      setProcessOpen(true);
      return;
    }
    runInstant();
  }, [instant.isRunning, instant.storedResult, runInstant]);

  const onInstantNextItem = useCallback(() => {
    setProcessOpen(false);
    instant.dismiss();
    session.nextItem();
  }, [instant, session]);

  // ── Upload inputs — the library drawer is the only DOOR; these are the
  //    plumbing behind it (plus the camera-blocked fallback lane). ─────────
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleFallbackChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      session.addPhoto(file);
    },
    [session],
  );

  const handleUploadChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      const picked = files ? session.addUploads(files) : 0;
      e.target.value = "";
      if (picked > 0) {
        toast.success(
          `Adding ${picked} file${picked === 1 ? "" : "s"} to this capture…`,
        );
      }
    },
    [session],
  );

  // ── Camera host. The hold-shutter has no video MODE, so the mic warm-hold
  //    keys off record INTENT (pointer-down) and stays warm while recording;
  //    intent is re-armed on every press, exactly as the package expects. ──
  const [micWarm, setMicWarm] = useState(false);
  const host = useCameraCaptureHost({
    fileNamePrefix: "intake",
    recordingLabel: "Intake video",
    onPhoto: useCallback(
      (blob: Blob, opts?: { fileNamePrefix?: string }) => {
        session.addPhoto(blob, {
          isDelineator: opts?.fileNamePrefix === "delineator",
        });
      },
      [session],
    ),
    onVideo: useCallback(
      (blob: Blob, fileName: string, durationMs: number) => {
        session.addVideo(blob, fileName, durationMs);
      },
      [session],
    ),
    onUpload: useCallback(() => uploadInputRef.current?.click(), []),
    mode: micWarm ? "video" : "photo",
  });
  const onRecordIntent = useCallback(() => setMicWarm(true), []);
  // Once warmed, the mic stays held until this surface unmounts. A 5s
  // post-recording release shipped first and was the repeated-prompt bug on
  // iOS Safari: WebKit's grant is per-ACTIVE-capture there, so tearing the
  // mic down meant the very next press re-prompted — "asks every single
  // time". The singleton releases cleanly on unmount via the host's own
  // teardown; the cost of holding is the mic indicator, the cost of
  // releasing is a permission dialog over the viewfinder.

  // ── Voice notes ──────────────────────────────────────────────────────────
  const [voiceActive, setVoiceActive] = useState(false);
  const voiceStartedAtRef = useRef(0);
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

  // ── Panels & overlays (declared before the QR gate that reads them) ─────
  const [notesOpen, setNotesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);

  // ── QR mode (serialized) vs untracked ────────────────────────────────────
  const qrMode = session.captureMode === "serialized";
  const [qrFlash, setQrFlash] = useState<string | null>(null);
  const qrFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleQrMode = useCallback(() => {
    session.setCaptureMode(qrMode ? "untracked" : "serialized");
  }, [session, qrMode]);

  const onQrCode = useCallback(
    (code: string) => {
      void session
        .onQrCode(code)
        .then(() => {
          navigator.vibrate?.(80);
          setQrFlash(code);
          if (qrFlashTimerRef.current) clearTimeout(qrFlashTimerRef.current);
          qrFlashTimerRef.current = setTimeout(() => setQrFlash(null), 1600);
        })
        .catch((err: unknown) => {
          console.error("[commerce-intake] QR handling failed", err);
          toast.error("That code could not be processed — scan it again.");
        });
    },
    [session],
  );

  // Dedupe BY ABSENCE only (§2 policy 2); scanning pauses while any overlay
  // covers the feed (same gating as v2).
  useQrAutoScan({
    videoRef: host.videoRef,
    enabled:
      qrMode &&
      !host.cameraBlocked &&
      !host.recording &&
      !reviewOpen &&
      !libraryOpen &&
      !processOpen,
    currentCode: null,
    onCode: onQrCode,
  });

  useEffect(() => {
    return () => {
      if (qrFlashTimerRef.current) clearTimeout(qrFlashTimerRef.current);
    };
  }, []);

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

  // The package media session (identical mapping to v2).
  const mediaItems = useMemo<CaptureMediaItem[]>(
    () =>
      artifacts.map((a) => {
        const fileId = a.fileId;
        return {
          key: a.localId,
          kind: a.kind,
          src: a.previewUrl ?? null,
          resolve:
            !a.previewUrl && fileId
              ? () => fetchFileBlobUrl(fileId)
              : undefined,
          status:
            a.status === "uploading"
              ? ("uploading" as const)
              : a.status === "error"
                ? ("error" as const)
                : ("ready" as const),
          accent: a.isDelineator,
        };
      }),
    [artifacts],
  );

  const itemLabel = qrMode
    ? currentAsset
      ? (currentAsset.qrCode ?? `Item ${session.currentAssetSeq}`)
      : "New item"
    : "Untracked stream";

  const shutterDisabled =
    host.cameraBlocked || voiceActive || session.organizationId === null;

  const goToAssets = useCallback(
    () => router.push("/commerce/intake/assets"),
    [router],
  );

  const lastVisualArtifact = [...artifacts]
    .reverse()
    .find((a) => a.kind !== "audio");

  // Commerce rail actions appended after the package's core set. QR and
  // Notes stay visible when collapsed; Process joins them in instant mode.
  const railActions: CaptureRailAction[] = [
    {
      id: "qr-mode",
      label: qrMode ? "QR capture on" : "QR capture off",
      icon: <ScanLine className="h-[22px] w-[22px]" />,
      active: qrMode,
      primary: true,
      onPress: toggleQrMode,
    },
    {
      id: "notes",
      label: qrMode ? "Item notes" : "Batch notes",
      icon: <NotebookPen className="h-[22px] w-[22px]" />,
      active: session.notes.trim() !== "",
      primary: true,
      onPress: () => setNotesOpen((o) => !o),
    },
    ...(instantMode && qrMode
      ? [
          {
            id: "process",
            label: instant.isRunning
              ? "Analyzing…"
              : instant.storedResult
                ? "View analysis"
                : "Process item",
            icon:
              instant.isRunning || instant.restoring ? (
                <Loader2 className="h-[22px] w-[22px] animate-spin" />
              ) : (
                <BrainCircuit className="h-[22px] w-[22px]" />
              ),
            active: instant.storedResult !== null,
            primary: true,
            disabled:
              currentAsset === null ||
              host.recording ||
              (session.uploadingCount > 0 && !instant.storedResult),
            onPress: onProcess,
          } satisfies CaptureRailAction,
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <CameraCaptureV3
        engine={host.engine}
        onRecordIntent={onRecordIntent}
        onClose={goToAssets}
        preview={
          <CameraPreview
            stream={host.stream}
            framing="viewport-crop"
            videoRef={host.videoRef}
          />
        }
        cloud={{
          recentsThumb: lastVisualArtifact ? (
            <ArtifactThumb artifact={lastVisualArtifact} />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <CameraIcon className="h-5 w-5 text-white/60" />
            </span>
          ),
          onOpenLibrary: () => setLibraryOpen(true),
        }}
        media={{
          items: mediaItems,
          onDelete: session.removeArtifact,
          onReplacePhoto: (key, blob) => {
            session.addPhoto(blob);
            session.removeArtifact(key);
          },
        }}
        onReviewOpenChange={setReviewOpen}
        controlsHidden={controlsHidden}
        shutterDisabled={shutterDisabled}
        blockedSheet={{
          body: host.permissionDenied ? (
            <p>
              Camera access is blocked for this site, so asking again
              won&apos;t help — re-enable it in the browser: tap the icon by
              the address bar (on iPhone the &ldquo;AA&rdquo;/page menu →
              Website Settings), allow Camera and Microphone, then reload.
              Meanwhile your device camera and uploads keep working.
            </p>
          ) : (
            <p>
              The in-page camera isn&apos;t available here. Use your device
              camera instead, or upload photos and videos you already have —
              they are added the moment you pick them.
            </p>
          ),
          actions: [
            {
              label: "Open system camera",
              onPress: () => fallbackInputRef.current?.click(),
              kind: "primary",
            },
            {
              label: "Upload from device",
              onPress: () => uploadInputRef.current?.click(),
              kind: "secondary",
            },
          ],
        }}
        slots={{
          topCenter: (
            <p className="truncate text-center text-[13px] font-semibold text-white">
              {itemLabel}
              <span className="font-normal text-white/60">
                {" · "}
                {photoCount} photo{photoCount === 1 ? "" : "s"}
              </span>
            </p>
          ),
          topEntry: qrMode ? (
            <CaptureExpandingField
              key={currentAsset?.id ?? "none"}
              label="Serial / tag"
              icon={<Tag className="h-4 w-4" />}
              onCommit={session.addManualIdentifier}
              disabled={session.organizationId === null}
            />
          ) : undefined,
          statusChips: (
            <>
              {qrMode &&
                (qrFlash ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-lg">
                    <Check className="h-4 w-4" />
                    {qrFlash}
                  </span>
                ) : !controlsHidden ? (
                  <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80">
                    QR mode — scan a code to start its item
                  </span>
                ) : null)}
              {(session.uploadingCount > 0 || session.errorCount > 0) &&
                !controlsHidden && (
                  <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/70">
                    {session.uploadingCount > 0 &&
                      `Saving ${session.uploadingCount}… `}
                    {session.errorCount > 0 && (
                      <span className="text-red-400">
                        {session.errorCount} failed — tap the red thumbnail.
                      </span>
                    )}
                  </span>
                )}
            </>
          ),
          railActions,
          aboveShutter: (
            <div className="flex justify-end">
              <VoiceNoteButton
                onRecordingComplete={onVoiceComplete}
                onActiveChange={onVoiceActiveChange}
                disabled={host.recording || session.organizationId === null}
              />
            </div>
          ),
          shutterTrailing: qrMode ? (
            <Button
              size="sm"
              className="h-9 whitespace-nowrap rounded-full px-3 text-xs"
              onClick={session.nextItem}
              disabled={currentAsset === null || host.recording}
            >
              <PackagePlus className="mr-1 h-3.5 w-3.5" />
              Next
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 whitespace-nowrap rounded-full px-3 text-xs"
              onClick={() =>
                host.capturePhotoWith({ fileNamePrefix: "delineator" })
              }
              disabled={host.recording || host.cameraBlocked}
            >
              <Scissors className="mr-1 h-3.5 w-3.5" />
              Break
            </Button>
          ),
          overlays: (
            <>
              {host.flash && (
                <div className="absolute inset-0 z-30 bg-white/70" />
              )}
              {/* Hide/show controls — always present, same spot (P17). */}
              <button
                type="button"
                onClick={toggleControls}
                aria-label={controlsHidden ? "Show controls" : "Hide controls"}
                aria-pressed={controlsHidden}
                className={cn(
                  "absolute left-2 top-[52px] z-40 mt-safe flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors",
                  controlsHidden
                    ? "bg-black/50 hover:bg-black/70"
                    : "bg-white/10 hover:bg-white/20",
                )}
              >
                {controlsHidden ? (
                  <Eye className="h-5 w-5" />
                ) : (
                  <EyeOff className="h-5 w-5" />
                )}
              </button>
            </>
          ),
        }}
      />

      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFallbackChange}
        className="hidden"
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleUploadChange}
        className="hidden"
      />

      {/* THE ONE DOOR to existing media — upload lives inside it (v3 rule). */}
      <CloudLibrarySheet
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onUpload={() => uploadInputRef.current?.click()}
      />

      {instantMode && (
        <InstantProcessSheet
          open={processOpen}
          onOpenChange={setProcessOpen}
          conversationId={instant.conversationId}
          pending={
            processOpen &&
            instant.isRunning &&
            !instant.conversationId &&
            !launchError
          }
          isRunning={instant.isRunning}
          error={launchError ?? instant.error}
          storedResult={instant.storedResult}
          hasStoredRun={instant.hasStoredRun}
          restoredHasStream={instant.restoredHasStream}
          restoring={instant.restoring}
          onReanalyze={runInstant}
          onNextItem={onInstantNextItem}
        />
      )}

      <NotesPanel
        open={notesOpen && !controlsHidden}
        notes={session.notes}
        saving={session.notesSaving}
        transcribing={false}
        onChange={session.setNotes}
        onClose={() => setNotesOpen(false)}
      />
    </div>
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
            // #t forces iOS to paint the first frame (else: black tile).
            src={`${artifact.previewUrl}#t=0.01`}
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
