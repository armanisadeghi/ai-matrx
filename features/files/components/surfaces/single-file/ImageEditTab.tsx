/**
 * features/files/components/surfaces/single-file/ImageEditTab.tsx
 *
 * Image Edit tab body for SingleFileShell + PreviewPane. Mounts the
 * canonical Image Studio Edit shell (`EditModeShell`) inside the file
 * viewer's Edit tab so users get Filerobot crop / rotate / flip / resize /
 * fine-tune / filters / annotate / watermark plus the AI toolbar
 * (Remove BG, Upscale, AI edit by prompt) without leaving `/files/f/{id}`.
 *
 * Wiring contract:
 *   - File id → cloud-file record via `selectFileById`.
 *   - Cloud file → renderable URL via `useFileSrc({ kind: "file_id", fileId })`.
 *     The handler auto-picks CDN / share-link / signed URL.
 *   - The resolved URL is passed as `source = { kind: "url", url, ... }`
 *     while the original cloud-file id is plumbed through `cloudFileId`
 *     so the AI toolbar (which needs a `source_id` for Python ops) still
 *     works. Without that prop, the toolbar's Remove BG / Upscale / AI
 *     edit buttons would be disabled even though we know the id.
 *   - Save lands in the SOURCE file's parent folder (or `Images/Edited/`
 *     if the source is at the root) with a "-edited" suffix on the
 *     filename. Creates a new `cld_files` row — the action surfaces a
 *     toast with a link to the result.
 *
 * Dynamic import is mandatory: `EditModeShell` polyfills `globalThis.React`
 * inside its own dynamic-import factory (Filerobot 5.0.1 has a bare
 * `React.createElement` regression) and must not be statically imported.
 *
 * Mounting rules:
 *   - Render inside an always-mounted tab body (FileTabsBody keeps the
 *     Preview blob alive between switches). The dynamic import here is
 *     `loading: …` deferred so the Edit tab body is empty until the user
 *     focuses it.
 *   - This component must work in BOTH surfaces (`PreviewPane` side panel
 *     and `SingleFileShell` full page). Filerobot crowds the side panel
 *     but doesn't break — that's the trade-off of being always-mounted.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Image as ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectFileById,
  selectFolderById,
} from "@/features/files/redux/selectors";
import { useFileSrc } from "@/features/files/handler/hooks/useFileSrc";
import type { SaveResult } from "@/features/image-studio/modes/shared/types";

const EditModeShell = dynamic(
  () =>
    import("@/features/image-studio/modes/edit/EditModeShell").then(
      (mod) => mod.EditModeShell,
    ),
  { ssr: false, loading: () => <ShellSkeleton /> },
);

export interface ImageEditTabProps {
  fileId: string;
  className?: string;
}

const FALLBACK_FOLDER = "Images/Edited";

export function ImageEditTab({ fileId, className }: ImageEditTabProps) {
  const router = useRouter();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const parentFolder = useAppSelector((s) =>
    file?.parentFolderId ? selectFolderById(s, file.parentFolderId) : null,
  );

  const url = useFileSrc(fileId ? { kind: "file_id", fileId } : null);

  const [lastSave, setLastSave] = useState<SaveResult | null>(null);

  // EditModeShell saves go through `saveEditedImage` → `fileHandler.upload`
  // with `folderPath: defaultFolder`. Files default to the source's parent
  // folder so edits live next to the original; if the source is at the
  // root we drop into `Images/Edited/` instead of polluting root.
  const defaultFolder = useMemo(() => {
    const folderPath = parentFolder?.folderPath;
    if (folderPath && folderPath.trim() && folderPath !== "/")
      return folderPath;
    return FALLBACK_FOLDER;
  }, [parentFolder?.folderPath]);

  const source = useMemo(() => {
    if (!url || !file) return null;
    return {
      kind: "url" as const,
      url,
      suggestedFilename: file.fileName,
    };
  }, [url, file]);

  const handleSaveResult = useCallback(
    (result: SaveResult) => {
      setLastSave(result);
      toast.success("Image saved", {
        description: result.filename,
        action: {
          label: "Open",
          onClick: () => router.push(`/files/f/${result.fileId}`),
        },
      });
    },
    [router],
  );

  if (!file) {
    return (
      <EmptyState
        title="File not loaded"
        description="The file metadata hasn't hydrated yet."
        className={className}
      />
    );
  }

  if (!url || !source) {
    return (
      <EmptyState
        title="Resolving image…"
        description="Loading a renderable URL for this file."
        className={className}
        loading
      />
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 w-full flex-col", className)}>
      {/* Slim header: "Open in Image Studio" escape hatch + last-save chip. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-1.5">
        <ImageIcon
          className="h-3.5 w-3.5 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-[11px] font-medium text-muted-foreground">
          Edit image
        </span>
        {lastSave ? (
          <Link
            href={`/files/f/${lastSave.fileId}`}
            className="ml-2 truncate text-[11px] text-primary hover:underline"
            title={`Open ${lastSave.filename}`}
          >
            Saved: {lastSave.filename}
          </Link>
        ) : null}
        <div className="ml-auto">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            title="Open the file in the full Image Studio (more space + side-by-side history)"
          >
            <Link
              href={`/images/edit/${encodeURIComponent(fileId)}`}
            >
              <ExternalLink className="h-3 w-3" />
              Open in Image Studio
            </Link>
          </Button>
        </div>
      </div>

      {/* EditModeShell owns its own internal layout (Filerobot + AI bar).
       * Pass cloudFileId alongside the url-kind source so the AI toolbar
       * stays functional. */}
      <div className="min-h-0 flex-1">
        <EditModeShell
          source={source}
          cloudFileId={fileId}
          defaultFolder={defaultFolder}
          presentation="page"
          onSave={handleSaveResult}
        />
      </div>
    </div>
  );
}

function EmptyState({
  title,
  description,
  loading,
  className,
}: {
  title: string;
  description: string;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted/10 p-6",
        className,
      )}
    >
      <div className="max-w-sm space-y-2 text-center">
        {loading ? (
          <Loader2
            className="mx-auto h-6 w-6 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ImageIcon
            className="mx-auto h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="flex-1 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

export default ImageEditTab;
