"use client";

/**
 * components/image/ImageManager.tsx
 *
 * Full-screen image picker modal. As of the cloud-files rebuild, every
 * tab is wired into the user's cloud storage (`features/files`) — uploads
 * land in the user's account, "Your Cloud" / "All Files" surface the live
 * cloud tree, and the embedded Image Studio writes its variants to
 * permanent CDN URLs.
 *
 * Tab definitions are sourced from the shared registry
 * (`features/image-manager/registry/sections.ts`) so the modal and the
 * `/image-manager` route stay in sync. To add a new tab, edit the
 * registry — not this file.
 *
 * Public surface stays backwards compatible. The legacy
 * `userImages` / `saveTo` / `bucket` / `path` props still work and are
 * mapped onto the new cloud props when building the section context.
 */

import React, { useEffect, useMemo, useState } from "react";
import FullScreenOverlay from "@/components/official/FullScreenOverlay";
import type { TabDefinition } from "@/components/official/FullScreenOverlay";
import { Button } from "@/components/ui/button";
import { ImagePreviewRow } from "@/components/image/shared/ImagePreviewRow";
import { useSelectedImages } from "@/components/image/context/SelectedImagesProvider";
import type { AllowedFileKind } from "@/components/image/cloud/CloudFilesTab";
import type { EmbeddedImageStudioProps } from "@/features/image-studio/components/EmbeddedImageStudio";
import type { Visibility } from "@/features/files";
import { buildImageManagerSections } from "@/features/image-manager/registry/sections";
// Imported from the leaf `ids` module (not `sections.ts`) to avoid a circular
// dependency: the section registry imports tab components, some of which
// transitively import `<ImageManager>` via `<SingleImageSelect>`. Pulling
// `SECTION_IDS` from `sections.ts` here causes a "Cannot access X before
// initialization" runtime error under Turbopack.
import { SECTION_IDS } from "@/features/image-manager/registry/ids";
import { BrowseImageProvider } from "@/features/image-manager/browse/BrowseImageProvider";

export interface ImageManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
  initialSelectionMode?: "single" | "multiple" | "none";
  initialTab?: string;
  /** Initial query for the Public Images Unsplash search. */
  initialSearchTerm?: string;
  /** Legacy: user-supplied URLs rendered inside "Your Cloud" as a "Provided" row. */
  userImages?: string[];
  /** Lock the selection mode toggle in the footer. */
  enforceSelectionMode?: boolean;
  /** Filter the visible tab set; empty/undefined shows all. */
  visibleTabs?: string[];

  // ─── Legacy upload props (mapped onto defaultUploadFolderPath) ───
  saveTo?: "public" | "private";
  bucket?: string;
  path?: string;

  // ─── New cloud-files props (all optional) ───
  /** Which file kinds appear / are selectable in the "All Files" tab. Default `["image"]`. */
  allowFileTypes?: AllowedFileKind[];
  /** Logical folder path for new uploads. Default: `"Images/Uploads"`. */
  defaultUploadFolderPath?: string;
  /** Pre-resolved upload-destination folder id. */
  defaultUploadFolderId?: string | null;
  /** Visibility for new uploads. Default `"private"` (Image Studio uses public). */
  defaultVisibility?: Visibility;
  /** Show the Image Studio tab. Default `true`. */
  showImageStudioTab?: boolean;
  /** Show the AI Generate placeholder tab. Default `true`. */
  showAIGenerateTab?: boolean;
  /** Override props for the embedded `<EmbeddedImageStudio>`. */
  imageStudioProps?: Partial<EmbeddedImageStudioProps>;
}

/**
 * Legacy tab IDs (pre cloud-files rebuild) mapped to their replacements,
 * so callers passing the old strings via `initialTab` / `visibleTabs`
 * continue to land on a sensible tab.
 */
const LEGACY_TAB_ALIASES: Record<string, string> = {
  "user-images": SECTION_IDS.myImages,
  "upload-images": SECTION_IDS.upload,
  "paste-images": SECTION_IDS.upload,
  "quick-upload": SECTION_IDS.upload,
  "cloud-images": SECTION_IDS.myFiles,
  "image-generation": SECTION_IDS.aiGenerate,
};

function aliasTabId(id: string): string {
  return LEGACY_TAB_ALIASES[id] ?? id;
}

/**
 * Map the legacy `saveTo` / `bucket` / `path` props onto a cloud-files
 * folder path. This keeps every existing caller working without code
 * changes — the path scheme matches the legacy-bucket → cld_files
 * folder mapping (`mapLegacyBucket()` in the upload layer).
 */
function legacyPropsToFolderPath(
  saveTo: "public" | "private" | undefined,
  bucket: string | undefined,
  path: string | undefined,
  explicitPath: string | undefined,
): string | undefined {
  if (explicitPath) return explicitPath;
  if (bucket) return path ? `${bucket}/${path}` : bucket;
  if (saveTo === "public") return "Images/Uploads/Public";
  if (saveTo === "private") return "Images/Uploads/Private";
  return undefined;
}

