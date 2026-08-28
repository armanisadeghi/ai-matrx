/**
 * features/files/components/surfaces/OnboardingEmptyState.tsx
 *
 * First-time-user empty state for the main area. Shown when the tree has
 * fully loaded and the user has zero non-deleted files and folders.
 *
 * Visuals are inviting — big illustration-style icon, copy that sets
 * expectations, and two primary actions:
 *   - Upload files (triggers a picker via the outer FileUploadDropzone)
 *   - Paste an image (keyboard hint)
 *
 * The parent wraps this in a FileUploadDropzone (overlay mode) so the entire
 * empty-state surface is also a drop target. Drag-over shows the standard
 * overlay. Clicking "Upload files" opens the picker.
 */

"use client";

import {
  Cloud,
  FolderPlus,
  Image as ImageIcon,
  Shield,
  Zap,
} from "lucide-react";
import { FileAcquisitionActions } from "@/features/files/components/core/FileAcquisition/FileAcquisitionActions";
import type { FileUploadDropzoneActions } from "@/features/files/components/core/FileUploadDropzone/FileUploadDropzone";

export interface OnboardingEmptyStateProps {
  acquisition: FileUploadDropzoneActions;
  /** Callback for the "New folder" action. Phase 7 wires this up. */
  onCreateFolder?: () => void;
}

export function OnboardingEmptyState({
  acquisition,
  onCreateFolder,
}: OnboardingEmptyStateProps) {
  return (
    <div className="h-full w-full overflow-auto">
      <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-8 px-6 py-10 text-center">
        {/* Illustration */}
        <div className="relative">
          <div className="absolute inset-0 -m-4 rounded-full bg-primary/10 blur-2xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20">
            <Cloud className="h-12 w-12 text-primary" aria-hidden="true" />
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">
            Your cloud files live here
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Drop files anywhere on this window, paste an image with{" "}
            <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              ⌘V
            </kbd>
            , or click upload to get started. Everything syncs instantly
            across your devices.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <FileAcquisitionActions
            presentation="buttons"
            onFiles={acquisition.uploadFiles}
            enableExistingFiles={false}
          />
          {onCreateFolder ? (
            <button
              type="button"
              onClick={onCreateFolder}
              className="inline-flex items-center gap-2 rounded-md border bg-background px-4 py-2 text-sm hover:bg-accent"
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              New folder
            </button>
          ) : null}
        </div>

        {/* Reassurance trio — makes the blank slate feel productive */}
        <ul className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-3 pt-4">
          <li className="flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3">
            <Zap
              className="h-5 w-5 text-amber-500"
              aria-hidden="true"
            />
            <span className="text-xs font-medium">Instant sync</span>
            <span className="text-[11px] text-muted-foreground leading-tight">
              Uploads appear across every session in real time.
            </span>
          </li>
          <li className="flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3">
            <ImageIcon
              className="h-5 w-5 text-emerald-500"
              aria-hidden="true"
            />
            <span className="text-xs font-medium">Rich previews</span>
            <span className="text-[11px] text-muted-foreground leading-tight">
              Images, PDFs, video, code — previewed inline.
            </span>
          </li>
          <li className="flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3">
            <Shield
              className="h-5 w-5 text-sky-500"
              aria-hidden="true"
            />
            <span className="text-xs font-medium">Private by default</span>
            <span className="text-[11px] text-muted-foreground leading-tight">
              You choose who sees each file. Share via signed links.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
