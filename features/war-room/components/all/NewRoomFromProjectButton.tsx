"use client";

// features/war-room/components/all/NewRoomFromProjectButton.tsx
//
// Secondary affordance on /war-room/all: start a War Room FROM an existing
// project. Opens a dialog with the canonical EntityTargetPicker (kind="project")
// and, on select, mints a project-flavored room via createRoomFromProject, then
// navigates to it using the repo's useTransition navigation standard (matches
// NewSessionButton).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { EntityTargetPicker } from "@/features/scopes/components/entity-context/EntityTargetPicker";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { createRoomFromProject } from "@/features/war-room/redux/thunks";

export function NewRoomFromProjectButton() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  // Hydrate the org/project/task tree so the picker has projects to list.
  useScopeTree();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = creating || pending;

  async function handleSelect(projectId: string | null, displayName: string | null) {
    // The picker fires onSelect(null, null) on its inline clear control; ignore
    // that and any in-flight double-clicks.
    if (!projectId || busy) return;
    setCreating(true);
    const session = await dispatch(createRoomFromProject(projectId, displayName));
    setCreating(false);
    // On null the thunk already surfaced its own error toast — keep the dialog
    // open so the user can retry or pick a different project.
    if (session) {
      setOpen(false);
      startTransition(() => router.push(`/war-room/${session.id}`));
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={busy}
        className="gap-1.5"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FolderKanban className="size-4" />
        )}
        <span className="hidden sm:inline">From project</span>
      </Button>

      <Dialog open={open} onOpenChange={(next) => (busy ? null : setOpen(next))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open a War Room from a project</DialogTitle>
            <DialogDescription>
              Pick a project to spin up a room focused on it — its tasks, notes,
              and recordings, ready in one place.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-card p-2">
            <EntityTargetPicker
              kind="project"
              value={null}
              onSelect={handleSelect}
              label="Choose a project"
            />
          </div>
          {busy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Opening room…
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
