"use client";

// features/exports/components/ExportDropZone.tsx
//
// The door. Drop the .zip / .tgz / .mbox a service handed you, watch real
// bytes move, then land on the Library.
//
// TRANSPORT. Uploading goes through `useFileUpload()` — the single React-side
// upload primitive — which reaches `cloudUpload`, the ONE upload primitive in
// this app (`features/files/upload/cloudUpload.ts`). It routes anything at or
// above `RESUMABLE_UPLOAD_THRESHOLD_BYTES` (80 MB) through the resumable TUS
// transport automatically, which is what makes a multi-gigabyte Google Takeout
// survivable: 16 MiB chunks, a fresh JWT per chunk, and the resume URL kept in
// its own IndexedDB. An export is routinely multi-GB, so `transport` is never
// overridden down.
//
// RESUME IS SHOWN, NOT ASSUMED. `listStoredTusUploads()` is how a pending
// session becomes visible — a person whose laptop slept mid-upload is told the
// session is still there and that re-dropping the same file continues it,
// instead of watching a progress bar start at zero and guessing.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  FileArchive,
  Loader2,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useFileUpload } from "@/features/files/handler/hooks/useFileUpload";
import {
  listResumableUploads,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  type ResumableUpload,
} from "@/features/files/handler/resumableUploads";
import { extractErrorMessage } from "@ai-matrx/data/net";
import { createExportLibrary } from "../api";
import { formatBytes } from "../format";
import { rememberFreshExport } from "../freshExport";

type Stage =
  | { phase: "idle" }
  | { phase: "uploading"; file: File; loaded: number; total: number; resumable: boolean }
  | { phase: "detecting"; file: File }
  | { phase: "failed"; file: File | null; message: string };

function FailedNotice({
  stage,
  onRetry,
}: {
  stage: Extract<Stage, { phase: "failed" }>;
  onRetry: (file: File) => void;
}) {
  const file = stage.file;
  return (
    <div className="mx-auto mt-4 max-w-md rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-left">
      <p className="flex items-start gap-2 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{stage.message}</span>
      </p>
      {file && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => onRetry(file)}
        >
          <RotateCcw className="h-4 w-4" />
          Try {file.name} again
        </Button>
      )}
    </div>
  );
}

export function ExportDropZone({ className }: { className?: string }) {
  const router = useRouter();
  const { upload } = useFileUpload();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>({ phase: "idle" });
  const [pendingResumes, setPendingResumes] = useState<ResumableUpload[]>([]);

  const refreshResumes = useCallback(() => {
    void listResumableUploads().then(setPendingResumes);
  }, []);

  useEffect(() => {
    refreshResumes();
  }, [refreshResumes]);

  const start = useCallback(
    async (file: File) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const resumable = file.size >= RESUMABLE_UPLOAD_THRESHOLD_BYTES;
      setStage({
        phase: "uploading",
        file,
        loaded: 0,
        total: file.size,
        resumable,
      });

      let fileId: string;
      try {
        const uploaded = await upload({ kind: "file", file }, {
          folderPath: "Exports",
          signal: controller.signal,
          onProgress: (loaded, total) =>
            setStage((current) =>
              current.phase === "uploading"
                ? { ...current, loaded, total: total || file.size }
                : current,
            ),
          metadata: { origin: "bring-your-export" },
        });
        fileId = uploaded.fileId;
      } catch (error: unknown) {
        // A cancelled workspace prompt and a real failure both land here, and
        // both deserve the reason in words rather than a silent reset.
        setStage({ phase: "failed", file, message: extractErrorMessage(error) });
        refreshResumes();
        return;
      }

      refreshResumes();
      setStage({ phase: "detecting", file });

      try {
        const created = await createExportLibrary({ fileId, name: file.name });
        // The next screen reads the Library from the server, but it can paint
        // the moment it mounts because the answer we already have travels with
        // the navigation (sessionStorage, one key, cleared on read).
        rememberFreshExport(created);
        router.push(`/exports/${created.library.id}`);
      } catch (error: unknown) {
        setStage({ phase: "failed", file, message: extractErrorMessage(error) });
      }
    },
    [refreshResumes, router, upload],
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void start(file);
    },
    [start],
  );

  const busy = stage.phase === "uploading" || stage.phase === "detecting";

  return (
    <div className={cn("space-y-3", className)}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) onFiles(event.dataTransfer.files);
        }}
        className={cn(
          "relative rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors sm:px-8 sm:py-12",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border bg-card hover:border-muted-foreground/40",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          onChange={(event) => onFiles(event.target.files)}
          accept=".zip,.tgz,.tar.gz,.gz,.mbox,.json,.txt,.7z"
        />

        {stage.phase === "idle" || stage.phase === "failed" ? (
          <>
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <FileArchive className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="text-base font-semibold sm:text-lg">
              Drop the file the service gave you
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              The .zip, .tgz or .mbox you downloaded from Google, Slack,
              LinkedIn, WhatsApp, Notion and the rest. Nothing to unpack, no
              size limit to worry about.
            </p>
            <Button
              className="mt-4 h-11 lg:h-9"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Choose a file
            </Button>
          </>
        ) : null}

        {stage.phase === "uploading" && (
          <div className="mx-auto max-w-md text-left">
            <div className="flex min-w-0 items-center gap-2">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {stage.file.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cancel the upload"
                onClick={() => abortRef.current?.abort()}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Progress
              className="mt-3"
              value={
                stage.total > 0 ? (stage.loaded / stage.total) * 100 : 0
              }
            />
            {/* Real bytes, both numbers — never a percentage on its own. */}
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              {formatBytes(stage.loaded)} of {formatBytes(stage.total)}
              {stage.resumable
                ? " · resumable — if this is interrupted, drop the same file again and it continues"
                : ""}
            </p>
          </div>
        )}

        {stage.phase === "detecting" && (
          <div className="mx-auto max-w-md">
            <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
            <p className="text-sm font-medium">Uploaded. Working out what it is…</p>
            <p className="mt-1 text-xs text-muted-foreground">{stage.file.name}</p>
          </div>
        )}

        {stage.phase === "failed" && (
          <FailedNotice stage={stage} onRetry={start} />
        )}
      </div>

      {pendingResumes.length > 0 && stage.phase === "idle" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2.5 text-sm">
          <p className="font-medium">
            {pendingResumes.length === 1
              ? "One upload was interrupted"
              : `${pendingResumes.length} uploads were interrupted`}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {pendingResumes.slice(0, 3).map((resume) => (
              <li key={resume.urlStorageKey} className="truncate">
                {resume.metadata.filename ?? "a file"}
                {resume.size ? ` · ${formatBytes(resume.size)}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Drop the same file again and it continues from where it stopped —
            nothing already sent is uploaded twice.
          </p>
        </div>
      )}
    </div>
  );
}
