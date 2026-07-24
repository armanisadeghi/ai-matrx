"use client";

// features/war-room/components/all/NewRoomFromProjectDialog.tsx
//
// "From project" flow on /war-room/all: a CONTROLLED dialog (the trigger now
// lives in the shell header via HeaderActions) with the canonical
// shared ProjectPicker. On select, mints a project-flavored room via
// createRoomFromProject, then navigates to it using the repo's useTransition
// navigation standard.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createRoomFromProject } from "@/features/war-room/redux/thunks";
import { ProjectPicker } from "@/features/projects/components/ProjectPicker";

export function NewRoomFromProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = creating || pending;

  async function handleSelect(
    projectId: string | null,
    displayName: string | null,
  ) {
    // The picker fires onSelect(null, null) on its inline clear control; ignore
    // that and any in-flight double-clicks.
    if (!projectId || busy) return;
    setCreating(true);
    const session = await dispatch(createRoomFromProject(projectId, displayName));
    setCreating(false);
    // On null the thunk already surfaced its own error toast — keep the dialog
    // open so the user can retry or pick a different project.
    if (session) {
      onOpenChange(false);
      startTransition(() => router.push(`/war-room/${session.id}`));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open a War Room from a project</DialogTitle>
          <DialogDescription>
            Pick a project to spin up a room focused on it — its tasks, notes,
            and recordings, ready in one place.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-card p-2">
          <ProjectPicker value={null} onSelect={handleSelect} />
        </div>
        {busy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Opening room…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
