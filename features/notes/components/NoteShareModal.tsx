// features/notes/components/NoteShareModal.tsx
"use client";

import React from "react";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { useIsOwner } from "@/utils/permissions";

interface NoteShareModalProps {
  /** Mount this component only when a note is selected — noteId must be defined. */
  noteId: string;
  noteLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Thin note adapter over the canonical sharing UI (`features/sharing/ShareModal`).
 *
 * It exists only to supply `isOwner` (via `useIsOwner`) so callers that track a
 * `shareNoteId: string | null` can drop the modal in without recomputing
 * ownership. There is no note-specific sharing logic here — everything (user
 * search + email lookup, org share, public toggle, current grants) lives in the
 * one canonical `ShareModal`. Do NOT reintroduce a bespoke note share dialog.
 */
export function NoteShareModal({
  noteId,
  noteLabel,
  open,
  onOpenChange,
}: NoteShareModalProps) {
  const { isOwner } = useIsOwner("note", noteId);

  return (
    <ShareModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      resourceType="note"
      resourceId={noteId}
      resourceName={noteLabel}
      isOwner={isOwner}
    />
  );
}
