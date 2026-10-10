"use client";

// features/spaces/io/NotionImportDoorImpl.tsx — the heavy half of the Notion import door: the chooser
// (export file or connected workspace), the run state and the report dialog. Never import this directly —
// NotionImportDoor.tsx is the only door and loads it through ONE next/dynamic edge.
// It needs no Spaces store: the report's links are plain routes.

import { Button } from "@ai-matrx/design-system/controls";
import { Archive, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { NotionImportDialog, useNotionImport } from "./NotionImport";

export default function NotionImportDoorImpl({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const state = useNotionImport();
  const zip = useRef<HTMLInputElement>(null);
  const { stage } = state;

  // The report dialog ends the run by clearing its stage: that is also the door closing.
  const ending = { ...state, setStage: (next: Parameters<typeof state.setStage>[0]) => (state.setStage(next), next === null && onClose()) };

  return (
    <>
      <Dialog open={stage === null} onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogContent className="max-w-[min(420px,96vw)] gap-3 p-4" data-notion-import-chooser="">
          <DialogTitle>Import from Notion</DialogTitle>
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => (zip.current && ((zip.current.value = ""), zip.current.click()))}>
              <Archive size={16} aria-hidden />
              Notion export (.zip)
            </Button>
            <Button type="button" variant="outline" className="justify-start gap-2" onClick={() => void state.connect()}>
              <Link2 size={16} aria-hidden />
              Connect Notion
            </Button>
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="quiet" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <input
        ref={zip}
        type="file"
        accept=".zip,application/zip"
        hidden
        aria-hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) void state.fromZip(file);
        }}
      />
      <NotionImportDialog state={ending} onOpenPage={(id) => router.push(`/spaces/${id}`)} onOpenTable={(id) => router.push(`/data/${id}`)} />
    </>
  );
}
