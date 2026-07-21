"use client";

/**
 * features/media-capture/components/CaptureReview.tsx
 *
 * Review step of the Capture Studio: the just-captured photo (a TRACKED
 * object URL — the owning studio revokes it on retake/replace/unmount and on
 * the save-swap) with retake / download / save actions. After a successful
 * save the local preview is replaced by the DURABLE render — `<InlineMediaRef>`
 * by `file_id` — proving the artifact round-trips through the files system.
 */

import { Check, Download, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";

export interface CaptureReviewProps {
  /** Tracked object URL of the captured blob (pre-save). */
  previewUrl: string;
  fileName: string;
  saving: boolean;
  /** Set after a successful save — switches the preview to InlineMediaRef. */
  savedFileId: string | null;
  uploadError: string | null;
  onRetake: () => void;
  onDownload: () => void;
  onSave: () => void;
}

export function CaptureReview({
  previewUrl,
  fileName,
  saving,
  savedFileId,
  uploadError,
  onRetake,
  onDownload,
  onSave,
}: CaptureReviewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/30">
        {savedFileId ? (
          <InlineMediaRef
            ref={savedFileId}
            size="fill"
            fit="contain"
            alt={fileName}
            rounded="none"
          />
        ) : (
          // Local ephemeral preview — object URL from the tracked registry.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={fileName}
            className="h-full w-full object-contain"
          />
        )}
        {savedFileId && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-card/90 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
            <Check className="h-3 w-3 text-primary" />
            Saved to Captures/Photos
          </span>
        )}
      </div>

      {uploadError && (
        <p className="mt-2 text-xs text-destructive">{uploadError}</p>
      )}

      <div className="mt-2 flex shrink-0 items-center gap-2 pb-safe">
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={onRetake}
          disabled={saving}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" />
          {savedFileId ? "New capture" : "Retake"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={onDownload}
          disabled={saving || Boolean(savedFileId)}
        >
          <Download className="mr-1.5 h-4 w-4" />
          Download
        </Button>
        {!savedFileId && (
          <Button size="sm" className="ml-auto h-9" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-4 w-4" />
            )}
            {saving ? "Saving…" : "Save"}
          </Button>
        )}
      </div>
    </div>
  );
}
