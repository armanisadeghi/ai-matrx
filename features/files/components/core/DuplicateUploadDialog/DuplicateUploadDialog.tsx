/**
 * features/files/components/core/DuplicateUploadDialog/DuplicateUploadDialog.tsx
 *
 * Drive- / Dropbox-style "looks like you've uploaded these before"
 * confirmation. Mounted by `UploadGuardHost` whenever the pre-flight
 * duplicate scan turned up at least one conflict. Each row offers
 * three actions:
 *
 *   - **Overwrite**  — re-upload to the existing file's exact path.
 *                      The Python backend version-bumps in place;
 *                      previous versions are recoverable from the
 *                      Versions tab.
 *   - **Make a copy** — proceed with a unique " (1)" / " (2)" name.
 *                      Same as the existing collision behaviour, just
 *                      now opt-in instead of silent.
 *   - **Skip**       — don't upload this file at all. Useful when the
 *                      identical-content match means the user already
 *                      has what they need.
 *
 * The "Apply to all" toggle batches the same decision across every
 * remaining conflict so the user doesn't have to click N times for a
 * folder-drop with many duplicates.
 *
 * Identical-content matches default to **Skip**; pure name conflicts
 * default to **Make a copy**. Those defaults match what most users
 * actually want and shorten the path to "OK". They are still
 * overridable per-row.
 */

"use client";

