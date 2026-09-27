"use client";

/**
 * "File under…" — the associations picker over the registered filing places
 * (the same list the Source Save panel offers). Picking a place hands it back;
 * the caller writes one association per item and reports the outcome.
 */

import {
  UniversalAssociationPicker,
} from "@ai-matrx/associations/react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SAVE_TARGET_TOKENS } from "@/features/sources/saveSourceLogic";
import type { FileUnderContainer } from "@/features/knowledge/hub/hubActions";

interface FileUnderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  orgId: string | null;
  onPick: (container: FileUnderContainer) => void;
}

const EMPTY = new Set<string>();

export function FileUnderDialog({ open, onOpenChange, count, orgId, onPick }: FileUnderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>File {count === 1 ? "1 item" : `${count} items`} under…</DialogTitle>
          <DialogDescription>
            Pick a project, scope, research topic or other place. Each item is filed there; nothing is moved or copied.
          </DialogDescription>
        </DialogHeader>
        <UniversalAssociationPicker
          tokens={[...SAVE_TARGET_TOKENS] as EntityTypeToken[]}
          attachedKeys={EMPTY}
          orgId={orgId}
          onAttach={async (token, id, title) => {
            onPick({ token, id, title: title || "Untitled" });
            onOpenChange(false);
            return { ok: true };
          }}
          onDetach={async () => ({ ok: true })}
        />
      </DialogContent>
    </Dialog>
  );
}
