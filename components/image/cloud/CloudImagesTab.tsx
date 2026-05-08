/**
 * components/image/cloud/CloudImagesTab.tsx
 *
 * Live image gallery sourced from the user's cloud-files Redux slice.
 * Filters to image-MIME records, supports search, a Recents (last 30d)
 * filter, and a view-mode toggle (Cozy / Compact / List). All view-mode
 * state is persisted to `localStorage` under
 * `image-manager:cloud-images-view`.
 *
 * Selection writes `ImageSource` with `type: "cloud-file"` and stashes
 * `metadata.fileId` so downstream features can deep-link back into the
 * cloud-files surfaces (preview, share, restore version).
 *
 * Browse-mode click resolves only the *clicked* file's URL (not every
 * visible image's URL) and opens it in the floating ImageViewerWindow.
 * Resolving every image up-front was wasteful and pushed
 * `ResolvedCloudUrl` objects instead of strings into the viewer, which
 * is why the window appeared empty.
 */

"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Download,
  FolderInput,
  Globe,
  ImageOff,
  Loader2,
  Clock,
  Cloud,
  LayoutGrid,
  Grid3x3,
  List as ListIcon,
  Lock,
  SlidersHorizontal,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { SearchInput } from "@/components/official/SearchInput";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@/components/official/bottom-sheet/BottomSheet";
import { Button } from "@/components/ui/button";
import EmptyStateCard from "@/components/official/cards/EmptyStateCard";
import { FloatingSelectionToolbar } from "@/components/shared/FloatingSelectionToolbar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectActiveUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectAllFilesArray,
  selectTreeStatus,
} from "@/features/files/redux/selectors";
import {
  deleteFile,
  getSignedUrl,
  loadUserFileTree,
  moveFile,
  updateFileMetadata,
} from "@/features/files/redux/thunks";
import { isImageMime, resolveMime } from "@/features/files/utils/file-types";
import type { CloudFileRecord, Visibility } from "@/features/files/types";
import {
  useSelectedImages,
  type ImageSource,
} from "@/components/image/context/SelectedImagesProvider";
import {
  buildCloudImageSource,
  resolveCloudFileUrl,
} from "@/components/image/cloud/resolveCloudFileUrl";
import { ImageGrid } from "@/components/image/shared/ImageGrid";
import { CloudImageGrid } from "@/components/image/cloud/CloudImageGrid";
import { CloudImageList } from "@/components/image/cloud/CloudImageList";
import { useBrowseAction } from "@/features/image-manager/browse/BrowseImageProvider";
import { CloudFileMetadataSheet } from "@/features/image-manager/components/CloudFileMetadataSheet";
import { openFolderPicker } from "@/features/files/components/pickers/CloudFilesPickerHost";
import { toast } from "sonner";

const RECENTS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type ViewMode = "cozy" | "compact" | "list";
const VIEW_STORAGE_KEY = "image-manager:cloud-images-view";

const VIEW_OPTIONS: { id: ViewMode; label: string; icon: LucideIcon }[] = [
  { id: "cozy", label: "Cozy grid", icon: LayoutGrid },
  { id: "compact", label: "Compact grid", icon: Grid3x3 },
  { id: "list", label: "List", icon: ListIcon },
];

function loadInitialView(): ViewMode {
  if (typeof window === "undefined") return "cozy";
  try {
    const v = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (v === "cozy" || v === "compact" || v === "list") return v;
  } catch {
    /* ignore */
  }
  return "cozy";
}

export interface CloudImagesTabProps {
  /**
   * Optional legacy URLs passed by callers that still use the
   * `userImages` prop. Rendered as a "Provided" section above the
   * cloud-files results so existing callers don't lose data.
   */
  providedUrls?: string[];
}

