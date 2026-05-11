"use client";

// NoteVersionHistory — Side panel showing version timeline for the active note.
// Wraps the existing DiffHistory component with SSR notes workspace integration.

import React, { useCallback } from "react";
import dynamic from "next/dynamic";
import { X, History } from "lucide-react";
import { cn } from "@/lib/utils";

const DiffHistory = dynamic(
  () =>
    import("@/features/text-diff/components/DiffHistory").then((m) => ({
      default: m.DiffHistory,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
        Loading version history...
      </div>
    ),
  },
);

interface NoteVersionHistoryProps {
  noteId: string;
  onClose: () => void;
  /** Called when a version is restored so the workspace can refresh the note */
  onVersionRestored?: (versionNumber: number) => void;
  className?: string;
}

export function NoteVersionHistory({
  noteId,
  onClose,
  onVersionRestored,
  className,
}: NoteVersionHistoryProps) {
  const handleRestore = useCallback(
    (versionNumber: number) => {
      onVersionRestored?.(versionNumber);
    },
    [onVersionRestored],
  );

  return (
    <div
      className={cn(
        "flex flex-col h-full border-l border-border bg-card/80 backdrop-blur-sm",
        className,
      )}
    >
      {/* Panel header — close button only; DiffHistory renders its own title */}
      <div className="flex items-center justify-end px-2 py-1.5 border-b border-border shrink-0">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-5 h-5 rounded hover:bg-accent transition-colors cursor-pointer [&_svg]:w-3 [&_svg]:h-3 text-muted-foreground hover:text-foreground"
          title="Close history"
        >
          <X />
        </button>
      </div>

      {/* Version Timeline — fills remaining height */}
      <div className="flex-1 min-h-0 flex flex-col">
        <DiffHistory
          noteId={noteId}
          onRestoreVersion={handleRestore}
          className="border-0 shadow-none rounded-none bg-transparent"
        />
      </div>
    </div>
  );
}