import { useEffect, useState } from "react";
import { Check, Copy, FileWarning, Link2, RotateCw, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/features/files/utils/format";
import { FileIcon } from "@/features/files/components/core/FileIcon/FileIcon";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import type { CloudFile } from "@/features/files/types";
import type { DuplicateMatch } from "@/features/files/utils/upload-duplicate-detect";

/**
 * Per-conflict resolution.
 *
 * - `use_existing` — DON'T upload. The user confirms the existing file
 *   is what they meant. The host returns the existing `cld_files.id`
 *   in `aliased[]` so the caller (chat attach, agent resource picker,
 *   etc.) can wire that id into its context. Default for identical-
 *   content matches in same folder.
 * - `overwrite` — re-upload to the existing file's exact path; the
 *   backend version-bumps in place.
 * - `copy` — proceed with a unique `" (1)" / " (2)"` name. Both files
 *   coexist.
 * - `skip` — don't upload AND don't alias. The conflict is just
 *   dropped. Use when the user wants to abandon this one specific
 *   file without committing to "yes, attach the existing one."
 */
export type DuplicateAction = "use_existing" | "overwrite" | "copy" | "skip";

export interface DuplicateUploadDialogProps {
  open: boolean;
  /**
   * Conflicts to resolve. One per file the user dropped that triggered
   * a duplicate match. Files without a match are uploaded directly
   * by the host and never reach this dialog.
   */
  conflicts: DuplicateConflictRow[];
  /** User confirmed — proceed with the per-row decisions. */
  onResolve: (decisions: ResolvedDecision[]) => void;
  /** User dismissed the dialog (X / Esc / Cancel). Cancel ALL pending uploads. */
  onCancel: () => void;
}

export interface DuplicateConflictRow {
  /**
   * Stable id for this conflict row. Lets the dialog rebuild its
   * decisions map without relying on File-reference identity.
   */
  id: string;
  file: File;
  match: DuplicateMatch;
}

export interface ResolvedDecision {
  id: string;
  action: DuplicateAction;
}

export function DuplicateUploadDialog({
  open,
  conflicts,
  onResolve,
  onCancel,
}: DuplicateUploadDialogProps) {
  // Decisions are keyed on the conflict id (NOT File ref) so they
  // survive React reordering. Defaults are picked per match kind:
  // identical-content → skip, name-only → copy.
  const [decisions, setDecisions] = useState<Record<string, DuplicateAction>>(
    () => buildDefaultDecisions(conflicts),
  );
  const [applyToAll, setApplyToAll] = useState(false);

  // Re-seed defaults if the dialog opens with a fresh conflicts list.
  useEffect(() => {
    if (open) {
      setDecisions(buildDefaultDecisions(conflicts));
      setApplyToAll(false);
    }
  }, [open, conflicts]);

  const setOne = (id: string, action: DuplicateAction) => {
    if (applyToAll) {
      // Apply this choice to EVERY remaining row. Useful for big
      // batch uploads where the user makes one decision and is done.
      const next: Record<string, DuplicateAction> = {};
      for (const c of conflicts) next[c.id] = action;
      setDecisions(next);
    } else {
      setDecisions((d) => ({ ...d, [id]: action }));
    }
  };

  const handleConfirm = () => {
    onResolve(
      conflicts.map((c) => ({ id: c.id, action: decisions[c.id] ?? "skip" })),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className="max-w-2xl flex flex-col max-h-[85dvh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-amber-500" />
            {titleFor(conflicts)}
          </DialogTitle>
          <DialogDescription>
            {descriptionFor(conflicts)}
          </DialogDescription>
        </DialogHeader>

        {/* Apply-to-all toggle */}
        {conflicts.length > 1 ? (
          <label className="flex items-center gap-2 px-1 py-2 border-y bg-muted/30 cursor-pointer">
            <Checkbox
              checked={applyToAll}
              onCheckedChange={(v) => setApplyToAll(v === true)}
              className="shrink-0"
            />
            <span className="text-xs">
              Apply my next choice to all {conflicts.length} duplicates
            </span>
          </label>
        ) : null}

        {/* Scrollable conflict list */}
        <div className="flex-1 min-h-0 overflow-auto -mx-6 px-6">
          <ul className="flex flex-col gap-2 py-2">
            {conflicts.map((c) => (
              <ConflictRow
                key={c.id}
                conflict={c}
                action={decisions[c.id] ?? "skip"}
                onChange={(action) => setOne(c.id, action)}
              />
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel all
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="h-4 w-4 mr-1.5" />
            Continue with selections
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// One row in the conflict list
// ---------------------------------------------------------------------------

function ConflictRow({
  conflict,
  action,
  onChange,
}: {
  conflict: DuplicateConflictRow;
  action: DuplicateAction;
  onChange: (action: DuplicateAction) => void;
}) {
  const { file, match } = conflict;
  const existing = match.existing;
  const description = describeMatch(match, file);
  const isIdenticalContent =
    match.kind === "identical_content_same_folder" ||
    match.kind === "identical_content_other_folder";

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-3",
        // Make identical-content rows visually distinct — these are the
        // ones where "use existing" is almost always the right answer.
        isIdenticalContent &&
          action === "use_existing" &&
          "border-primary/40 bg-primary/[0.03]",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Existing file thumbnail — InlineMediaRef handles every mime,
            falls back to a sized icon for non-renderables (PDF, doc). */}
        <InlineMediaRef
          ref={existing.id}
          size="md"
          fit="cover"
          rounded="md"
          border="subtle"
          fallback="icon"
          alt={existing.fileName}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <FileIcon fileName={file.name} size={14} className="shrink-0" />
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
            {formatFileSize(file.size)} · trying to upload
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
            {description}
          </p>
          {/* Path of the existing match — gives the user enough context
              to confirm "yes, that's the one I meant" without leaving
              the dialog. */}
          <p
            className="mt-1 text-[11px] text-muted-foreground truncate"
            title={existing.filePath}
          >
            <span className="opacity-70">Existing:</span>{" "}
            <span className="font-mono">{pathLabelFor(existing)}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/40">
        {/* "Use existing" is the prominent CTA for identical-content
            matches — the canonical answer for "I'm uploading this PDF
            to attach to a chat and we already have it." */}
        <ActionPill
          icon={<Link2 className="h-3 w-3" />}
          label="Use existing"
          tooltip="Don't re-upload. Attach the existing file from your library and proceed with whatever you were doing."
          // Only meaningful when bytes match. For name-only conflicts
          // there's no semantic equivalence, so this would silently
          // attach the wrong content.
          disabled={!isIdenticalContent}
          active={action === "use_existing"}
          primary
          onClick={() => onChange("use_existing")}
        />
        <ActionPill
          icon={<RotateCw className="h-3 w-3" />}
          label="Overwrite"
          tooltip={
            match.kind === "identical_content_other_folder"
              ? "Not available — the existing file is in another folder."
              : "Save as a new version of the existing file. Old versions remain in the Versions tab."
          }
          // Cross-folder overwrite would require moving the existing
          // file; out of scope. Disable that case.
          disabled={match.kind === "identical_content_other_folder"}
          active={action === "overwrite"}
          onClick={() => onChange("overwrite")}
        />
        <ActionPill
          icon={<Copy className="h-3 w-3" />}
          label="Make a copy"
          tooltip="Upload as a separate file with an auto-numbered suffix, e.g. 'report (1).pdf'."
          active={action === "copy"}
          onClick={() => onChange("copy")}
        />
        <ActionPill
          icon={<X className="h-3 w-3" />}
          label="Skip"
          tooltip="Don't upload AND don't attach the existing one. Just drop this file from the batch."
          active={action === "skip"}
          onClick={() => onChange("skip")}
        />
      </div>
    </li>
  );
}

function ActionPill({
  icon,
  label,
  tooltip,
  active,
  disabled,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tooltip: string;
  active: boolean;
  disabled?: boolean;
  /**
   * When true and inactive, the pill renders with a subtle primary
   * accent so the user's eye lands on it as the recommended choice.
   * Active state still wins; this is a visual nudge, not a forced
   * default.
   */
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : primary
            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
            : "border-border bg-background hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDefaultDecisions(
  conflicts: DuplicateConflictRow[],
): Record<string, DuplicateAction> {
  const out: Record<string, DuplicateAction> = {};
  for (const c of conflicts) {
    // Identical content → "use existing" is what 95% of users want.
    // Same bytes already in their library: don't waste storage, just
    // attach the existing one. The user's other options stay one
    // click away.
    // Pure name conflict → "copy" preserves both files (the bytes
    // differ, so we can't safely treat them as the same content).
    out[c.id] =
      c.match.kind === "identical_content_same_folder" ||
      c.match.kind === "identical_content_other_folder"
        ? "use_existing"
        : "copy";
  }
  return out;
}

function describeMatch(match: DuplicateMatch, file: File): string {
  const existing = match.existing;
  switch (match.kind) {
    case "identical_content_same_folder":
      return `Identical bytes already saved here as “${existing.fileName}”. We can attach the existing file instead of uploading again.`;
    case "name_only":
      return `A different file named “${existing.fileName}” already exists in this folder${
        existing.fileSize != null
          ? ` (${formatFileSize(existing.fileSize)})`
          : ""
      }.`;
    case "identical_content_other_folder": {
      const path = pathLabelFor(existing);
      return `Same exact bytes are already saved at ${path}. Attach the existing one or upload a separate copy here.`;
    }
    default:
      void file;
      return "Possible duplicate detected.";
  }
}

function titleFor(conflicts: DuplicateConflictRow[]): string {
  if (conflicts.length === 1) {
    const kind = conflicts[0].match.kind;
    if (
      kind === "identical_content_same_folder" ||
      kind === "identical_content_other_folder"
    ) {
      return "You already have this file";
    }
    return "This file looks familiar";
  }
  return `${conflicts.length} files look familiar`;
}

function descriptionFor(conflicts: DuplicateConflictRow[]): string {
  if (conflicts.length === 1) {
    const kind = conflicts[0].match.kind;
    if (
      kind === "identical_content_same_folder" ||
      kind === "identical_content_other_folder"
    ) {
      return "Confirm we picked the right one and we'll attach the existing file. Or pick another action.";
    }
    return "Choose what to do with the duplicate before uploading.";
  }
  return "Choose what to do with each duplicate. Use “Apply to all” to make one decision for everything.";
}

function pathLabelFor(file: CloudFile): string {
  // The full server path is the most informative thing we have client-
  // side without resolving folder ancestry; trim the leading slash.
  const path = file.filePath.replace(/^\/+/, "");
  return path ? `“/${path}”` : `“${file.fileName}”`;
}

export default DuplicateUploadDialog;
