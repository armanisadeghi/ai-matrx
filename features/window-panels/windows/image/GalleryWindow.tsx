"use client";

/**
 * GalleryWindow — floating window shell for the image gallery.
 *
 * Multi-window pattern: clicking an image opens ImageViewerWindow
 * for full zoom/pan/download. Favorites sidebar tracks liked images.
 */

import React from "react";
import { Columns2, Grid3X3, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { GalleryFloatingWorkspace } from "@/features/gallery/components/GalleryFloatingWorkspace";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
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

  const footerRight = (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onViewModeChange("masonry")}
        title="Masonry view"
        className={cn(
          "p-1 rounded-md transition-colors",
          viewMode === "masonry"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
      >
        <Columns2 className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange("grid")}
        title="Grid view"
        className={cn(
          "p-1 rounded-md transition-colors",
          viewMode === "grid"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
      >
        <LayoutGrid className="w-3 h-3" />
      </button>
      <button
        type="button"
        onClick={() => onViewModeChange("compact")}
        title="Compact view"
        className={cn(
          "p-1 rounded-md transition-colors",
          viewMode === "compact"
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
        )}
      >
        <Grid3X3 className="w-3 h-3" />
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
        getScope={() =>
          createGalleryScope({
            view_mode: workspace.viewMode,
            search_input: workspace.searchInput,
            active_query: workspace.activeQuery || undefined,
            orientation_filter: workspace.orientationFilter,
            photo_count: workspace.photoCount,
            favorite_count: workspace.favoriteCount,
          })
        }
        isEditable={false}
      >
        {workspace.body}
      </SurfaceRuntimeProvider>
    </WindowPanel>
  );
}
