"use client";

/**
 * GalleryWindow — floating window shell for the image gallery.
 *
 * Multi-window pattern: clicking an image opens ImageViewerWindow
 * for full zoom/pan/download. Favorites sidebar tracks liked images.
 */

import React from "react";
import {
  Columns2,
  Copy,
  ExternalLink,
  Grid3X3,
  Images,
  LayoutGrid,
  RotateCcw,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { GalleryFloatingWorkspace } from "@/features/gallery/components/GalleryFloatingWorkspace";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import {
  GALLERY_SURFACE_NAME,
  createGalleryScope,
} from "@/features/surfaces/manifests/gallery.manifest";

interface GalleryWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GalleryWindow({ isOpen, onClose }: GalleryWindowProps) {
  if (!isOpen) return null;
  return <GalleryWindowInner onClose={onClose} />;
}

function GalleryWindowInner({ onClose }: { onClose: () => void }) {
  // The workspace is the ONE owner of gallery state (view mode included) —
  // the shell's footer buttons and the surface emitter both read from it.
  const workspace = GalleryFloatingWorkspace();
  const { viewMode, setViewMode: onViewModeChange } = workspace;

  // Built at trigger time (never stale state) and shared by the surface
  // provider and the window's context menu — ONE scope for this window.
  const buildScope = () =>
    createGalleryScope({
      view_mode: workspace.viewMode,
      search_input: workspace.searchInput,
      active_query: workspace.activeQuery || undefined,
      orientation_filter: workspace.orientationFilter,
      photo_count: workspace.photoCount,
      favorite_count: workspace.favoriteCount,
      image_description: workspace.imageDescription,
      visible_image_descriptions: workspace.visibleImageDescriptions,
      quick_topics: workspace.quickTopics,
      favorite_image_descriptions: workspace.favoriteImageDescriptions,
      focused_image_id: workspace.focusedImage?.id,
      focused_image_url: workspace.focusedImage?.url || undefined,
      focused_image_credit: workspace.focusedImage?.credit || undefined,
      focused_image_source_url:
        workspace.focusedImage?.sourceUrl || undefined,
    });

  const footerRight = (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onViewModeChange("masonry")}
        title="Masonry view"
        className={cn(
          "p-1 max-sm:min-h-11 max-sm:min-w-11 max-sm:flex max-sm:items-center max-sm:justify-center rounded-md transition-colors",
          viewMode === "masonry"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
      >
        <Columns2 className="w-3 h-3 max-sm:w-5 max-sm:h-5" />
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange("grid")}
        title="Grid view"
        className={cn(
          "p-1 max-sm:min-h-11 max-sm:min-w-11 max-sm:flex max-sm:items-center max-sm:justify-center rounded-md transition-colors",
          viewMode === "grid"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
      >
        <LayoutGrid className="w-3 h-3 max-sm:w-5 max-sm:h-5" />
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange("compact")}
        title="Compact view"
        className={cn(
          "p-1 max-sm:min-h-11 max-sm:min-w-11 max-sm:flex max-sm:items-center max-sm:justify-center rounded-md transition-colors",
          viewMode === "compact"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
      >
        <Grid3X3 className="w-3 h-3 max-sm:w-5 max-sm:h-5" />
      </button>
    </div>
  );

  return (
    <WindowPanel
      title="Gallery"
      id="gallery-window-default"
      minWidth={380}
      minHeight={320}
      width={680}
      height={540}
      onClose={onClose}
      urlSyncKey="gallery"
      urlSyncId="default"
      sidebar={workspace.sidebar}
      sidebarDefaultSize={200}
      sidebarMinSize={150}
      sidebarClassName="bg-muted/10"
      defaultSidebarOpen={false}
      footerRight={footerRight}
      overlayId="galleryWindow"
      onCollectData={() => ({ viewMode })}
    >
      {/* Nested overlay emitter — while this window is open, its scope
          out-depths the page's provider (deepest wins). */}
      <SurfaceRuntimeProvider
        surfaceName={GALLERY_SURFACE_NAME}
        getScope={buildScope}
        isEditable={false}
      >
        {/* The window's own right-click menu. Without it the page beneath
            answers the right-click with ITS surface — the user would get the
            wrong surface's agents while looking at the gallery. */}
        <NonEditableContextMenu
          sourceFeature="image-studio"
          surfaceName={GALLERY_SURFACE_NAME}
          getApplicationScope={() => buildScope() as ApplicationScope}
          extraSections={[
            {
              id: "gallery-actions",
              label: "Gallery",
              icon: Images,
              items: [
                {
                  kind: "item",
                  id: "gallery-copy-links",
                  label: "Copy links to loaded images",
                  icon: Copy,
                  onSelect: workspace.copyLoadedImageLinks,
                  disabled: workspace.photoCount === 0,
                },
                {
                  kind: "item",
                  id: "gallery-topics",
                  label: "Toggle quick topics",
                  icon: Star,
                  onSelect: workspace.toggleTopics,
                },
                {
                  kind: "item",
                  id: "gallery-reset",
                  label: "Clear search and filters",
                  icon: RotateCcw,
                  onSelect: workspace.resetSearch,
                  disabled: !workspace.activeQuery && !workspace.searchInput,
                },
                ...(workspace.focusedImage?.sourceUrl
                  ? ([
                      {
                        kind: "link",
                        id: "gallery-open-source",
                        label: "Open last viewed image on Unsplash",
                        icon: ExternalLink,
                        href: workspace.focusedImage.sourceUrl,
                        target: "_blank",
                      },
                    ] as const)
                  : []),
              ],
            },
          ]}
        >
          {workspace.body}
        </NonEditableContextMenu>
      </SurfaceRuntimeProvider>
    </WindowPanel>
  );
}
