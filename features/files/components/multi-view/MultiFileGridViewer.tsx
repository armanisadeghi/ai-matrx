/**
 * features/files/components/multi-view/MultiFileGridViewer.tsx
 *
 * Full-viewport grid that renders an arbitrary set of files passed by ID.
 * Designed to maximise pixels on the actual content — no sidebars, no nav,
 * just a tiny corner control to exit. Used by the "Open in grid" bulk action
 * via the `/files/view?ids=…` route.
 *
 * Behaviour:
 *   - Smart `cols × rows` layout that adapts to item count and the live
 *     viewport aspect ratio (see `grid-layout.ts`).
 *   - Click a tile to enter focus mode (single image full-bleed). Arrow keys
 *     navigate, ESC exits focus. ESC at the top level closes the page.
 *   - Close button does `router.back()` when we have history, else
 *     `window.close()` — supports both new-tab and same-tab callers.
 *   - Images use the master URL via `useFileSrc` for full fidelity; every
 *     other kind falls back to `MediaThumbnail`.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import { MediaThumbnail } from "@/features/files/components/core/MediaThumbnail/MediaThumbnail";
import { pickGridLayout } from "./grid-layout";
import type { CloudFile } from "@/features/files/types";

export interface ViewerFile {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  thumbnailUrl: string | null;
  publicUrl: string | null;
  metadata: Record<string, unknown> | null;
}

function toMediaThumbnailFile(
  file: ViewerFile,
): Pick<
  CloudFile,
  | "id"
  | "fileName"
  | "mimeType"
  | "fileSize"
  | "metadata"
  | "publicUrl"
  | "thumbnailUrl"
> {
  return {
    id: file.id,
    fileName: file.fileName,
    mimeType: file.mimeType,
    fileSize: file.fileSize,
    metadata: file.metadata ?? {},
    publicUrl: file.publicUrl,
    thumbnailUrl: file.thumbnailUrl,
  };
}

interface Props {
  files: ViewerFile[];
}

export function MultiFileGridViewer({ files }: Props) {
  const router = useRouter();
  const [viewport, setViewport] = useState({ w: 1920, h: 1080 });
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const handleClose = useCallback(() => {
    if (window.history.length > 1) {
      router.back();
    } else {
      window.close();
    }
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (focusIndex === null) {
        if (e.key === "Escape") handleClose();
        return;
      }
      if (e.key === "Escape") setFocusIndex(null);
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setFocusIndex((i) => (i! + 1) % files.length);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setFocusIndex((i) => (i! - 1 + files.length) % files.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusIndex, files.length, handleClose]);

  const pick = useMemo(
    () => pickGridLayout(files.length, viewport.w / viewport.h),
    [files.length, viewport.w, viewport.h],
  );

  if (files.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">No files to display.</p>
        <button
          type="button"
          onClick={handleClose}
          className="text-xs text-primary hover:underline"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <CornerControls
        count={files.length}
        focusIndex={focusIndex}
        onClose={handleClose}
        onExitFocus={() => setFocusIndex(null)}
      />

      {focusIndex !== null ? (
        <FocusView
          files={files}
          index={focusIndex}
          onPrev={() =>
            setFocusIndex((i) => (i! - 1 + files.length) % files.length)
          }
          onNext={() => setFocusIndex((i) => (i! + 1) % files.length)}
        />
      ) : (
        <div
          className="flex-1 grid gap-1 p-1"
          style={{
            gridTemplateColumns: `repeat(${pick.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${pick.rows}, minmax(0, 1fr))`,
          }}
        >
          {files.map((f, i) => (
            <GridTile
              key={f.id}
              file={f}
              onClick={() => setFocusIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Corner controls ─────────────────────────────────────────────────────

function CornerControls({
  count,
  focusIndex,
  onClose,
  onExitFocus,
}: {
  count: number;
  focusIndex: number | null;
  onClose: () => void;
  onExitFocus: () => void;
}) {
  return (
    <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
      <span className="text-[11px] tabular-nums text-muted-foreground bg-card/80 backdrop-blur border border-border px-2 py-1 rounded-full">
        {focusIndex !== null ? `${focusIndex + 1} / ${count}` : `${count} items`}
      </span>
      {focusIndex !== null ? (
        <button
          type="button"
          onClick={onExitFocus}
          title="Back to grid (Esc)"
          className="flex items-center gap-1 text-xs text-foreground bg-card/80 hover:bg-card backdrop-blur border border-border px-2 py-1 rounded-full"
        >
          Grid
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        title="Close (Esc)"
        aria-label="Close"
        className="flex h-7 w-7 items-center justify-center rounded-full bg-card/80 backdrop-blur border border-border text-foreground hover:bg-card"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Tile ────────────────────────────────────────────────────────────────

function GridTile({
  file,
  onClick,
}: {
  file: ViewerFile;
  onClick: () => void;
}) {
  const isImage = file.mimeType.startsWith("image/");
  const url = useFileSrc(isImage ? { kind: "file_id", fileId: file.id } : null);

  return (
    <button
      type="button"
      onClick={onClick}
      title={file.fileName}
      className={cn(
        "relative overflow-hidden rounded bg-muted",
        "transition-shadow hover:ring-2 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-primary outline-none",
      )}
    >
      {isImage ? (
        url ? (
          <img
            src={url}
            alt={file.fileName}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )
      ) : (
        <MediaThumbnail
          file={toMediaThumbnailFile(file)}
          className="absolute inset-0 h-full w-full"
        />
      )}
    </button>
  );
}

// ─── Focus view ──────────────────────────────────────────────────────────

function FocusView({
  files,
  index,
  onPrev,
  onNext,
}: {
  files: ViewerFile[];
  index: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const file = files[index];
  const isImage = file.mimeType.startsWith("image/");
  const url = useFileSrc(isImage ? { kind: "file_id", fileId: file.id } : null);

  return (
    <div className="relative flex-1 flex items-center justify-center bg-background">
      {isImage ? (
        url ? (
          <img
            src={url}
            alt={file.fileName}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="h-full w-full max-h-[80dvh] max-w-[80vw] animate-pulse bg-muted" />
        )
      ) : (
        <MediaThumbnail
          file={toMediaThumbnailFile(file)}
          className="h-full max-h-[80dvh] aspect-square"
        />
      )}

      {files.length > 1 ? (
        <>
          <button
            type="button"
            onClick={onPrev}
            title="Previous (←)"
            aria-label="Previous"
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-card/80 backdrop-blur border border-border text-foreground hover:bg-card"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            title="Next (→)"
            aria-label="Next"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-card/80 backdrop-blur border border-border text-foreground hover:bg-card"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 max-w-[80vw] truncate rounded-full bg-card/80 backdrop-blur border border-border px-3 py-1 text-xs text-foreground">
        {file.fileName}
      </div>
    </div>
  );
}
