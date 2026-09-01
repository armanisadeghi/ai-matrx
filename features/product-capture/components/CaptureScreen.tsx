"use client";

/**
 * CaptureScreen — the full-screen rapid-capture surface of product capture,
 * on the `@ai-matrx/capture` iPhone-style chrome (C9 host adoption).
 *
 * Same engine, package chrome: everything behavioral is owned by
 * `useProductCaptureSession` (lazy item creation, uploads, notes, voice
 * transcription) and the canonical media-capture runtime reached through
 * `features/capture-camera/host/useCameraCaptureHost` (lease, combined
 * camera+mic prompt, video-mode mic warm hold, flip, recording clock).
 * Product-specific affordances — QR auto-switch, SKU entry, notes, voice,
 * Next, the Items sheet, the instant Process lane — attach through the
 * chrome's typed SLOTS, never a fork:
 *
 * - **Mode 1 (rapid):** shutter, shutter, shutter → "Next item" → repeat.
 *   Items are created lazily on the first artifact, so Next can never mint
 *   an empty row.
 * - **Mode 2 (QR auto-switch):** the ScanLine toggle runs `useQrAutoScan`
 *   over the live preview; a scanned code closes the current item and opens
 *   a new one carrying the code (or names the untouched current item).
 * - **Upload:** the mode row's first-class UPLOAD entry opens the device
 *   gallery; files join the current item through `session.addUploads` — same
 *   folder, same link rows, same filmstrip.
 * - Filmstrip → swipe viewer → crop/rotate edit-with-replace are all
 *   package-owned (`media`); replace = the edited frame joins the item and
 *   the source artifact is removed.
 *
 * When getUserMedia is unavailable the blocked sheet offers the OS camera
 * and the upload lane; SKU/notes/voice stay fully functional.
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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { CameraPreview } from "@/features/media-capture/components/CameraPreview";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import {
  fetchFileBlob,
  fetchFileBlobUrl,
} from "@/features/files/hooks/useFileBlob";
import { useDeclaredSurfaceMandates } from "@/features/surfaces/runtime/surface-mandates";

import { CameraCapture } from "@ai-matrx/capture/react";
import type { CaptureMediaItem } from "@ai-matrx/capture/react";
import type { CaptureCameraMode, CaptureOptionTile } from "@ai-matrx/capture";
import { useCameraCaptureHost } from "@/features/capture-camera/host/useCameraCaptureHost";

import type { PendingArtifact } from "../types";
import { captureActionDisabled } from "../capture-rules";
import { useProductCaptureSession } from "../hooks/useProductCaptureSession";
import {
  INSTANT_ANALYSIS_MANDATE_KEY,
  useInstantAnalysis,
} from "../hooks/useInstantAnalysis";
import { useQrAutoScan } from "../hooks/useQrAutoScan";
import { InstantProcessSheet } from "./InstantProcessSheet";
import { NotesPanel } from "./NotesPanel";
import { VoiceNoteButton } from "./VoiceNoteButton";
import { ItemsSheet } from "./ItemsSheet";

const QR_MODE_STORAGE_KEY = "product-capture:qr-auto";

export interface CaptureScreenProps {
  /** Open with this item current (the `?item=` deep link). */
  initialItemId?: string | null;
  /**
   * Process-mode A/B test (2026-08-29):
   * - `"standard"` — capture only; the server-side workflow picks items up on
   *   the `capturing → captured` transition (`closeItem`).
   * - `"instant"` — adds the Process button: the CLIENT runs the intake
   *   analysis through the `product_capture.instant_analysis` mandate and
   *   streams the result into `InstantProcessSheet`; on success the item goes
   *   `capturing → processed` directly, so the server lane never fires for it.
   */
  mode?: "standard" | "instant";
}

