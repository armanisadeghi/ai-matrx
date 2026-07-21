"use client";

/**
 * features/media-capture/components/CaptureLibrary.tsx
 *
 * The /camera management lens — a view over the EXISTING files data layer
 * (cloud-files tree + `useFolderContents`; no second query stack, no ad hoc
 * `.from()` calls) across all three `Captures/` folders:
 *
 *   • kind filter chips (all / photo / video / audio) — client-side on the
 *     owning folder (authoritative for captures) with mime as tiebreak;
 *   • upload-state chips for in-flight capture uploads (cloudFiles slice via
 *     `useCaptureUploadFeed`), retry for failed uploads (re-invokes the
 *     canonical uploader from the diagnostics retry payload), and a
 *     resume-pending indicator for stored TUS sessions;
 *   • a Recovery section over recoverable recording journals — Finish & save
 *     runs the SHARED `finishJournalRecovery` flow (same code as the studio
 *     banner); Discard drops the journal;
 *   • every tile opens the existing viewer (/files/f/[fileId]) and carries
 *     the canonical `FileRightClickMenu` (rename / move / share / download /
 *     delete via the existing hooks — nothing reimplemented here).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  FileAudio,
  History,
  ImageOff,
  Loader2,
  RefreshCw,
  Trash2,
  UploadCloud,
  Video,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  CloudFolders,
  FileRightClickMenu,
  InlineMediaRef,
  listStoredTusUploads,
  useCloudTree,
  useFolderContents,
  type CloudFile,
  type StoredTusUploadSummary,
} from "@/features/files";
import {
  listRecoverable,
  discardJournal,
  type RecoverableJournal,
} from "@/features/media-capture/recording/chunk-journal";
import { finishJournalRecovery } from "@/features/media-capture/recording/journal-recovery";
import { uploadCapture } from "@/features/media-capture/upload/capture-uploader";
import {
  dismissCaptureFailure,
  getCaptureRetryPayload,
  getMediaCaptureDiagnostics,
  refreshCaptureJournals,
  subscribeMediaCaptureDiagnostics,
} from "@/features/media-capture/runtime/mediaCaptureDiagnostics";
import { useCaptureUploadFeed } from "@/features/media-capture/hooks/useCaptureUploadFeed";

type CaptureKindFilter = "all" | "photo" | "video" | "audio";

const FILTERS: Array<{ key: CaptureKindFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "photo", label: "Photos" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Audio" },
];

interface CaptureItem {
  file: CloudFile;
  kind: "photo" | "video" | "audio";
}

function kindOfFile(
  file: CloudFile,
  folderKind: "photo" | "video" | "audio",
): "photo" | "video" | "audio" {
  // The validated capture metadata is authoritative when present.
  const capture = file.metadata?.capture;
  if (capture && typeof capture === "object" && "artifact_kind" in capture) {
    const k = (capture as { artifact_kind: unknown }).artifact_kind;
    if (k === "photo" || k === "video" || k === "audio") return k;
  }
  const mime = file.mimeType ?? "";
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return folderKind;
}

export interface CaptureLibraryProps {
  /** Bumped by the page on every studio save so the lens re-reads promptly. */
  refreshToken?: number;
}

