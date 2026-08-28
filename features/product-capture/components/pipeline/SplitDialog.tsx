"use client";

/**
 * SplitDialog — correct a mis-grouped folder. Seeds groups from the
 * analysis output (which images the agent said belong to which product);
 * the human reassigns thumbnails between groups, adds/renames groups, then
 * confirms: group 1 stays on this item, every other group becomes a new
 * item and re-queues for analysis.
 */

import React, { useEffect, useState } from "react";
import { Loader2, Plus, Split } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { cn } from "@/lib/utils";

import type { CaptureFile } from "../../types";
import type { AnalysisGroup } from "../../pipeline-types";
import type { SplitGroupInput } from "../../pipeline-service";
import { CommitField } from "./panel-primitives";

interface DraftGroup {
  label: string;
  fileIds: string[];
}

function seedGroups(
  files: CaptureFile[],
  initial: AnalysisGroup[] | undefined,
): DraftGroup[] {
  const photos = files.filter((f) => f.kind === "photo");
  const photoIds = new Set(photos.map((f) => f.fileId));
  const groups: DraftGroup[] = [];
  const assigned = new Set<string>();
  for (const g of initial ?? []) {
    const ids = g.fileIds.filter((id) => photoIds.has(id) && !assigned.has(id));
    ids.forEach((id) => assigned.add(id));
    groups.push({ label: g.label || `Product ${groups.length + 1}`, fileIds: ids });
  }
  const unassigned = photos
    .map((f) => f.fileId)
    .filter((id) => !assigned.has(id));
  if (groups.length === 0) {
    groups.push({ label: "Product 1", fileIds: unassigned });
    groups.push({ label: "Product 2", fileIds: [] });
  } else if (unassigned.length > 0) {
    groups[0] = { ...groups[0], fileIds: [...groups[0].fileIds, ...unassigned] };
  }
  return groups;
}

export function SplitDialog({
  open,
  onOpenChange,
  files,
  initialGroups,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: CaptureFile[];
  initialGroups?: AnalysisGroup[];
  onConfirm: (groups: SplitGroupInput[]) => Promise<void>;
}) {
  const [groups, setGroups] = useState<DraftGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState(0);
  const [busy, setBusy] = useState(false);

  // Re-seed each time the dialog opens (deferred a tick — no sync setState
  // inside the effect).
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setGroups(seedGroups(files, initialGroups));
      setActiveGroup(0);
    }, 0);
    return () => clearTimeout(timer);
  }, [open, files, initialGroups]);

  const groupOf = (fileId: string) =>
    groups.findIndex((g) => g.fileIds.includes(fileId));

  const assign = (fileId: string) => {
    setGroups((prev) =>
      prev.map((g, i) => ({
        ...g,
        fileIds:
          i === activeGroup
            ? g.fileIds.includes(fileId)
              ? g.fileIds
              : [...g.fileIds, fileId]
            : g.fileIds.filter((id) => id !== fileId),
      })),
    );
  };

  const nonEmpty = groups.filter((g) => g.fileIds.length > 0);
  const canConfirm = nonEmpty.length >= 2 && !busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-full max-w-[95vw] flex-col overflow-hidden lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Split into separate items</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pick a group, then tap the photos that belong to it. Group 1 stays
          on this item; every other group becomes its own item and re-runs
          analysis.
        </p>

        {/* Group tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {groups.map((g, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveGroup(i)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
                i === activeGroup
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              {g.label || `Product ${i + 1}`}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  i === activeGroup ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {g.fileIds.length}
              </span>
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() =>
              setGroups((prev) => [
                ...prev,
                { label: `Product ${prev.length + 1}`, fileIds: [] },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Group
          </Button>
          <div className="min-w-40 flex-1">
            <CommitField
              value={groups[activeGroup]?.label ?? ""}
              placeholder="Group label"
              onCommit={(v) =>
                setGroups((prev) =>
                  prev.map((g, i) =>
                    i === activeGroup ? { ...g, label: v } : g,
                  ),
                )
              }
            />
          </div>
        </div>

        {/* Photo grid */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {files
              .filter((f) => f.kind === "photo")
              .map((file) => {
                const g = groupOf(file.fileId);
                const inActive = g === activeGroup;
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => assign(file.fileId)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-lg bg-muted ring-2 ring-inset transition-shadow",
                      inActive
                        ? "ring-primary"
                        : g >= 0
                          ? "ring-border opacity-70"
                          : "ring-transparent",
                    )}
                    aria-pressed={inActive}
                  >
                    <CaptureThumb fileId={file.fileId} alt="Photo" />
                    {g >= 0 && (
                      <span
                        className={cn(
                          "absolute left-1 top-1 rounded-full px-1.5 text-[10px] font-semibold",
                          inActive
                            ? "bg-primary text-primary-foreground"
                            : "bg-black/60 text-white",
                        )}
                      >
                        {g + 1}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!canConfirm}
            onClick={() => {
              setBusy(true);
              void onConfirm(
                nonEmpty.map((g) => ({ label: g.label, fileIds: g.fileIds })),
              ).finally(() => setBusy(false));
            }}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Split className="mr-1.5 h-4 w-4" />
            )}
            Split into {Math.max(nonEmpty.length, 2)} items
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
