"use client";

// NoteVersionHistory — Resizable version timeline for the active note.
// Desktop: MatrxDynamicPanelHost (drag-resize, repositionable).
// Mobile: bottom Drawer per mobile rules.

import React, { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { X } from "lucide-react";
import {
  MatrxDynamicPanelHost,
  sidePanelWidthToPercent,
} from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

const DiffHistory = dynamic(
  () =>
    import("@/features/text-diff/components/DiffHistory").then((m) => ({
      default: m.DiffHistory,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        Loading version history...
      </div>
    ),
  },
);

interface NoteVersionHistoryProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when a version is restored so the workspace can refresh the note */
  onVersionRestored?: (versionNumber: number) => void;
}

function HistoryContent({
  noteId,
  onVersionRestored,
}: {
  noteId: string;
  onVersionRestored?: (versionNumber: number) => void;
}) {
  const handleRestore = useCallback(
    (versionNumber: number) => {
      onVersionRestored?.(versionNumber);
    },
    [onVersionRestored],
  );

  return (
    <DiffHistory
      noteId={noteId}
      onRestoreVersion={handleRestore}
      showHeader={false}
      className="h-full min-h-0 rounded-none border-0 bg-transparent shadow-none"
    />
  );
}

function MobileHistoryDrawer({
  noteId,
  open,
  onOpenChange,
  onVersionRestored,
}: NoteVersionHistoryProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[88dvh] gap-0 p-0">
        <DrawerTitle className="sr-only">Version History</DrawerTitle>
        <DrawerDescription className="sr-only">
          Timeline of saved versions for this note
        </DrawerDescription>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3">
          <span className="flex-1 truncate text-sm font-semibold text-foreground">
            Version History
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close version history"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <HistoryContent
            noteId={noteId}
            onVersionRestored={onVersionRestored}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export function NoteVersionHistory({
  noteId,
  open,
  onOpenChange,
  onVersionRestored,
}: NoteVersionHistoryProps) {
  const isMobile = useIsMobile();
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (isMobile) {
    return (
      <MobileHistoryDrawer
        noteId={noteId}
        open={open}
        onOpenChange={onOpenChange}
        onVersionRestored={onVersionRestored}
      />
    );
  }

  const minPct = sidePanelWidthToPercent(320, viewportWidth);
  const maxPct = sidePanelWidthToPercent(720, viewportWidth);
  const defaultPct = sidePanelWidthToPercent(
    460,
    viewportWidth,
    minPct,
    maxPct,
  );

  return (
    <MatrxDynamicPanelHost
      open={open}
      onOpenChange={onOpenChange}
      title="Version History"
      description="Restore or compare saved versions"
      expandButtonLabel="Version History"
      position="right"
      defaultSize={defaultPct}
      minSize={minPct}
      maxSize={maxPct}
      contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
      className="z-40"
    >
      <HistoryContent noteId={noteId} onVersionRestored={onVersionRestored} />
    </MatrxDynamicPanelHost>
  );
}
