"use client";

/**
 * Audio import dialog for the Raw column. Three sources:
 *   - **File**: drag-drop or browse a local audio/video file. Uploads
 *     through the universal file handler into cld_files, then transcribes.
 *   - **URL**: paste a cld_files signed URL (mint via the handler or via
 *     `Files.getSignedUrl`). The transcribe route allowlist accepts
 *     Python backend + AWS S3 signed URLs only.
 *   - **Cloud Files**: opens the Cloud Files window so the user can pick
 *     a file they've already uploaded.
 *
 * Each whisper segment in the transcription response becomes one
 * `studio_raw_segments` row, with `t_start/t_end` shifted so imported
 * content lands after any pre-existing recorded segments. `source` is
 * set to `"imported"` for audit/UX filtering.
 */

import { useCallback, useRef, useState } from "react";
import {
  CloudUpload,
  FileAudio,
  FolderOpen,
  Link as LinkIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  saveAudioToStorage,
  getAudioUrl,
} from "@/features/transcripts/service/audioStorageService";
import { rawSegmentsAppended } from "../../redux/slice";
import { insertRawSegment } from "../../service/studioService";
import type { RawSegment } from "../../types";
import { cn } from "@/lib/utils";

interface AudioImportDialogProps {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Mode = "file" | "url" | "cloud";

interface WhisperSegment {
  start?: number;
  end?: number;
  text: string;
}

interface TranscribeUrlResponse {
  success?: boolean;
  text?: string;
  duration?: number | null;
  segments?: WhisperSegment[];
  error?: string;
}

const ACCEPTED_TYPES =
  "audio/*,video/*,.mp3,.m4a,.wav,.webm,.ogg,.mp4,.mov,.flac";

export function AudioImportDialog({
  sessionId,
  open,
  onOpenChange,
}: AudioImportDialogProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  // Read tail-time straight from the store at submit time so concurrent
  // recording chunks (which can land via realtime mid-import) don't collide
  // with the imported segments on tStart or chunkIndex. See
  // PasteRawContentDialog for the same pattern + rationale.
  const store = useAppStore();
  const [mode, setMode] = useState<Mode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const readTail = useCallback((): {
    nextChunkIndex: number;
    tailTime: number;
  } => {
    const state = store.getState();
    const ids = state.transcriptStudio.rawIdsBySession[sessionId];
    const byId = state.transcriptStudio.rawById[sessionId];
    if (!ids || !byId || ids.length === 0) {
      return { nextChunkIndex: 0, tailTime: 0 };
    }
    let maxChunk = -1;
    let maxTEnd = 0;
    for (const id of ids) {
      const seg = byId[id];
      if (!seg) continue;
      if (seg.chunkIndex > maxChunk) maxChunk = seg.chunkIndex;
      if (seg.tEnd > maxTEnd) maxTEnd = seg.tEnd;
    }
    return { nextChunkIndex: maxChunk + 1, tailTime: maxTEnd };
  }, [sessionId, store]);

  const reset = useCallback(() => {
    setFile(null);
    setUrl("");
    setBusy(false);
    setProgressLabel(null);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onOpenChange(false);
  }, [busy, reset, onOpenChange]);

  const ingestSegments = useCallback(
    async (segments: WhisperSegment[], fallbackText: string) => {
      // Coalesce empty / falsy segments and ensure we always have at least
      // one segment to insert (empty audio still produces "" — toast and bail).
      const cleaned = segments.filter((s) => s.text.trim().length > 0);
      if (cleaned.length === 0) {
        if (!fallbackText.trim()) {
          throw new Error("Transcription returned no text.");
        }
        // Whisper sometimes drops segments but provides full text — split
        // on punctuation so we still get a few rows on the timeline.
        const sentences = fallbackText
          .split(/(?<=[.?!])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const synth = sentences.map((text, i) => ({
          start: i * 5,
          end: (i + 1) * 5,
          text,
        }));
        cleaned.push(...synth);
      }

      // Snapshot tail ONCE at the start so all whisper segments stay in their
      // relative time order (whisper's t_start values are 0-based per-import,
      // we shift them to live after the session tail). chunkIndex per
      // iteration re-reads from store to dodge live recording collisions.
      const { tailTime } = readTail();
      const inserted: RawSegment[] = [];
      for (const seg of cleaned) {
        const baseStart = typeof seg.start === "number" ? seg.start : 0;
        const baseEnd =
          typeof seg.end === "number" && seg.end > baseStart
            ? seg.end
            : baseStart + 1;
        const { nextChunkIndex } = readTail();
        const persisted = await insertRawSegment({
          sessionId,
          chunkIndex: nextChunkIndex,
          tStart: tailTime + baseStart,
          tEnd: tailTime + baseEnd,
          text: seg.text.trim(),
          source: "imported",
        });
        inserted.push(persisted);
      }
      dispatch(rawSegmentsAppended({ sessionId, segments: inserted }));
      return inserted.length;
    },
    [dispatch, sessionId, readTail],
  );

  const transcribeStorageUrl = useCallback(async (storageUrl: string) => {
    const res = await fetch("/api/audio/transcribe-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: storageUrl }),
    });
    const data = (await res.json()) as TranscribeUrlResponse;
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Transcription failed (${res.status}).`);
    }
    return data;
  }, []);

  const handleSubmitFile = useCallback(async () => {
    if (!file || !userId) return;
    try {
      setBusy(true);
      setProgressLabel("Uploading audio…");
      // Imported audio is a file the user deliberately chose, so it stays a
      // visible user file (no `origin: "transcripts"` tag, not relocated/hidden)
      // — unlike mic recordings, which the backend hides under system-files/.
      const upload = await saveAudioToStorage(
        file,
        userId,
        (_pct, status) => {
          setProgressLabel(status);
        },
        5,
        { source: "import" },
      );
      setProgressLabel("Transcribing…");
      const signedUrl = await getAudioUrl(upload.fileId);
      const data = await transcribeStorageUrl(signedUrl);
      const count = await ingestSegments(data.segments ?? [], data.text ?? "");
      toast.success(
        `Imported ${count} segment${count === 1 ? "" : "s"} from "${file.name}".`,
      );
      reset();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import audio.";
      toast.error(message);
      setBusy(false);
      setProgressLabel(null);
    }
  }, [file, userId, transcribeStorageUrl, ingestSegments, reset, onOpenChange]);

  const handleSubmitUrl = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      setBusy(true);
      setProgressLabel("Transcribing…");
      const data = await transcribeStorageUrl(trimmed);
      const count = await ingestSegments(data.segments ?? [], data.text ?? "");
      toast.success(`Imported ${count} segment${count === 1 ? "" : "s"}.`);
      reset();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import audio.";
      toast.error(message);
      setBusy(false);
      setProgressLabel(null);
    }
  }, [url, transcribeStorageUrl, ingestSegments, reset, onOpenChange]);

  const openCloudFiles = useCallback(() => {
    dispatch(openOverlay({ overlayId: "cloudFilesWindow" }));
    toast.info(
      "Pick an audio file in Cloud Files, copy its URL, and paste it into the URL tab.",
    );
  }, [dispatch]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }, []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : handleClose())}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import audio</DialogTitle>
          <DialogDescription>
            Transcribe an existing audio or video file into this session. Each
            detected speech segment becomes a row on the Raw timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="flex border-b border-border">
          {[
            { id: "file" as const, icon: FileAudio, label: "Upload file" },
            { id: "url" as const, icon: LinkIcon, label: "From URL" },
            { id: "cloud" as const, icon: FolderOpen, label: "Cloud Files" },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMode(tab.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors",
                  "border-b-2",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {mode === "file" && (
          <div className="flex flex-col gap-3">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-10 text-center transition-colors",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-accent/30",
              )}
            >
              <CloudUpload className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">
                Drop an audio or video file here
              </div>
              <div className="text-xs text-muted-foreground">
                or click to browse — mp3, m4a, wav, webm, mp4, etc.
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0];
                  if (picked) setFile(picked);
                }}
              />
            </div>
            {file && (
              <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatBytes(file.size)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label="Remove file"
                  disabled={busy}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-end gap-1.5">
              <CancelButton onClick={handleClose} disabled={busy} />
              <SubmitButton
                disabled={!file || !userId || busy}
                busy={busy}
                onClick={handleSubmitFile}
                label={
                  busy ? (progressLabel ?? "Working…") : "Upload + transcribe"
                }
              />
            </div>
          </div>
        )}

        {mode === "url" && (
          <div className="flex flex-col gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a cld_files signed URL"
              autoFocus
              disabled={busy}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">
              For now we only transcribe URLs that point to your cloud files. To
              import from a public link (e.g. YouTube), download the audio first
              and use the Upload tab.
            </p>
            <div className="flex items-center justify-end gap-1.5">
              <CancelButton onClick={handleClose} disabled={busy} />
              <SubmitButton
                disabled={!url.trim() || busy}
                busy={busy}
                onClick={handleSubmitUrl}
                label={
                  busy ? (progressLabel ?? "Transcribing…") : "Transcribe URL"
                }
              />
            </div>
          </div>
        )}

        {mode === "cloud" && (
          <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-card/40 px-4 py-6 text-center">
            <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="text-sm font-medium">
              Pick from your cloud files
            </div>
            <div className="text-xs text-muted-foreground">
              Opens your Cloud Files browser. Copy the URL of the audio you want
              to transcribe, then paste it into the <b>From URL</b> tab.
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={openCloudFiles}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Upload className="h-3.5 w-3.5" />
                Open Cloud Files
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CancelButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-accent/40 hover:text-foreground disabled:cursor-wait"
    >
      Cancel
    </button>
  );
}

function SubmitButton({
  onClick,
  disabled,
  busy,
  label,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Upload className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
