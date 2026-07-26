"use client";

/**
 * features/media-capture/components/CaptureItemActions.tsx
 *
 * The ONE per-capture action surface, shared by the /camera library cards and
 * the Media window's Camera-tab session rows. It is a thin HOST over the
 * canonical files action stack — nothing about files is reimplemented here:
 *
 *   • the menu itself is `<FileContextMenu>` (Preview / Download / Copy link /
 *     Rename / Visibility / Delete / info / versions — all wired through
 *     `useFileMenuActions` → `useFileActions` thunks);
 *   • **Move…** and **Share…** are the two items `FileContextMenu` leaves to
 *     its host (`onMove` / `onShare`). We supply them with the canonical
 *     `openFolderPicker` + `useFileMutation().move` and the canonical
 *     `<PermissionsDialog>`; rename opens the canonical `<RenameDialog>`;
 *   • **Transcribe** rides in via the menu's `extraMenuItems` slot for video
 *     and audio items only. It calls `transcribeCloudFile` (POST
 *     /audio/transcribe-file) BY FILE ID — the bytes never round-trip through
 *     the browser — and shows the result through the existing
 *     `<ContentActionBar />` (copy / read aloud / save to notes / export).
 *
 * Mobile: the transcript surface is a Drawer, not a Dialog (house rule).
 */

import { useCallback, useState } from "react";
import { FileText, Loader2, MoreVertical } from "lucide-react";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ContentActionBar } from "@/components/content-actions/ContentActionBar";
import { FileContextMenu } from "@/features/files/components/core/FileContextMenu/FileContextMenu";
import { PermissionsDialog } from "@/features/files/components/core/PermissionsDialog/PermissionsDialog";
import { RenameDialog } from "@/features/files/components/core/RenameDialog/RenameDialog";
import { openFolderPicker } from "@/features/files/components/pickers/cloudFilesPickerOpeners";
import { useFileMutation } from "@/features/files/hooks/useFileMutation";
import { transcribeCloudFile } from "@/features/audio/services/speechApi";

export type CaptureItemKind = "photo" | "video" | "audio";

export interface CaptureItemActionsProps {
  fileId: string;
  fileName: string;
  kind: CaptureItemKind;
  /** Current parent folder — lets Move skip a no-op reparent. */
  parentFolderId?: string | null;
  /** Fired after a successful delete so the host can drop its own row. */
  onDeleted?: (fileId: string) => void;
  /** Extra classes for the trigger button. */
  triggerClassName?: string;
}

export function CaptureItemActions({
  fileId,
  fileName,
  kind,
  parentFolderId = null,
  onDeleted,
  triggerClassName,
}: CaptureItemActionsProps) {
  const isMobile = useIsMobile();
  const mutate = useFileMutation();
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);

  const handleMove = useCallback(async () => {
    const target = await openFolderPicker({
      title: "Move capture to…",
      description: "Choose a destination folder.",
    });
    if (target === undefined) return; // dismissed
    if (target === parentFolderId) return; // no-op
    try {
      await mutate.move(fileId, target);
      toast.success(`Moved "${fileName}".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed.");
    }
  }, [fileId, fileName, mutate, parentFolderId]);

  const handleTranscribe = useCallback(async () => {
    setTranscribing(true);
    try {
      const result = await transcribeCloudFile({ fileId });
      const text = result.text?.trim() ?? "";
      if (!text) {
        // Honest empty result — never present silence as a transcript.
        toast.error("No speech was detected in this capture.");
        return;
      }
      setTranscript(text);
    } catch (err) {
      console.error("[CaptureItemActions] transcription failed", err);
      toast.error(
        err instanceof Error ? err.message : "Transcription failed.",
      );
    } finally {
      setTranscribing(false);
    }
  }, [fileId]);

  const canTranscribe = kind === "video" || kind === "audio";

  const transcriptBody = transcript ? (
    <div className="flex min-h-0 flex-col gap-2">
      <ContentActionBar
        content={transcript}
        title={`Transcript — ${fileName}`}
        instanceKey={`capture-transcript-${fileId}`}
        metadata={{ file_id: fileId, capture_kind: kind }}
      />
      <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 px-3 py-2 text-sm leading-relaxed text-foreground">
        {transcript}
      </div>
    </div>
  ) : null;

  return (
    <>
      <FileContextMenu
        fileId={fileId}
        onRename={() => setRenameOpen(true)}
        onShare={() => setShareOpen(true)}
        onMove={() => void handleMove()}
        onDeleted={onDeleted}
        extraMenuItems={
          canTranscribe ? (
            <DropdownMenuItem
              onSelect={(e) => {
                // Keep the menu's close from cancelling the request.
                e.preventDefault();
                void handleTranscribe();
              }}
              disabled={transcribing}
            >
              {transcribing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              {transcribing ? "Transcribing…" : "Transcribe"}
            </DropdownMenuItem>
          ) : null
        }
      >
        <button
          type="button"
          aria-label={`Actions for ${fileName}`}
          title="Capture actions"
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            triggerClassName,
          )}
        >
          {transcribing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoreVertical className="h-3.5 w-3.5" />
          )}
        </button>
      </FileContextMenu>

      <RenameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        kind="file"
        resourceId={fileId}
        currentName={fileName}
      />
      <PermissionsDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        resourceId={fileId}
        resourceType="file"
      />

      {isMobile ? (
        <Drawer
          open={transcript !== null}
          onOpenChange={(open) => {
            if (!open) setTranscript(null);
          }}
        >
          <DrawerContent className="max-h-[85dvh] pb-safe">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-sm">Transcript</DrawerTitle>
              <DrawerDescription className="text-xs">
                {fileName}
              </DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4">
              {transcriptBody}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog
          open={transcript !== null}
          onOpenChange={(open) => {
            if (!open) setTranscript(null);
          }}
        >
          <DialogContent className="flex max-h-[80dvh] flex-col sm:max-w-[640px]">
            <DialogHeader>
              <DialogTitle className="text-sm">Transcript</DialogTitle>
              <DialogDescription className="text-xs">
                {fileName}
              </DialogDescription>
            </DialogHeader>
            {transcriptBody}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
