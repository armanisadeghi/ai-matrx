"use client";

/**
 * The ONE "Show system files" control — a compact pressed/unpressed icon
 * button that sits inside an existing toolbar (the file picker's filter bar,
 * the Files page header). It writes the person's own value of the Feature Knob
 * `files.show_system_files` (default off) through `useShowSystemFiles`.
 *
 * Absent — never disabled — when the knob does not let this person set their
 * own value here (no active organization, the platform locked it, or the
 * organization locked the person rung).
 */

import { useState } from "react";
import { ServerCog } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useShowSystemFiles } from "@/features/files/hooks/useShowSystemFiles";

export function ShowSystemFilesToggle({ className }: { className?: string }) {
  const { showSystemFiles, canToggle, setShowSystemFiles } = useShowSystemFiles();
  const [saving, setSaving] = useState(false);
  if (!canToggle) return null;

  const label = showSystemFiles ? "Hide system files" : "Show system files";
  const onClick = async () => {
    setSaving(true);
    try {
      await setShowSystemFiles(!showSystemFiles);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      aria-pressed={showSystemFiles}
      aria-label={label}
      title={`${label} — files AI Matrx makes on its own (page captures, provider payloads, crawl output). They are never in Recents.`}
      disabled={saving}
      onClick={() => void onClick()}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded pointer-coarse:h-10 pointer-coarse:w-10",
        showSystemFiles
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/60",
        className,
      )}
    >
      <ServerCog className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}
