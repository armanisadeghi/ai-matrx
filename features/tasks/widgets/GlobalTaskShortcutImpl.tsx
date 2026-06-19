"use client";

/**
 * Global Task Shortcut — heavy body (Impl).
 *
 * Renders the quick-create dialog (Dialog + Input + Textarea + Button +
 * lucide icons + projects selector + tasks slice). Lazy-loaded by
 * `GlobalTaskShortcut.tsx` ONLY after the first ⌘⇧T keypress, so this
 * file's dep graph never enters the static graph of any route.
 */

import React, { useEffect, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useAssociateTask } from "@/features/tasks/hooks/useAssociateTask";
import { selectProjects } from "@/features/tasks/redux/selectors";
import { setSelectedTaskId } from "@/features/tasks/redux/taskUiSlice";

interface Props {
  onClose: () => void;
}

export default function GlobalTaskShortcutImpl({ onClose }: Props) {
  const dispatch = useAppDispatch();
  const projects = useAppSelector(selectProjects);
  const { createAndAssociate, isBusy } = useAssociateTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>("");

  useEffect(() => {
    return () => {
      setTitle("");
      setDescription("");
      setProjectId("");
    };
  }, []);

  const submit = async () => {
    const t = title.trim();
    if (!t) return;
    const id = await createAndAssociate({
      title: t,
      description: description.trim() || null,
      project_id: projectId || undefined,
    });
    if (id) {
      dispatch(setSelectedTaskId(id));
      onClose();
    }
  };

  return (
    <Dialog
      open={true}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription className="text-xs">
            ⌘⇧T from anywhere. Uses your active app context for project +
            scopes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <ProInput
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onSubmit={() => void submit()}
            submitOnCmdEnter
            submitLabel="Create task"
            submitDisabled={!title.trim() || isBusy}
            isSubmitting={isBusy}
            showCopyButton={false}
            placeholder="Task title..."
            className="h-9"
            wrapperClassName="w-full"
          />
          <ProTextarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            autoGrow
            minHeight={80}
            maxHeight={200}
            showCopyButton={false}
            className="text-sm min-h-[80px] resize-y"
            wrapperClassName="w-full"
          />
          <div className="flex items-center gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex-1 h-8 bg-card border border-border rounded-md px-2 text-xs outline-none hover:border-foreground/30"
            >
              <option value="">Auto (active project)</option>
              {projects
                .filter((p) => p.id !== "__unassigned__")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
            <Button
              onClick={submit}
              disabled={!title.trim() || isBusy}
              className="h-8"
            >
              {isBusy ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Create
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            ⌘+Enter to submit, Esc to cancel
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