export function ImageManager(props: ImageManagerProps) {
  const {
    isOpen,
    onClose,
    onSave,
    initialSelectionMode = "multiple",
    initialTab = SECTION_IDS.publicSearch,
    initialSearchTerm,
    userImages,
    enforceSelectionMode = false,
    visibleTabs,
    saveTo,
    bucket,
    path,
    allowFileTypes = ["image"],
    defaultUploadFolderPath,
    defaultUploadFolderId,
    defaultVisibility = "private",
    showImageStudioTab = true,
    showAIGenerateTab = true,
    imageStudioProps,
  } = props;

  const { selectedImages, selectionMode, setSelectionMode, clearImages } =
    useSelectedImages();

  const [activeTab, setActiveTab] = useState(() => aliasTabId(initialTab));

  const aliasedVisibleTabs = useMemo(() => {
    if (!visibleTabs || visibleTabs.length === 0) return undefined;
    return Array.from(new Set(visibleTabs.map(aliasTabId)));
  }, [visibleTabs]);

  // Set selection mode once on mount — same behaviour as the legacy
  // component to avoid surprising existing callers.
  useEffect(() => {
    setSelectionMode(initialSelectionMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Defer-clear on close so the parent has time to read the selection.
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        clearImages();
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen, clearImages]);

  const resolvedUploadPath = useMemo(
    () =>
      legacyPropsToFolderPath(saveTo, bucket, path, defaultUploadFolderPath),
    [saveTo, bucket, path, defaultUploadFolderPath],
  );

  const effectiveDefaultVisibility = useMemo<Visibility>(() => {
    if (defaultVisibility) return defaultVisibility;
    if (saveTo === "public") return "public";
    return "private";
  }, [defaultVisibility, saveTo]);

  const acceptMimes = useMemo(() => {
    if (allowFileTypes.includes("any")) return undefined;
    const set = new Set<string>();
    if (allowFileTypes.includes("image")) set.add("image/*");
    if (allowFileTypes.includes("video")) set.add("video/*");
    if (allowFileTypes.includes("audio")) set.add("audio/*");
    if (allowFileTypes.includes("pdf")) set.add("application/pdf");
    if (allowFileTypes.includes("document")) {
      set.add("text/*");
      set.add("application/pdf");
    }
    return Array.from(set);
  }, [allowFileTypes]);

  const sections = useMemo(
    () =>
      buildImageManagerSections({
        variant: "modal",
        initialSearchTerm,
        userImages,
        allowFileTypes,
        defaultUploadFolderPath: resolvedUploadPath,
        defaultUploadFolderId,
        defaultVisibility: effectiveDefaultVisibility,
        acceptMimes,
        imageStudioProps,
        showImageStudio: showImageStudioTab,
        showAIGenerate: showAIGenerateTab,
        // Modal historically does not surface the secondary tools group.
        showTools: false,
        selectionMode: initialSelectionMode,
      }),
    [
      initialSearchTerm,
      userImages,
      allowFileTypes,
      resolvedUploadPath,
      defaultUploadFolderId,
      effectiveDefaultVisibility,
      acceptMimes,
      imageStudioProps,
      showImageStudioTab,
      showAIGenerateTab,
      initialSelectionMode,
    ],
  );

  const allTabs: TabDefinition[] = useMemo(
    () =>
      sections.map((section) => ({
        id: section.id,
        label: section.label,
        content: <SectionRenderer key={section.id} render={section.render} />,
      })),
    [sections],
  );

  const tabs = useMemo(
    () =>
      aliasedVisibleTabs && aliasedVisibleTabs.length > 0
        ? allTabs.filter((tab) => aliasedVisibleTabs.includes(tab.id))
        : allTabs,
    [allTabs, aliasedVisibleTabs],
  );

  // If the active tab is filtered out, fall back to the first visible.
  useEffect(() => {
    if (!aliasedVisibleTabs || aliasedVisibleTabs.length === 0) return;
    if (!aliasedVisibleTabs.includes(activeTab)) {
      setActiveTab(aliasedVisibleTabs[0]);
    }
  }, [aliasedVisibleTabs, activeTab]);

  const handleSave = () => {
    onSave?.();
    onClose();
  };

  const handleCancel = () => {
    clearImages();
    onClose();
  };

  return (
    <BrowseImageProvider>
      <FullScreenOverlay
        isOpen={isOpen}
        onClose={onClose}
        title="Image Manager"
        description="Browse, upload, and create images — everything saves to your cloud."
        tabs={tabs}
        initialTab={activeTab}
        onTabChange={setActiveTab}
        showSaveButton={true}
        onSave={handleSave}
        saveButtonLabel="Use Selected"
        showCancelButton={true}
        onCancel={handleCancel}
        cancelButtonLabel="Cancel"
        footerContent={
          <div className="flex items-center mr-auto gap-4">
            {!enforceSelectionMode ? (
              <div className="flex items-center gap-2">
                <Button
                  variant={selectionMode === "none" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectionMode("none")}
                  title="Browse mode — click an image to open the viewer."
                >
                  Browse
                </Button>
                <Button
                  variant={selectionMode === "single" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectionMode("single")}
                >
                  Single
                </Button>
                <Button
                  variant={selectionMode === "multiple" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectionMode("multiple")}
                >
                  Multiple
                </Button>
              </div>
            ) : null}

            <div className="text-sm text-muted-foreground">
              {selectedImages.length} image
              {selectedImages.length !== 1 ? "s" : ""} selected
            </div>

            <div className="w-64">
              <ImagePreviewRow size="s" />
            </div>
          </div>
        }
      />
    </BrowseImageProvider>
  );
}

/**
 * Tiny wrapper so each section's `render` runs as its own component —
 * lets the section render hooks safely.
 */
function SectionRenderer({ render }: { render: () => React.ReactNode }) {
  return <>{render()}</>;
}

/**
 * @deprecated The internal `ImageManagerContent` export was used by some
 * callers in the early cloud-files rebuild. It is now an alias for
 * `<ImageManager>` — there's no separate content/host split anymore.
 * This export will be removed in Phase 4.3 of the Image Manager Hub
 * plan; new callers should import `ImageManager` directly.
 */
export const ImageManagerContent = ImageManager;
