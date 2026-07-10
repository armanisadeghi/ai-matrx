// features/education/notes/EduNoteActionBar.tsx
//
// The education chrome that wraps the reused notes editor: Back-to-list, Live
// capture, Convert-to-study-material, canonical Share, and the reverse-lineage
// "generated from this" chips. Everything here is a thin consumer — the editor,
// storage, autosave, sharing, and the converter all come from canonical systems.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectNoteById } from "@/features/notes/redux/selectors";
import { useAccess } from "@/utils/permissions/access";
import { canEditAccess } from "@/utils/permissions/access-core";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { LiveCaptureButton } from "./LiveCaptureButton";
import { ConvertNoteDialog } from "./ConvertNoteDialog";
import { GeneratedArtifactsChips } from "./GeneratedArtifactsChips";

export function EduNoteActionBar({ noteId }: { noteId: string }) {
  const router = useRouter();
  const note = useAppSelector(selectNoteById(noteId));
  const access = useAccess("note", noteId);
  const [convertOpen, setConvertOpen] = useState(false);
  const [selectionText, setSelectionText] = useState<string>("");
  const [lineageKey, setLineageKey] = useState(0);

  const label = note?.label ?? "Untitled note";
  const content = note?.content ?? "";
  const orgId = note?.organization_id ?? undefined;
  const canEdit = !access.loading && canEditAccess(access.level);

  const openConvert = () => {
    // Capture the current in-editor text selection so "convert this passage"
    // works. Empty when nothing is selected → the dialog offers whole-note only.
    const sel = typeof window !== "undefined" ? window.getSelection()?.toString() ?? "" : "";
    setSelectionText(sel);
    setConvertOpen(true);
  };

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-border bg-card/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => router.push("/education/notes")}
          className="gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Notes
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {label}
        </div>
        {canEdit && <LiveCaptureButton noteId={noteId} />}
        <Button size="sm" onClick={openConvert} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Convert
        </Button>
        <ShareButton
          resourceType="note"
          resourceId={noteId}
          resourceName={label}
          isOwner={access.isOwner}
          size="sm"
          showStatus={false}
        />
      </div>

      <GeneratedArtifactsChips noteId={noteId} refreshKey={lineageKey} />

      <ConvertNoteDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        noteId={noteId}
        noteTitle={label}
        noteContent={content}
        orgId={orgId}
        selectionText={selectionText}
        onConverted={() => setLineageKey((k) => k + 1)}
      />
    </div>
  );
}
