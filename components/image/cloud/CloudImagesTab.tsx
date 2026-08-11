/**
 * components/image/cloud/CloudImagesTab.tsx
 *
 * Live image gallery sourced from the user's cloud-files Redux slice.
 * Filters to image-MIME records, supports search, a Recents (last 30d)
 * filter, and a view-mode toggle (Cozy / Compact / List). The toggle is a
 * projection of the two canonical style axes — Cozy/Compact are the `cards`
 * view at comfortable/compact `density`, List is the `rows` view — persisted
 * and synced across devices through `useListViewPrefs("image-manager-cloud")`.
 *
 * Selection writes `ImageSource` with `type: "cloud-file"` and stashes
 * `metadata.fileId` so downstream features can deep-link back into the
 * cloud-files surfaces (preview, share, restore version).
 *
 * This component also owns the `matrx-user/images` surface: it mounts the
 * provider, emits the scope, and services the three declared write targets
 * (search_query / recents_only / image_selection) through its own setters —
 * see the handler block below.
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
import { idMatchesQuery } from "@/utils/search-scoring";
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
import {
  CloudImageGrid,
  type CloudImageViewMode,
} from "@/components/image/cloud/CloudImageGrid";
import { CloudImageList } from "@/components/image/cloud/CloudImageList";
import { useBrowseAction } from "@/features/image-manager/browse/BrowseImageProvider";
import { CloudFileMetadataSheet } from "@/features/image-manager/components/CloudFileMetadataSheet";
import { openFolderPicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildImagesScope } from "@/features/image-manager/lib/images-surface-scope";
import { IMAGES_SURFACE_NAME } from "@/features/surfaces/manifests/images.manifest";
import {
  useListViewPrefs,
  type LegacyListViewImport,
} from "@/lib/list-views/useListViewPrefs";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { toast } from "@/lib/toast";

const RECENTS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Style prefs for this gallery (synced across devices via `userPreferences`).
 * The cozy grid is this surface's own default — the platform default is table,
 * which this surface does not offer.
 */
const CLOUD_IMAGES_VIEW_DEFAULTS: Partial<ListViewPrefs> = {
  view: "cards",
  density: "comfortable",
};

/**
 * One-time adoption of the device-local key. This surface's old vocabulary was
 * a single three-value string, so the mapping is a genuine PROJECTION onto the
 * two persisted axes — not a pass-through. Getting it wrong would have written
 * `view: "cozy"`, which no toggle here matches.
 */
const CLOUD_IMAGES_LEGACY_VIEW: LegacyListViewImport = {
  key: "image-manager:cloud-images-view",
  map: (raw) => {
    if (raw === "list") return { view: "rows" };
    if (raw === "cozy") return { view: "cards", density: "comfortable" };
    if (raw === "compact") return { view: "cards", density: "compact" };
    return null;
  },
};

/**
 * The three toggle buttons are a projection of the two persisted axes, not a
 * third persisted vocabulary: Cozy/Compact are `cards` at comfortable/compact
 * density, List is `rows`. The List option deliberately carries no density so
 * switching to it preserves whichever grid density the user last chose.
 */
const VIEW_OPTIONS: {
  id: string;
  label: string;
  icon: LucideIcon;
  view: ListViewPrefs["view"];
  density?: ListViewPrefs["density"];
}[] = [
  {
    id: "cozy",
    label: "Cozy grid",
    icon: LayoutGrid,
    view: "cards",
    density: "comfortable",
  },
  {
    id: "compact",
    label: "Compact grid",
    icon: Grid3x3,
    view: "cards",
    density: "compact",
  },
  { id: "list", label: "List", icon: ListIcon, view: "rows" },
];