export function CloudImagesTab({ providedUrls }: CloudImagesTabProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const userId = useAppSelector(selectActiveUserId);
  const treeStatus = useAppSelector(selectTreeStatus);
  const allFiles = useAppSelector(selectAllFilesArray);
  const { isSelected, toggleImage, selectionMode, addImage, clearImages } =
    useSelectedImages();
  const browse = useBrowseAction();

  const [query, setQuery] = useState("");
  const [showRecentsOnly, setShowRecentsOnly] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [metadataFile, setMetadataFile] = useState<CloudFileRecord | null>(
    null,
  );
  const [viewMode, setViewMode] = useState<ViewMode>(loadInitialView);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<
    "download" | "move" | "visibility" | "delete" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);

  // Persist the view mode whenever it changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode]);

  // Hydrate the tree the first time the tab opens. The realtime provider
  // also fires this when mounted at the layout level, but inside a modal
  // we can't rely on that — drive it ourselves.
  useEffect(() => {
    if (!userId) return;
    if (treeStatus === "idle" || treeStatus === "error") {
      void dispatch(loadUserFileTree({ userId }));
    }
  }, [userId, treeStatus, dispatch]);

  const imageFiles = useMemo(() => {
    const cutoff = showRecentsOnly ? Date.now() - RECENTS_WINDOW_MS : 0;
    const q = query.trim().toLowerCase();
    return allFiles
      .filter((file) => {
        if (file.deletedAt) return false;
        const mime = resolveMime(file.mimeType, file.fileName);
        if (!isImageMime(mime)) return false;
        if (showRecentsOnly) {
          const ts = file.updatedAt
            ? new Date(file.updatedAt).getTime()
            : file.createdAt
              ? new Date(file.createdAt).getTime()
              : 0;
          if (ts < cutoff) return false;
        }
        if (q && !file.fileName.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTs = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTs = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTs - aTs;
      });
  }, [allFiles, query, showRecentsOnly]);

  useEffect(() => {
    const visibleIds = new Set(imageFiles.map((file) => file.id));
    setBulkSelectedIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [imageFiles]);

  const selectedBulkFiles = useMemo(
    () => imageFiles.filter((file) => bulkSelectedIds.includes(file.id)),
    [imageFiles, bulkSelectedIds],
  );

  const handleToggleBulkSelected = (fileId: string) => {
    setBulkSelectedIds((current) =>
      current.includes(fileId)
        ? current.filter((id) => id !== fileId)
        : [...current, fileId],
    );
  };

  const handleClearBulkSelection = () => {
    setBulkSelectedIds([]);
  };

  const handleBulkDownload = async () => {
    if (selectedBulkFiles.length === 0 || bulkBusy) return;
    setBulkBusy("download");
    try {
      for (const file of selectedBulkFiles) {
        const { url } = await dispatch(
          getSignedUrl({ fileId: file.id, expiresIn: 3600 }),
        ).unwrap();
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.rel = "noopener noreferrer";
        anchor.download = file.fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not download selection";
      toast.error(message);
    } finally {
      setBulkBusy(null);
    }
  };

  const handleBulkMove = async () => {
    if (selectedBulkFiles.length === 0 || bulkBusy) return;
    const target = await openFolderPicker({
      title: `Move ${selectedBulkFiles.length} ${selectedBulkFiles.length === 1 ? "image" : "images"} to folder`,
      description: "Choose a destination folder.",
    });
    if (target === undefined) return;
    setBulkBusy("move");
    try {
      for (const file of selectedBulkFiles) {
        await dispatch(
          moveFile({ fileId: file.id, newParentFolderId: target }),
        ).unwrap();
      }
      setBulkSelectedIds([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not move selection";
      toast.error(message);
    } finally {
      setBulkBusy(null);
    }
  };

  const handleBulkVisibility = async (visibility: Visibility) => {
    if (selectedBulkFiles.length === 0 || bulkBusy) return;
    setBulkBusy("visibility");
    try {
      for (const file of selectedBulkFiles) {
        await dispatch(
          updateFileMetadata({ fileId: file.id, patch: { visibility } }),
        ).unwrap();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update visibility";
      toast.error(message);
    } finally {
      setBulkBusy(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedBulkFiles.length === 0 || bulkBusy) return;
    setConfirmDelete(false);
    setBulkBusy("delete");
    try {
      for (const file of selectedBulkFiles) {
        await dispatch(deleteFile({ fileId: file.id })).unwrap();
      }
      setBulkSelectedIds([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not delete selection";
      toast.error(message);
    } finally {
      setBulkBusy(null);
    }
  };

  const handleTileClick = async (file: CloudFileRecord) => {
    // ─── Browse mode: resolve ONLY the clicked file and open the viewer.
    //
    // Earlier this helper resolved every visible file in parallel via
    // `Promise.all(imageFiles.map(...))`, then pushed each
    // `ResolvedCloudUrl` object straight into the viewer's `images: string[]`
    // contract — so the viewer rendered `<img src="[object Object]">` and
    // also fired N signed-URL requests on every single click. Both are
    // gone: one click, one resolve, one image.
    if (selectionMode === "none") {
      try {
        setResolvingId(file.id);
        const resolved = await resolveCloudFileUrl(store, file.id);
        browse({
          images: [resolved.url],
          alts: [file.fileName],
          initialIndex: 0,
          title: file.fileName,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not load that image";
        toast.error(message);
      } finally {
        setResolvingId(null);
      }
      return;
    }

    // ─── Selection modes (single / multiple) ────────────────────────────
    const sourceId = `cloud:${file.id}`;
    if (isSelected(sourceId)) {
      toggleImage({
        type: "cloud-file",
        url: file.publicUrl ?? "",
        id: sourceId,
      } as ImageSource);
      return;
    }
    try {
      setResolvingId(file.id);
      if (selectionMode === "single") {
        clearImages();
      }
      const resolved = await resolveCloudFileUrl(store, file.id);
      addImage(buildCloudImageSource(file, resolved));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load that image";
      toast.error(message);
    } finally {
      setResolvingId(null);
    }
  };

  const isLoading = treeStatus === "loading" || treeStatus === "idle";
  const imageCountLabel = `${imageFiles.length} image${imageFiles.length !== 1 ? "s" : ""}`;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="h-full flex flex-col">
        <div className="border-b border-border px-3 md:px-4 py-2.5 md:pr-14 flex items-center gap-2 md:gap-3 flex-wrap">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search your images..."
            className="min-w-0 flex-1"
            inputClassName="h-9 bg-background text-base"
            showClearButton={true}
            autoFocus={false}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setMobileOptionsOpen(true)}
            className="h-9 w-9 shrink-0 md:hidden"
            aria-label="Image view options"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
            <Button
              type="button"
              variant={showRecentsOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowRecentsOnly((v) => !v)}
              className="h-9"
            >
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Recents
            </Button>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <div
              className="flex h-9 items-center rounded-md border border-border/80 bg-card/70 px-2.5 text-xs font-medium text-muted-foreground shadow-sm"
              aria-label={`${imageCountLabel} loaded`}
              aria-live="polite"
            >
              {imageCountLabel}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 md:p-4 space-y-4 md:space-y-6 overscroll-contain">
          {providedUrls && providedUrls.length > 0 ? (
            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Provided
              </h4>
              <ImageGrid
                images={providedUrls.map((url, index) => ({
                  type: "public" as const,
                  url,
                  id: `provided-${index}-${url}`,
                  metadata: {
                    description: `External image ${index + 1}`,
                    title: `Image ${index + 1}`,
                  },
                }))}
                columns={4}
                gap="md"
                aspectRatio="1:1"
                selectable={true}
              />
            </section>
          ) : null}

          <section>
            {providedUrls && providedUrls.length > 0 ? (
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Your Cloud
              </h4>
            ) : null}

            {isLoading && allFiles.length === 0 ? (
              <CloudLoadingState />
            ) : imageFiles.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/80 bg-card/30">
                <EmptyStateCard
                  title={
                    query.length > 0
                      ? "No matching images"
                      : showRecentsOnly
                        ? "No recent images"
                        : "No images in your cloud yet"
                  }
                  description={
                    query.length > 0
                      ? "Try a different search term, or clear filters."
                      : "Upload an image from the Upload tab and it will appear here automatically."
                  }
                  icon={query.length > 0 ? ImageOff : Cloud}
                />
              </div>
            ) : viewMode === "list" ? (
              <CloudImageList
                files={imageFiles}
                resolvingId={resolvingId}
                selectionMode={selectionMode}
                isSelected={(id) => isSelected(`cloud:${id}`)}
                bulkSelectedIds={bulkSelectedIds}
                onToggleBulkSelected={handleToggleBulkSelected}
                onTileClick={handleTileClick}
                onShowMetadata={setMetadataFile}
              />
            ) : (
              <CloudImageGrid
                files={imageFiles}
                density={viewMode}
                resolvingId={resolvingId}
                selectionMode={selectionMode}
                isSelected={(id) => isSelected(`cloud:${id}`)}
                bulkSelectedIds={bulkSelectedIds}
                onToggleBulkSelected={handleToggleBulkSelected}
                onTileClick={handleTileClick}
                onShowMetadata={setMetadataFile}
              />
            )}
          </section>
        </div>

        <CloudFileMetadataSheet
          file={metadataFile}
          onOpenChange={(open) => {
            if (!open) setMetadataFile(null);
          }}
        />
        <FloatingSelectionToolbar
          selectedCount={bulkSelectedIds.length}
          actions={[
            {
              id: "download",
              label: "Download",
              icon: <Download className="h-3.5 w-3.5" />,
              onClick: () => void handleBulkDownload(),
              running: bulkBusy === "download",
              disabled: bulkBusy !== null,
            },
            {
              id: "move",
              label: "Move...",
              icon: <FolderInput className="h-3.5 w-3.5" />,
              onClick: () => void handleBulkMove(),
              running: bulkBusy === "move",
              disabled: bulkBusy !== null,
            },
          ]}
          onClear={handleClearBulkSelection}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={bulkBusy !== null}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                  "text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {bulkBusy === "visibility" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                Visibility
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44">
              <DropdownMenuItem
                onClick={() => void handleBulkVisibility("private")}
              >
                <Lock className="mr-2 h-4 w-4" /> Private
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleBulkVisibility("shared")}
              >
                <Users className="mr-2 h-4 w-4" /> Shared
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleBulkVisibility("public")}
              >
                <Globe className="mr-2 h-4 w-4" /> Public
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={bulkBusy !== null}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              "text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {bulkBusy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete
          </button>
        </FloatingSelectionToolbar>
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {bulkSelectedIds.length}{" "}
                {bulkSelectedIds.length === 1 ? "image" : "images"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                These images will move to Trash. You can restore them later from
                the Files area.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleBulkDelete()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <BottomSheet
          open={mobileOptionsOpen}
          onOpenChange={setMobileOptionsOpen}
          title="Image options"
        >
          <BottomSheetHeader
            title="Image options"
            trailing={
              <button
                type="button"
                onClick={() => setMobileOptionsOpen(false)}
                className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
              >
                Done
              </button>
            }
          />
          <BottomSheetBody className="px-4 pb-5">
            <div className="space-y-5">
              <div>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  View
                </h3>
                <div className="overflow-hidden rounded-xl border border-border bg-card/60">
                  {VIEW_OPTIONS.map((opt, index) => {
                    const Icon = opt.icon;
                    const active = viewMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setViewMode(opt.id)}
                        className={cn(
                          "flex min-h-[48px] w-full items-center gap-3 px-3 text-left",
                          index > 0 && "border-t border-border",
                          active ? "text-primary" : "text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="flex-1 text-[15px] font-medium">
                          {opt.label}
                        </span>
                        {active ? (
                          <span className="text-xs text-primary">Current</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowRecentsOnly((v) => !v)}
                className={cn(
                  "flex min-h-[48px] w-full items-center gap-3 rounded-xl border border-border bg-card/60 px-3 text-left",
                  showRecentsOnly && "border-primary/40 text-primary",
                )}
              >
                <Clock className="h-4 w-4" />
                <span className="flex-1 text-[15px] font-medium">
                  Recent images only
                </span>
                <span className="text-xs text-muted-foreground">
                  {showRecentsOnly ? "On" : "Off"}
                </span>
              </button>

              <div className="rounded-xl border border-border bg-card/60 px-3 py-3 text-sm text-muted-foreground">
                {imageCountLabel} loaded
              </div>
            </div>
          </BottomSheetBody>
        </BottomSheet>
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// View-mode toggle
// ---------------------------------------------------------------------------

function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div
      className="inline-flex h-9 rounded-md border border-border bg-card overflow-hidden"
      role="group"
      aria-label="View mode"
    >
      {VIEW_OPTIONS.map((opt) => {
        const active = value === opt.id;
        const Icon = opt.icon;
        return (
          <Tooltip key={opt.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onChange(opt.id)}
                aria-pressed={active}
                aria-label={opt.label}
                className={cn(
                  "h-9 w-8 flex items-center justify-center transition-colors border-r border-border last:border-r-0",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{opt.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function CloudLoadingState() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />
      <span className="text-sm">Loading your images...</span>
    </div>
  );
}
