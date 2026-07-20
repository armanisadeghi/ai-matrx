"use client";

/**
 * CropStudioWindow
 * ─────────────────────────────────────────────────────────────────────────
 * Standalone, registry-mounted crop workshop. Opens from the Tools-grid
 * tile in the sidebar. Differs from `<InitialCropWindow>` (which the
 * Image Studio uses inline as a queue walk-through) in three ways:
 *
 *   1. Files arrive via a built-in dropzone instead of being pushed in
 *      from a parent.
 *   2. Each file becomes a switchable tab in the sidebar — the user
 *      chooses which to work on rather than being walked through them.
 *   3. Results are uploaded directly to a user-picked S3-backed Files
 *      folder via the cloud-files pipeline; there's no `onComplete`
 *      callback because the window is opened from the sidebar with no
 *      parent to call back to.
 *
 * Bulk power: the user can crop one image and then click "Apply to all"
 * to copy the rect — proportional to each image's natural size — to
 * every other entry. With aspect locked, every result has identical
 * composition.
 */

import React, { useCallback } from "react";
import {
  Crop,
  CheckCircle2,
  CloudUpload,
  FolderOpen,
  Loader2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { InitialCropAspectBar, InitialCropViewport } from "./InitialCropPanel";
import { StudioDropZone } from "./StudioDropZone";
import {
  useCropStudioController,
  type CropStudioController,
  type CropStudioEntry,
  type CropStudioEntryStatus,
} from "./useCropStudioController";

// ── Public surface ──────────────────────────────────────────────────────────

export interface CropStudioWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional persisted folder id (from window-session data). */
  initialFolderId?: string | null;
  /** Optional default folder path string (e.g. "Images/Crops"). */
  defaultFolderPath?: string;
  /** Optional initial aspect lock. */
  initialAspect?: number;
}

export default function CropStudioWindow({
  isOpen,
  onClose,
  initialFolderId,
  defaultFolderPath,
  initialAspect,
}: CropStudioWindowProps) {
  if (!isOpen) return null;
  return (
    <CropStudioWindowInner
      onClose={onClose}
      initialFolderId={initialFolderId}
      defaultFolderPath={defaultFolderPath}
      initialAspect={initialAspect}
    />
  );
}

function CropStudioWindowInner({
  onClose,
  initialFolderId,
  defaultFolderPath,
  initialAspect,
}: Omit<CropStudioWindowProps, "isOpen">) {
  const controller = useCropStudioController({
    initialFolderId: initialFolderId ?? null,
    defaultFolderPath,
    initialAspect,
  });

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      folderId: controller.folderId,
      defaultFolderPath: defaultFolderPath ?? null,
      aspect: controller.aspect ?? null,
    }),
    [controller.folderId, controller.aspect, defaultFolderPath],
  );

  return (
    <WindowPanel
      id="crop-studio-window"
      title="Crop Studio"
      titleNode={
        <span className="flex items-center gap-2">
          <Crop className="h-4 w-4 text-primary" />
          Crop Studio
        </span>
      }
      onClose={onClose}
      overlayId="cropStudioWindow"
      onCollectData={collectData}
      minWidth={620}
      minHeight={420}
      width={720}
      height={520}
      position="center"
      sidebar={<CropStudioSidebar controller={controller} />}
      sidebarDefaultSize={160}
      sidebarMinSize={100}
      sidebarClassName="bg-muted/10 border-r"
      bodyClassName="flex flex-col min-h-0"
      footerLeft={<FooterDestination controller={controller} />}
      footerRight={<FooterActions controller={controller} />}
    >
      <CropStudioMain controller={controller} />
    </WindowPanel>
  );
}

// ── Main pane ───────────────────────────────────────────────────────────────

