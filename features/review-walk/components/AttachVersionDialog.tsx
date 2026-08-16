"use client";

/**
 * AttachVersionDialog — O1 "attach your version" (Engram §4.3, one-click).
 *
 * A compact editor pre-filled with the AI's output where the user writes THEIR
 * version. Save calls `captureCorrection` (lib/output-feedback) →
 * `platform.output_feedback.corrected_content`; the original model output is
 * frozen automatically on first write. Reopening with an existing correction
 * edits it in place.
 *
 * The base DialogContent auto-converts to a bottom sheet on mobile, so no
 * separate Drawer branch is needed (ios-mobile-first).
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";
import type { UseOutputFeedbackResult } from "@/lib/output-feedback/useOutputFeedback";

export interface AttachVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The AI output as produced — the prefill when no correction exists. */
  originalContent: string;
  /** The already-attached correction, when one exists. */
  existingCorrection: string | null;
  captureCorrection: UseOutputFeedbackResult["captureCorrection"];
  isSaving: boolean;
}

export function AttachVersionDialog({
  open,
  onOpenChange,
  originalContent,
  existingCorrection,
  captureCorrection,
  isSaving,
}: AttachVersionDialogProps) {
  const [draft, setDraft] = useState("");

  // Re-seed each time the dialog opens: the attached version wins, else the
  // AI output so the user edits rather than retypes.
  useEffect(() => {
    if (open) setDraft(existingCorrection ?? originalContent);
  }, [open, existingCorrection, originalContent]);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      toast.error("Your version is empty — write or paste the output you wanted");
      return;
    }
    try {
      await captureCorrection({
        correctedContent: trimmed,
        originalContent,
      });
      toast.success(
        "Your version is saved — it becomes the reference the system is judged against",
      );
      onOpenChange(false);
    } catch {
      toast.error("Could not save your version");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-full flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {existingCorrection ? "Your version" : "Attach your version"}
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Edit the response into what it SHOULD have said. Your version is
          stored beside the frozen original and becomes the reference the
          system is judged against.
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProTextarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoGrow
            minHeight={160}
            maxHeight={420}
            className="text-base"
            style={{ fontSize: "16px" }}
            placeholder="Write or paste the output you wanted…"
          />
        </div>
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="h-10 w-full sm:w-auto"
            onClick={handleSave}
            disabled={isSaving || !draft.trim()}
          >
            {isSaving ? "Saving…" : "Save my version"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
