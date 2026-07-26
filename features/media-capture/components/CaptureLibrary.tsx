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
 *   • `<CaptureTransportStrip>` — in-flight uploads, failed uploads with Retry,
 *     TUS resume-pending (shared with the Media window's Camera tab);
 *   • `<CaptureRecoverySection>` — recoverable journals; Finish & save runs the
 *     SHARED `finishJournalRecovery` flow (same code as the studio banner);
 *   • every tile opens the existing viewer (/files/f/[fileId]), carries the
 *     canonical `FileRightClickMenu` on right-click, AND exposes an explicit
 *     three-dot `<CaptureItemActions>` menu — Preview / Download / Copy link /
 *     Rename / Move / Share / Transcribe / Delete, every one of them on the
 *     canonical files action stack (`useFileMenuActions` → `useFileActions`
 *     thunks, `useFileMutation`, `openFolderPicker`, `RenameDialog`,
 *     `PermissionsDialog`). Nothing about files is reimplemented here.
 *
 * Sorted newest-first. There is no second query stack and no second mutation
 * path — this file is a LENS over `files.files`.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { FileAudio, ImageOff, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { FileRightClickMenu } from "@/features/files/components/core/FileContextMenu/FileRightClickMenu";
import { useCloudTree } from "@/features/files/hooks/useCloudTree";
import { useFolderContents } from "@/features/files/hooks/useFolderContents";
import type { CloudFile } from "@/features/files/types";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { CaptureRecoverySection } from "@/features/media-capture/components/CaptureRecoverySection";
import { CaptureTransportStrip } from "@/features/media-capture/components/CaptureTransportStrip";
import { CaptureItemActions } from "@/features/media-capture/components/CaptureItemActions";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";

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
  // Bumped when a recovery saves a new capture so the recovery list re-reads.
  const [recoveryToken, setRecoveryToken] = useState(0);

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
      ...photos.files.map((file) => ({
        file,
        kind: kindOfFile(file, "photo"),
      })),
      ...videos.files.map((file) => ({
        file,
        kind: kindOfFile(file, "video"),
      })),
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

      <CaptureTransportStrip />
      <CaptureRecoverySection
        refreshToken={refreshToken + recoveryToken}
        onRecovered={() => setRecoveryToken((t) => t + 1)}
      />

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
            <CaptureTile key={file.id} file={file} kind={kind} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Tile ────────────────────────────────────────────────────────────────────

/**
 * One capture. Right-click gets the universal v3 file menu
 * (`FileRightClickMenu`); the three-dot button — always visible on touch,
 * hover-revealed on desktop — gets the same
 * actions plus Move / Share / Transcribe via `<CaptureItemActions>` — so the
 * management affordance is DISCOVERABLE, not hidden behind a right-click.
 */
function CaptureTile({
  file,
  kind,
}: {
  file: CloudFile;
  kind: "photo" | "video" | "audio";
}) {
  return (
    <FileRightClickMenu fileId={file.id}>
      <div
        className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/30"
        title={file.fileName}
      >
        <Link
          href={`/files/f/${file.id}`}
          target="_blank"
          className="block h-full w-full"
          aria-label={`Open ${file.fileName}`}
        >
          {kind === "audio" ? (
            <span className="flex h-full w-full items-center justify-center">
              <FileAudio className="h-6 w-6 text-muted-foreground" />
            </span>
          ) : (
            <CaptureThumb fileId={file.id} alt={file.fileName} />
          )}
        </Link>

        {/* Always visible on touch (there is no hover to reveal it); hover-
            revealed from sm: up so desktop tiles stay clean. */}
        <div className="absolute right-1 top-1 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
          <CaptureItemActions
            fileId={file.id}
            fileName={file.fileName}
            kind={kind}
            parentFolderId={file.parentFolderId}
          />
        </div>

        {/* The filename caption is the only identity a tile carries — on touch
            it must not be hidden behind a hover that can never happen. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3 text-[10px] text-white transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          {kind === "video" && <Video className="h-3 w-3 shrink-0" />}
          {kind === "audio" && <FileAudio className="h-3 w-3 shrink-0" />}
          <span className="truncate">{file.fileName}</span>
        </span>
      </div>
    </FileRightClickMenu>
  );
}
