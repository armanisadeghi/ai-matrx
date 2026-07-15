"use client";

// Header for the `/transcripts/processor` workspace: mode nav (shared with
// the rest of the transcripts hub) centered, workspace-scoped actions
// (New / Refresh / Copy / Export / Delete) on the right — collapsing into a
// bottom sheet on mobile via `HeaderActions`.

import HeaderActions from "@/features/shell/components/header/variants/shared/HeaderActions";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { TranscriptsModeController } from "./TranscriptsModeController";

interface TranscriptsProcessorHeaderProps {
  hasActiveTranscript: boolean;
  onCreateNew: () => void;
  onRefresh: () => void;
  onCopy: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export function TranscriptsProcessorHeader({
  hasActiveTranscript,
  onCreateNew,
  onRefresh,
  onCopy,
  onExport,
  onDelete,
}: TranscriptsProcessorHeaderProps) {
  const actions: HeaderAction[] = [
    { icon: "Plus", label: "New transcript", onPress: onCreateNew },
    { icon: "RefreshCw", label: "Refresh", onPress: onRefresh },
    ...(hasActiveTranscript
      ? [
          { icon: "Copy", label: "Copy transcript", onPress: onCopy },
          { icon: "Download", label: "Export as text", onPress: onExport },
          {
            icon: "Trash2",
            label: "Delete transcript",
            onPress: onDelete,
            destructive: true,
          },
        ]
      : []),
  ];

  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-2">
      <div className="min-w-0 flex-1" />
      <div className="flex min-w-0 shrink-0 justify-center">
        <TranscriptsModeController />
      </div>
      <div className="flex min-w-0 flex-1 justify-end">
        <HeaderActions actions={actions} sheetTitle="Transcript actions" />
      </div>
    </div>
  );
}