const isActiveViewOption = (
  prefs: ListViewPrefs,
  option: (typeof VIEW_OPTIONS)[number],
) =>
  option.view === "rows"
    ? prefs.view === "rows"
    : prefs.view !== "rows" && prefs.density === option.density;

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
  const { prefs, setPrefs } = useListViewPrefs(
    "image-manager-cloud",
    CLOUD_IMAGES_VIEW_DEFAULTS,
    CLOUD_IMAGES_LEGACY_VIEW,
  );
  const isListView = prefs.view === "rows";
  const gridDensity: CloudImageViewMode =
    prefs.density === "compact" ? "compact" : "cozy";
  /** The toggle id the two axes currently project to — reported to agents. */
  const viewMode = isListView ? "list" : gridDensity;
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState<
    "download" | "move" | "visibility" | "delete" | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false);

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
        if (
          q &&
          !file.fileName.toLowerCase().includes(q) &&
          !idMatchesQuery(file, q)
        )
          return false;
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

  // Total non-deleted images in the whole library, ignoring search/filters —
  // the denominator behind `visible_image_count` on the surface.
  const totalImageCount = useMemo(
    () =>
      allFiles.filter(
        (file) =>
          !file.deletedAt && isImageMime(resolveMime(file.mimeType, file.fileName)),
      ).length,
    [allFiles],
  );

  // ── Surface write handlers ──────────────────────────────────────────────
  //
  // The three declared targets on `matrx-user/images`, each landing through
  // the SAME setter this component's own controls call — the search box calls
  // `setQuery`, the Recents chip calls `setShowRecentsOnly`, a tile checkbox
  // calls `setBulkSelectedIds`. No parallel write path exists, so an agent
  // write and a user click are indistinguishable downstream.
  //
  // Every handler VALIDATES AND THROWS before it mutates anything: the
  // writeback seam turns a throw into a safe error envelope the agent reads
  // and can correct from, which is far more useful than a silent coercion.
  //
  // The provider re-reads `getWriteHandlers` through a ref on every render, so
  // these closures always see the current query / filter / visible rows.

  /**
   * Image ids from an agent, validated against what is ON SCREEN.
   *
   * Two encodings are accepted deliberately. The inline-tool layer parses a
   * JSON-looking argument before a handler ever sees it, so a well-formed call
   * arrives as a real array. A model that double-encodes its argument sends
   * the JSON *string* instead — tolerating that explicitly is cheaper than
   * letting it fail, watch the error, and "fix" it by escaping even harder.
   * Anything that is neither still throws.
   *
   * Validation happens against `imageFiles` — the rows actually rendered —
   * rather than the emitted `visible_image_ids`, which is capped at 200. The
   * rendered set is a superset of what the agent saw, so the cap can never
   * cause a false rejection of an id the agent legitimately read.
   */
  const parseImageSelection = (value: unknown): string[] => {
    let raw = value;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        throw new Error(
          "image_selection expects an array of image ids, e.g. [\"<uuid>\", \"<uuid>\"] — received a string that is not valid JSON.",
        );
      }
    }
    if (!Array.isArray(raw)) {
      throw new Error(
        `image_selection expects an array of image ids (pass [] to clear the selection) — received ${typeof raw}.`,
      );
    }
    const ids = raw.map((entry, index) => {
      if (typeof entry !== "string" || !entry.trim()) {
        throw new Error(
          `image_selection entry ${index} is not an image id string.`,
        );
      }
      return entry.trim();
    });

    // Validate the WHOLE list before touching state — a partly-applied
    // selection would be worse than a rejected one.
    const visibleIds = new Set(imageFiles.map((file) => file.id));
    const unknown = ids.filter((id) => !visibleIds.has(id));
    if (unknown.length > 0) {
      // Hand back what IS selectable, not just what was wrong. An agent that
      // narrowed the library earlier in the same run is holding the scope
      // snapshot from launch time, so its `visible_image_ids` is stale the
      // instant search_query or recents_only lands — the common cause of
      // getting here. Listing the live rows lets it fix the call in one step
      // instead of guessing which of its cached ids survived the filter.
      const live = imageFiles
        .slice(0, 30)
        .map((file) => `${file.id} (${file.fileName})`)
        .join(", ");
      const more = imageFiles.length > 30 ? `, …and ${imageFiles.length - 30} more` : "";
      throw new Error(
        `image_selection rejected: ${unknown.length} of the ${ids.length} id(s) you sent are not among the ${imageFiles.length} image(s) currently visible — ${unknown.join(", ")}. ` +
          `The selection was left unchanged. Note that applying search_query or recents_only changes this set, so ids you read before those writes may no longer be visible. ` +
          `Currently selectable: ${live || "(nothing — the search or Recents filter is hiding every image)"}${more}.`,
      );
    }
    // De-duplicate, keeping first-seen order: a selection is a set, so the
    // same id twice is the same selection, not a different one.
    return Array.from(new Set(ids));
  };

  const buildImagesWriteHandlers = () => ({
    search_query: (value: unknown) => {
      if (typeof value !== "string") {
        throw new Error(
          `search_query expects a string (pass "" to clear the search) — received ${typeof value}.`,
        );
      }
      setQuery(value);
    },
    recents_only: (value: unknown) => {
      // Booleans arrive parsed; tolerate the exact "true"/"false" strings a
      // double-encoding model produces, and reject everything else rather
      // than guessing at truthiness.
      const next =
        typeof value === "boolean"
          ? value
          : value === "true"
            ? true
            : value === "false"
              ? false
              : null;
      if (next === null) {
        throw new Error(
          `recents_only expects a boolean (true to show only the last 30 days, false to show the whole library) — received ${typeof value}.`,
        );
      }
      setShowRecentsOnly(next);
    },
    image_selection: (value: unknown) => {
      setBulkSelectedIds(parseImageSelection(value));
    },
  });

  // Surface emitter — assembled at trigger time from live render values.
  const getImagesScope = () =>
    buildImagesScope({
      visibleImages: imageFiles,
      totalImageCount,
      selectedImages: selectedBulkFiles,
      searchQuery: query,
      recentsOnly: showRecentsOnly,
      viewMode,
      selectionMode,
      treeStatus,
      bulkOperation: bulkBusy,
    });

  return (
    <SurfaceRuntimeProvider
      surfaceName={IMAGES_SURFACE_NAME}
      getScope={getImagesScope}
      getWriteHandlers={buildImagesWriteHandlers}
    >
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
            <ViewModeToggle prefs={prefs} onChange={setPrefs} />
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
            ) : isListView ? (
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
                density={gridDensity}
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
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                  "max-md:w-9 max-md:justify-center max-md:px-0",
                  "text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {bulkBusy === "visibility" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                <span className="max-md:hidden">Visibility</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-44">
              <DropdownMenuItem
                onClick={() => void handleBulkVisibility("personal")}
              >
                <Lock className="mr-2 h-4 w-4" /> Private
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleBulkVisibility("link")}
              >
                <Users className="mr-2 h-4 w-4" /> Anyone with the link
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
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              "max-md:w-9 max-md:justify-center max-md:px-0",
              "text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {bulkBusy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            <span className="max-md:hidden">Delete</span>
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
                    const active = isActiveViewOption(prefs, opt);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setPrefs(
                            opt.density
                              ? { view: opt.view, density: opt.density }
                              : { view: opt.view },
                          )
                        }
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
    </SurfaceRuntimeProvider>
  );
}

// ---------------------------------------------------------------------------
// View-mode toggle
// ---------------------------------------------------------------------------

function ViewModeToggle({
  prefs,
  onChange,
}: {
  prefs: ListViewPrefs;
  onChange: (patch: Partial<ListViewPrefs>) => void;
}) {
  return (
    <div
      className="inline-flex h-9 rounded-md border border-border bg-card overflow-hidden"
      role="group"
      aria-label="View mode"
    >
      {VIEW_OPTIONS.map((opt) => {
        const active = isActiveViewOption(prefs, opt);
        const Icon = opt.icon;
        return (
          <Tooltip key={opt.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    opt.density
                      ? { view: opt.view, density: opt.density }
                      : { view: opt.view },
                  )
                }
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