export function CaptureLibrary({ refreshToken = 0 }: CaptureLibraryProps) {
  const userId = useAppSelector(selectUserId);
  const [filter, setFilter] = useState<CaptureKindFilter>("all");

  // ── Existing files data layer only ─────────────────────────────────────────
  const { status, rootFolders } = useCloudTree(userId);
  const treeReady = status === "loaded";
  const capturesFolderId =
    rootFolders.find((f) => f.folderPath === CloudFolders.CAPTURES)?.id ?? null;
  const { folders: capturesChildren } = useFolderContents(capturesFolderId);
  const folderIdFor = useCallback(
    (path: string) =>
      capturesChildren.find((f) => f.folderPath === path)?.id ?? null,
    [capturesChildren],
  );
  const photosId = folderIdFor(CloudFolders.CAPTURES_PHOTOS);
  const videosId = folderIdFor(CloudFolders.CAPTURES_VIDEOS);
  const audioId = folderIdFor(CloudFolders.CAPTURES_AUDIO);

  const photos = useFolderContents(photosId);
  const videos = useFolderContents(videosId);
  const audio = useFolderContents(audioId);

  const items = useMemo<CaptureItem[]>(() => {
    const all: CaptureItem[] = [
      ...photos.files.map((file) => ({ file, kind: kindOfFile(file, "photo") })),
      ...videos.files.map((file) => ({ file, kind: kindOfFile(file, "video") })),
      ...audio.files.map((file) => ({ file, kind: kindOfFile(file, "audio") })),
    ];
    const filtered =
      filter === "all" ? all : all.filter((i) => i.kind === filter);
    return filtered.sort((a, b) =>
      (b.file.updatedAt ?? "").localeCompare(a.file.updatedAt ?? ""),
    );
  }, [photos.files, videos.files, audio.files, filter]);

  const counts = useMemo(
    () => ({
      all: photos.files.length + videos.files.length + audio.files.length,
      photo: photos.files.length,
      video: videos.files.length,
      audio: audio.files.length,
    }),
    [photos.files, videos.files, audio.files],
  );

  const loading =
    !treeReady ||
    (photosId !== null && photos.loading) ||
    (videosId !== null && videos.loading) ||
    (audioId !== null && audio.loading);

  return (
    <section className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Captures
        </h2>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] font-medium tabular-nums transition-colors",
              filter === f.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      <UploadStateChips />
      <RecoverySection refreshToken={refreshToken} />

      {loading ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          No captures yet — photos, videos, and audio you save land under
          Captures/.
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {items.map(({ file, kind }) => (
            <FileRightClickMenu key={file.id} fileId={file.id}>
              <Link
                href={`/files/f/${file.id}`}
                target="_blank"
                className="group relative block aspect-square overflow-hidden rounded-md border border-border bg-muted/30"
                title={file.fileName}
              >
                {kind === "audio" ? (
                  <span className="flex h-full w-full items-center justify-center">
                    <FileAudio className="h-6 w-6 text-muted-foreground" />
                  </span>
                ) : (
                  <InlineMediaRef ref={file.id} size="fill" alt={file.fileName} />
                )}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {kind === "video" && <Video className="h-3 w-3 shrink-0" />}
                  {kind === "audio" && (
                    <FileAudio className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">{file.fileName}</span>
                </span>
              </Link>
            </FileRightClickMenu>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Upload-state chips (in-flight / failed / TUS resume-pending) ────────────

function UploadStateChips() {
  const uploads = useCaptureUploadFeed();
  const diagnostics = useSyncExternalStore(
    subscribeMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
    getMediaCaptureDiagnostics,
  );
  const [tusPending, setTusPending] = useState<StoredTusUploadSummary[]>([]);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listStoredTusUploads().then((entries) => {
      if (!cancelled) setTusPending(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [uploads.length]);

  const inFlight = uploads.filter(
    (u) => u.status === "uploading" || u.status === "pending",
  );
  const failedRing = diagnostics.failures.filter(
    (f) => f.scope === "upload" && f.retryable,
  );

  const handleRetry = useCallback(async (failureId: string) => {
    const payload = getCaptureRetryPayload(failureId);
    if (!payload) {
      dismissCaptureFailure(failureId);
      return;
    }
    setRetrying(failureId);
    try {
      await uploadCapture({ file: payload.file, capture: payload.capture });
      dismissCaptureFailure(failureId);
      toast.success(`"${payload.file.name}" uploaded.`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Retry failed — try again.",
      );
    } finally {
      setRetrying(null);
    }
  }, []);

  if (inFlight.length === 0 && failedRing.length === 0 && tusPending.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-1.5">
      {inFlight.map((u) => (
        <div key={u.requestId} className="flex items-center gap-2 text-xs">
          <UploadCloud className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Uploading {u.fileName}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {u.fileSize > 0
              ? `${Math.round((u.bytesUploaded / u.fileSize) * 100)}%`
              : "…"}
          </span>
        </div>
      ))}
      {failedRing.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Upload failed — {f.message}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            disabled={retrying !== null}
            onClick={() => void handleRetry(f.id)}
          >
            {retrying === f.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <RefreshCw className="mr-1 h-3 w-3" />
                Retry
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            disabled={retrying !== null}
            onClick={() => dismissCaptureFailure(f.id)}
            aria-label="Dismiss failed upload"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
      {tusPending.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <History className="h-3.5 w-3.5 shrink-0" />
          {tusPending.length} resumable upload session
          {tusPending.length === 1 ? "" : "s"} pending — re-saving the same
          file resumes instead of restarting.
        </div>
      )}
    </div>
  );
}

// ─── Recovery section (recoverable recording journals) ───────────────────────

function RecoverySection({ refreshToken }: { refreshToken: number }) {
  const [recoverables, setRecoverables] = useState<RecoverableJournal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const found = await listRecoverable();
        if (!cancelled) setRecoverables(found);
      } catch (err) {
        console.error("[CaptureLibrary] recovery listing failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const remove = useCallback((captureId: string) => {
    setRecoverables((prev) =>
      prev.filter((r) => r.manifest.capture_id !== captureId),
    );
    void refreshCaptureJournals();
  }, []);

  const handleFinish = useCallback(
    async (entry: RecoverableJournal) => {
      const id = entry.manifest.capture_id;
      setBusy(id);
      try {
        // Shared flow — identical to the Capture Studio recovery banner.
        const result = await finishJournalRecovery(entry);
        remove(id);
        if (result.outcome === "empty") {
          toast.error("Nothing recoverable — no media chunks survived.");
        } else {
          toast.success(`${result.recoveredNote} — saved to your captures.`);
        }
      } catch (err) {
        console.error("[CaptureLibrary] recovery failed", err);
        toast.error(
          err instanceof Error
            ? err.message
            : "Recovering the recording failed.",
        );
      } finally {
        setBusy(null);
      }
    },
    [remove],
  );

  const handleDiscard = useCallback(
    async (captureId: string) => {
      setBusy(captureId);
      try {
        await discardJournal(captureId);
      } catch (err) {
        console.error("[CaptureLibrary] recovery discard failed", err);
      } finally {
        setBusy(null);
      }
      remove(captureId);
    },
    [remove],
  );

  if (recoverables.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5">
      {recoverables.map((entry) => (
        <div
          key={entry.manifest.capture_id}
          className="flex items-center gap-2 py-0.5 text-xs"
        >
          <History className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
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
            className="h-6 px-2 text-[11px]"
            disabled={busy !== null}
            onClick={() => void handleFinish(entry)}
          >
            {busy === entry.manifest.capture_id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Finish & save"
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            disabled={busy !== null}
            onClick={() => void handleDiscard(entry.manifest.capture_id)}
            aria-label="Discard recovered recording"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}