// The instant surface's one fixed AI job, registered in the top Agents menu
// (agent-disclosure law — never as visible page content). Stable identity so
// the declaration effect doesn't churn.
const INSTANT_MANDATE_REFS = [
  {
    mandateKey: INSTANT_ANALYSIS_MANDATE_KEY,
    does: "Analyzes the current item's photos into an intake record when you tap Process — streamed live.",
  },
];
const NO_MANDATE_REFS: typeof INSTANT_MANDATE_REFS = [];

export function CaptureScreen({
  initialItemId = null,
  mode = "standard",
}: CaptureScreenProps) {
  const router = useRouter();
  const instantMode = mode === "instant";
  const qaParams =
    process.env.NODE_ENV !== "production"
      ? new URLSearchParams(window.location.search)
      : null;
  const qaCamera = qaParams?.get("__qa_camera") ?? null;
  const session = useProductCaptureSession({
    initialItemId,
    lane: instantMode ? "instant" : "standard",
  });
  useDeclaredSurfaceMandates(
    instantMode ? INSTANT_MANDATE_REFS : NO_MANDATE_REFS,
  );

  // ── Instant lane (mode="instant") ────────────────────────────────────────
  const instant = useInstantAnalysis({
    item: session.currentItem,
    enabled: instantMode,
  });
  const [processOpen, setProcessOpen] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const runInstant = () => {
    const item = session.currentItem;
    if (!item) return;
    setLaunchError(null);
    setProcessOpen(true);
    void instant.process(item).catch((err: unknown) => {
      setLaunchError(
        err instanceof Error ? err.message : "Processing failed — try again.",
      );
    });
  };

  const onProcess = () => {
    // A run in flight, or a result this item already has: the button OPENS the
    // sheet rather than paying for the analysis twice. Closing the sheet never
    // cancels a run — the hook's seams persist it regardless.
    if (instant.isRunning || instant.storedResult) {
      setProcessOpen(true);
      return;
    }
    runInstant();
  };

  const onInstantNextItem = () => {
    setProcessOpen(false);
    instant.dismiss();
    session.nextItem();
  };

  // ── Upload inputs (fallback + gallery picker) ───────────────────────────
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
          `Adding ${picked} file${picked === 1 ? "" : "s"} to this item…`,
        );
      }
    },
    [session],
  );

  // ── Camera host (the package engine over the canonical runtime) ─────────
  const [mediaMode, setMediaMode] = useState<CaptureCameraMode>("photo");
  const host = useCameraCaptureHost({
    fileNamePrefix: "product",
    recordingLabel: "Product video",
    onPhoto: useCallback(
      (blob: Blob) => {
        session.addPhoto(blob);
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
    qaPermissionDenied: qaCamera === "denied",
    qaImageUrl: qaCamera === "image" ? qaParams?.get("__qa_image") : null,
  });

  // ── Voice notes ──────────────────────────────────────────────────────────
  const [voiceActive, setVoiceActive] = useState(false);

  // ── Panels & overlays (declared before the QR gate that reads them) ─────
  const [notesOpen, setNotesOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  // The package review loop (viewer/editor) reports open state so the QR
  // scanner pauses while an overlay covers the feed.
  const [reviewOpen, setReviewOpen] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);

  // ── QR auto-switch (Mode 2, persisted) ──────────────────────────────────
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
    async (code: string) => {
      try {
        await session.onQrCode(code);
        navigator.vibrate?.(80);
        setQrFlash(code);
        if (qrFlashTimerRef.current) clearTimeout(qrFlashTimerRef.current);
        qrFlashTimerRef.current = setTimeout(() => setQrFlash(null), 1600);
      } catch (err) {
        console.error("[product-capture] QR item switch failed", err);
        toast.error("The QR code was read, but its item could not be opened.");
      }
    },
    [session],
  );

  // Scanning pauses while ANY overlay covers the feed: the camera keeps
  // streaming under them, and a code sitting in frame would silently switch
  // items mid-review.
  useQrAutoScan({
    videoRef: host.videoRef,
    enabled:
      qrMode &&
      !host.cameraBlocked &&
      !host.recording &&
      !reviewOpen &&
      !itemsOpen &&
      !processOpen,
    currentCode: session.currentItem?.code ?? null,
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

  const { currentItem, artifacts } = session;
  const currentItemId = currentItem?.id ?? null;
  const currentItemCode = currentItem?.code ?? null;
  const photoCount = artifacts.filter((a) => a.kind === "photo").length;
  const itemLabel = currentItem
    ? (currentItem.code ?? `Item ${session.currentItemSeq}`)
    : "New item";

  // The package media session: filmstrip, swipe viewer, edit-with-replace
  // all run INSIDE @ai-matrx/capture. Fresh captures carry their object URL;
  // persisted-only artifacts (a resumed item) resolve through the canonical
  // blob cache — the package memoizes the resolutions.
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
          resolveEditBlob:
            fileId && a.status === "uploaded"
              ? () => fetchFileBlob(fileId)
              : undefined,
          status:
            a.status === "uploading"
              ? ("uploading" as const)
              : a.status === "error"
                ? ("error" as const)
                : ("ready" as const),
        };
      }),
    [artifacts],
  );

  const lastVisualArtifact = [...artifacts]
    .reverse()
    .find((a) => a.kind !== "audio");

  const shutterDisabled = captureActionDisabled({
    cameraBlocked: host.cameraBlocked,
    voiceActive,
    organizationResolved: session.organizationId !== null,
    qaQrOnly: host.qaQrOnly,
  });

  const goToItems = useCallback(
    () => router.push("/tools/product-capture/all"),
    [router],
  );

  // Product option tiles injected into the two-tap grid (the QR toggle lives
  // here too — plus its one-tap top-bar button).
  const productTiles: CaptureOptionTile[] = [
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
        // Always land on the item list — the overlay covers the whole shell,
        // so router.back() could strand the user.
        onClose={goToItems}
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
          // The Items sheet is this surface's library: every captured item's
          // cloud media, resumable as the current item.
          onOpenLibrary: () => setItemsOpen(true),
        }}
        // Filmstrip → viewer → edit-with-replace, all package-owned. Replace
        // = the edited frame joins the item and the source artifact is
        // removed (in-flight uploads honor the removal server-side too).
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
              Camera access is blocked for this site, so asking again won&apos;t
              help — re-enable it in the browser: tap the icon by the address
              bar (on iPhone the &ldquo;AA&rdquo;/page menu → Website Settings),
              allow Camera and Microphone, then reload. Meanwhile your device
              camera and uploads work — and notes, SKU and voice notes keep
              working.
            </p>
          ) : (
            <p>
              The in-page camera isn&apos;t available here. Use your device
              camera instead, or upload photos and videos you already have —
              either way they are added the moment you pick them. Notes, SKU and
              voice notes keep working.
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
            <p className="truncate text-center text-[13px] font-semibold text-white">
              {itemLabel}
              <span className="font-normal text-white/60">
                {" · "}
                {photoCount === 0
                  ? "no photos"
                  : `${photoCount} photo${photoCount === 1 ? "" : "s"}`}
              </span>
            </p>
          ),
          topBarTrailing: (
            <button
              type="button"
              onClick={toggleQrMode}
              aria-label={
                qrMode ? "Turn off QR auto-switch" : "Turn on QR auto-switch"
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
          statusChips: qrFlash ? (
            <span className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-lg">
              <Check className="h-4 w-4" />
              {qrFlash}
            </span>
          ) : host.qaQrOnly ? (
            <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] text-white/90">
              QR test feed — photo and video are disabled
            </span>
          ) : qrMode && !controlsHidden ? (
            <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] text-white/80">
              QR auto-switch on — scan a code to start its item
            </span>
          ) : null,
          optionTiles: productTiles,
          aboveModeSelector: (
            <>
              <div className="flex items-center gap-1.5 py-1">
                <SkuQuickEntry
                  // Remount when the item (or an externally assigned code,
                  // e.g. a QR scan) changes so the draft starts from truth.
                  key={`${currentItemId ?? "none"}:${currentItemCode ?? ""}`}
                  initialCode={currentItemCode ?? ""}
                  onCommit={session.setCode}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-9 shrink-0 rounded-full px-3 text-white/90 hover:bg-white/20 hover:text-white",
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
                  disabled={host.recording || session.organizationId === null}
                />
                {instantMode && (
                  <Button
                    className="h-9 shrink-0 rounded-full px-3"
                    onClick={onProcess}
                    disabled={
                      currentItem === null ||
                      host.recording ||
                      // A saved analysis is always viewable; only a NEW run
                      // waits for this item's uploads to land.
                      (session.uploadingCount > 0 && !instant.storedResult)
                    }
                    aria-label="Process this item with AI"
                  >
                    {instant.isRunning || instant.restoring ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BrainCircuit className="h-4 w-4" />
                    )}
                    <span className="ml-1">
                      {instant.isRunning
                        ? "Analyzing…"
                        : instant.storedResult
                          ? "View"
                          : "Process"}
                    </span>
                  </Button>
                )}
              </div>
              {(session.uploadingCount > 0 || session.errorCount > 0) && (
                <p className="pb-0.5 text-center text-[10px] leading-tight text-white/60">
                  {session.uploadingCount > 0 &&
                    `Saving ${session.uploadingCount} file${session.uploadingCount === 1 ? "" : "s"}… `}
                  {session.errorCount > 0 && (
                    <span className="text-red-400">
                      {session.errorCount} upload
                      {session.errorCount === 1 ? "" : "s"} failed — tap the red
                      thumbnail.
                    </span>
                  )}
                </p>
              )}
            </>
          ),
          modeRowTrailing: (
            <Button
              size="sm"
              className="h-8 whitespace-nowrap rounded-full px-2.5 text-xs"
              onClick={session.nextItem}
              disabled={!session.canAdvanceItem || host.recording}
            >
              <PackagePlus className="mr-1 h-3.5 w-3.5" />
              Next
            </Button>
          ),
          overlays: (
            <>
              {host.flash && (
                <div className="absolute inset-0 z-30 bg-white/70" />
              )}
              {/* Hide/show controls — always present, same spot. */}
              <button
                type="button"
                onClick={toggleControls}
                aria-label={controlsHidden ? "Show controls" : "Hide controls"}
                aria-pressed={controlsHidden}
                className={cn(
                  "absolute right-2 top-[52px] z-40 mt-safe flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors",
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

      {/* Upload lane: the device's own photos/videos, many at a time. No
          `capture` attribute — that is what makes the OS open the gallery /
          files picker rather than the camera. */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleUploadChange}
        className="hidden"
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
        transcribing={session.transcribingCount > 0}
        onChange={session.setNotes}
        onClose={() => setNotesOpen(false)}
      />

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

export function SkuQuickEntry({
  initialCode,
  onCommit,
}: {
  initialCode: string;
  onCommit: (code: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(initialCode);
  const lastSubmittedRef = useRef(initialCode);

  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed === initialCode) return;
    if (!trimmed && !initialCode) return;
    // Enter deliberately blurs the field, which synchronously fires onBlur.
    // Mark the value before awaiting persistence so the blur cannot launch a
    // duplicate guarded write from the same stale item version.
    if (trimmed === lastSubmittedRef.current) return;
    lastSubmittedRef.current = trimmed;
    const saved = await onCommit(trimmed);
    if (!saved) {
      // A failed autosave must not leave the field claiming the unsaved SKU.
      lastSubmittedRef.current = initialCode;
      setDraft(initialCode);
    }
  };

  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      placeholder="SKU / product #"
      enterKeyHint="done"
      autoCapitalize="characters"
      autoCorrect="off"
      spellCheck={false}
      className="h-9 min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3.5 text-base text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
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