function CropStudioMain({ controller }: { controller: CropStudioController }) {
  if (!controller.hasEntries) {
    return (
      <div className="flex-1 min-h-0 p-4 overflow-auto">
        <StudioDropZone onFilesAdded={controller.addFiles} />
        <p className="mt-4 text-xs text-muted-foreground text-center">
          Drop one or many. Each file becomes a tab in the sidebar — crop them
          individually, or crop one and apply to all.
        </p>
      </div>
    );
  }

  if (!controller.active) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-muted-foreground">
        Pick an image from the sidebar to crop.
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 h-full">
      <InitialCropViewport controller={controller} className="flex-1 min-h-0" />
      <InitialCropAspectBar controller={controller} />
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────

function CropStudioSidebar({
  controller,
}: {
  controller: CropStudioController;
}) {
  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-2 py-1.5 border-b border-border shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
          Add images
        </p>
      </div>
      <div className="px-2 py-2 shrink-0 border-b border-border">
        <StudioDropZone
          onFilesAdded={controller.addFiles}
          compact
          listenForPaste
        />
      </div>

      {controller.hasEntries && (
        <div className="px-2 py-1.5 flex items-center justify-between shrink-0 border-b border-border">
          <p className="text-[10px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
            Queue ({controller.entries.length})
          </p>
          <button
            type="button"
            onClick={controller.clearAll}
            disabled={controller.isSaving}
            className="text-[10px] text-muted-foreground hover:text-destructive disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5 space-y-1">
        {controller.entries.map((entry) => (
          <SidebarTab
            key={entry.id}
            entry={entry}
            isActive={entry.id === controller.activeId}
            onSelect={() => controller.selectEntry(entry.id)}
            onRemove={() => controller.removeEntry(entry.id)}
            disabled={controller.isSaving}
          />
        ))}
      </div>
    </div>
  );
}

function SidebarTab({
  entry,
  isActive,
  onSelect,
  onRemove,
  disabled,
}: {
  entry: CropStudioEntry;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative flex items-stretch gap-2 rounded-md border-l-2 px-1.5 py-1.5 cursor-pointer transition-colors",
        isActive
          ? "border-primary bg-accent"
          : "border-transparent hover:bg-muted/60",
      )}
    >
      <div className="relative h-10 w-10 shrink-0 rounded overflow-hidden bg-zinc-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={entry.imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <StatusOverlay status={entry.status} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium truncate">{entry.file.name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          <StatusLabel entry={entry} />
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          onRemove();
        }}
        disabled={disabled || entry.status === "saving"}
        title="Remove from queue"
        className="opacity-0 group-hover:opacity-100 self-start text-muted-foreground hover:text-destructive disabled:opacity-40"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function StatusOverlay({ status }: { status: CropStudioEntryStatus }) {
  if (status === "saving") {
    return (
      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
        <Loader2 className="h-3.5 w-3.5 text-white animate-spin" />
      </div>
    );
  }
  if (status === "saved") {
    return (
      <div className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-success/95 text-success-foreground flex items-center justify-center">
        <CheckCircle2 className="h-2.5 w-2.5" />
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-destructive/95 text-destructive-foreground flex items-center justify-center">
        <TriangleAlert className="h-2.5 w-2.5" />
      </div>
    );
  }
  return null;
}

function StatusLabel({ entry }: { entry: CropStudioEntry }) {
  if (entry.status === "saving") return <>Saving…</>;
  if (entry.status === "saved") return <>Saved to cloud</>;
  if (entry.status === "error") {
    return (
      <span className="text-destructive">{entry.errorMessage ?? "Failed"}</span>
    );
  }
  if (entry.cropIsModified) return <>Cropped · ready to save</>;
  return <>Original · ready to save</>;
}

// ── Footer pieces ───────────────────────────────────────────────────────────

function FooterDestination({
  controller,
}: {
  controller: CropStudioController;
}) {
  return (
    <button
      type="button"
      onClick={controller.pickFolder}
      disabled={controller.isSaving}
      className="inline-flex items-center gap-1.5 h-7 px-2 text-xs rounded-md border border-border bg-card hover:border-primary/40 hover:bg-muted transition-colors disabled:opacity-50"
      title={controller.folderPath}
    >
      <FolderOpen className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium">{controller.folderName}</span>
      <span className="text-muted-foreground/70 ml-1 truncate max-w-[160px]">
        {controller.folderPath}
      </span>
    </button>
  );
}

function FooterActions({ controller }: { controller: CropStudioController }) {
  const canApplyToAll =
    controller.hasEntries &&
    controller.entries.length > 1 &&
    !!controller.active?.cropRect &&
    controller.cropIsModified;

  return (
    <div className="flex items-center gap-1.5">
      {controller.savedCount > 0 && (
        <span className="text-[11px] text-muted-foreground mr-1">
          {controller.savedCount} saved
          {controller.pendingCount > 0
            ? ` · ${controller.pendingCount} pending`
            : ""}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={controller.applyActiveCropToAll}
        disabled={!canApplyToAll || controller.isSaving}
        className="text-muted-foreground"
        title="Apply this crop rectangle to every other image, scaled proportionally"
      >
        <Crop className="h-3.5 w-3.5 mr-1.5" />
        Apply to all
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={controller.clearAll}
        disabled={!controller.hasEntries || controller.isSaving}
        className="text-muted-foreground"
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Discard
      </Button>
      <Button
        size="sm"
        onClick={controller.saveAll}
        disabled={
          !controller.hasEntries ||
          controller.isSaving ||
          controller.pendingCount === 0
        }
      >
        {controller.isSaving ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <CloudUpload className="h-3.5 w-3.5 mr-1.5" />
        )}
        {controller.isSaving
          ? "Saving…"
          : controller.pendingCount > 1
            ? `Save ${controller.pendingCount}`
            : "Save to cloud"}
      </Button>
    </div>
  );
}
