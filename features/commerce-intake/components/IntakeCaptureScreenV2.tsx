"use client";

/**
 * IntakeCaptureScreenV2 — the commerce intake camera rebuilt on the
 * iPhone-style chrome (`features/capture-camera` — the `@ai-matrx/capture`
 * extraction source). Isolated at /commerce/intake/v2 while v1 stays live.
 *
 * Same engine, new chrome: everything behavioral is UNCHANGED from v1 —
 * `useIntakeSession` (both ironclad write rules), the camera runtime via
 * `useCameraCaptureHost`, the ONE QR decoder, the canonical recorder behind
 * `VoiceNoteButton`, `fileHandler` through uploads.ts. Commerce-specific
 * affordances (QR mode, serial entry, notes, voice, Next/Break, instant
 * Process) attach through the chrome's typed SLOTS — the pattern the
 * package ships for domain extensions.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { CameraPreview } from "@/features/media-capture/components/CameraPreview";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { NotesPanel } from "@/features/product-capture/components/NotesPanel";
import { VoiceNoteButton } from "@/features/product-capture/components/VoiceNoteButton";
import { MediaPager } from "@/features/product-capture/components/MediaPager";
import { InstantProcessSheet } from "@/features/product-capture/components/InstantProcessSheet";
import { useQrAutoScan } from "@/features/product-capture/hooks/useQrAutoScan";
import { useDeclaredSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";

import { CameraCapture, ImageEditSheet } from "@ai-matrx/capture/react";
import type {
  CaptureCameraMode,
  CaptureOptionTile,
} from "@ai-matrx/capture";
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

export interface IntakeCaptureScreenV2Props {
  initialAssetId?: string | null;
  mode?: "standard" | "instant";
}

export function IntakeCaptureScreenV2({
  initialAssetId = null,
  mode = "standard",
}: IntakeCaptureScreenV2Props) {
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

  // ── Upload inputs (fallback + gallery picker — same lanes as v1) ────────
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

  // ── Camera host (the package engine over the canonical runtime) ─────────
  const [mediaMode, setMediaMode] = useState<CaptureCameraMode>("photo");
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
    mode: mediaMode,
  });

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

  // Dedupe BY ABSENCE only (§2 policy 2) — identical to v1.
  useQrAutoScan({
    videoRef: host.videoRef,
    enabled: qrMode && !host.cameraBlocked && !host.recording,
    currentCode: null,
    onCode: onQrCode,
  });

  useEffect(() => {
    return () => {
      if (qrFlashTimerRef.current) clearTimeout(qrFlashTimerRef.current);
    };
  }, []);

  // ── Panels & overlays ────────────────────────────────────────────────────
  const [notesOpen, setNotesOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editSrc, setEditSrc] = useState<string | null>(null);
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
    host.cameraBlocked || voiceActive || session.organizationId === null;

  const goToAssets = useCallback(
    () => router.push("/commerce/intake/assets"),
    [router],
  );

  const lastVisualArtifact = [...artifacts]
    .reverse()
    .find((a) => a.kind !== "audio");

  // Commerce option tiles injected into the two-tap grid (QR mode toggle
  // lives here too — two taps, iPhone-style, in addition to nothing else on
  // the top bar beyond the standard chrome).
  const commerceTiles: CaptureOptionTile[] = [
    {
      id: "qr-mode",
      label: "QR",
      icon: <ScanLine className="h-6 w-6" />,
      active: qrMode,
      onPress: toggleQrMode,
    },
    {
      id: "notes",
      label: "Notes",
      icon: <NotebookPen className="h-6 w-6" />,
      active: session.notes.trim() !== "",
      onPress: () => setNotesOpen((o) => !o),
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <CameraCapture
        engine={host.engine}
        mode={mediaMode}
        onModeChange={setMediaMode}
        // Always land on the assets list — the overlay covers the whole
        // shell, so router.back() could strand the user (v1 rule).
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
          // An edited photo joins the capture stream exactly like a shot —
          // same uploads.ts boundary, same artifact rows.
          onSaveEdited: (blob) => session.addPhoto(blob),
        }}
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
          topBarCenter: (
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-semibold text-white">
                {itemLabel}
              </p>
              <p className="text-[11px] text-white/70">
                {photoCount === 0
                  ? "No photos yet"
                  : `${photoCount} photo${photoCount === 1 ? "" : "s"}`}
              </p>
            </div>
          ),
          topBarTrailing: (
            <button
              type="button"
              onClick={toggleQrMode}
              aria-label={
                qrMode
                  ? "Switch to untracked capture"
                  : "Switch to QR (serialized) capture"
              }
              aria-pressed={qrMode}
              className={cn(
                "flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full transition-colors",
                qrMode ? "text-[#FFCC00]" : "text-white hover:bg-white/10",
              )}
            >
              <ScanLine className="h-[22px] w-[22px]" />
            </button>
          ),
          statusChips: qrMode ? (
            qrFlash ? (
              <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-lg">
                <Check className="h-4 w-4" />
                {qrFlash}
              </span>
            ) : !controlsHidden ? (
              <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80">
                QR mode — scan a code to start its item
              </span>
            ) : null
          ) : null,
          optionTiles: commerceTiles,
          aboveModeSelector: (
            <>
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
                        artifact.isDelineator &&
                          "ring-2 ring-inset ring-amber-400",
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
              <div className="flex items-center gap-2 py-1.5">
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
                  disabled={
                    host.recording || session.organizationId === null
                  }
                />
              </div>
              {instantMode && qrMode && (
                <div className="px-2 pb-1">
                  <Button
                    className="h-11 w-full rounded-full"
                    onClick={onProcess}
                    disabled={
                      currentAsset === null ||
                      host.recording ||
                      (session.uploadingCount > 0 && !instant.storedResult)
                    }
                  >
                    {instant.isRunning || instant.restoring ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <BrainCircuit className="mr-1.5 h-4 w-4" />
                    )}
                    {instant.isRunning
                      ? "Analyzing…"
                      : instant.storedResult
                        ? "View analysis"
                        : session.uploadingCount > 0
                          ? "Waiting for uploads…"
                          : "Process item"}
                  </Button>
                </div>
              )}
              {(session.uploadingCount > 0 || session.errorCount > 0) && (
                <p className="pb-1 text-center text-[11px] text-white/60">
                  {session.uploadingCount > 0 &&
                    `Saving ${session.uploadingCount} file${session.uploadingCount === 1 ? "" : "s"} in the background… `}
                  {session.errorCount > 0 && (
                    <span className="text-red-400">
                      {session.errorCount} upload
                      {session.errorCount === 1 ? "" : "s"} failed — tap the
                      red thumbnail.
                    </span>
                  )}
                </p>
              )}
            </>
          ),
          modeRowTrailing: qrMode ? (
            <Button
              size="sm"
              className="h-9 whitespace-nowrap rounded-full px-3"
              onClick={session.nextItem}
              disabled={currentAsset === null || host.recording}
            >
              <PackagePlus className="mr-1 h-4 w-4" />
              Next
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="h-9 whitespace-nowrap rounded-full px-3"
              onClick={() =>
                host.capturePhotoWith({ fileNamePrefix: "delineator" })
              }
              disabled={host.recording || host.cameraBlocked}
            >
              <Scissors className="mr-1 h-4 w-4" />
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
                  "absolute right-3 top-20 z-40 mt-safe flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors",
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

      <CloudLibrarySheet
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
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
          onEdit={(pagerItem) => {
            if (pagerItem.previewUrl) setEditSrc(pagerItem.previewUrl);
          }}
        />
      )}

      <ImageEditSheet
        open={editSrc !== null}
        src={editSrc}
        onClose={() => setEditSrc(null)}
        onSave={(blob) => session.addPhoto(blob)}
      />

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
