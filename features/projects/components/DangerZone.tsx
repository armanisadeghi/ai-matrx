"use client";

import React, { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteProject } from "../service";
import type { Project } from "../types";
import { useAppDispatch } from "@/lib/redux/hooks";
import { invalidateAndRefetchFullContext } from "@/features/agent-context/redux/hierarchyThunks";

interface DangerZoneProps {
  project: Project;
  orgSlug?: string | null;
}

export function DangerZone({ project, orgSlug }: DangerZoneProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (confirmName !== project.name) {
      toast.error("Project name does not match");
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteProject(project.id);
      if (result.success) {
        dispatch(
          invalidateAndRefetchFullContext() as unknown as Parameters<
            typeof dispatch
          >[0],
        );
        toast.success("Project deleted");
        router.push(
          orgSlug ? `/organizations/${orgSlug}/projects` : "/projects",
        );
      } else {
        toast.error(result.error ?? "Failed to delete project");
      }
    } catch (error: unknown) {
      const msg =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
          Danger Zone
        </h2>
        <p className="text-sm text-muted-foreground">Irreversible actions</p>
      </div>

      <Card className="border-red-200 dark:border-red-800 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <h3 className="text-sm font-semibold">Delete this project</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Permanently delete <strong>{project.name}</strong> and all of its
              data. This action cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
        </div>
      </Card>

      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 dark:text-red-400">
              Delete Project
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{project.name}</strong> and
              all associated data including tasks, members, and invitations.
              <br />
              <br />
              Type <strong>{project.name}</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={project.name}
            className="mt-2"
          />

          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel onClick={() => setConfirmName("")}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmName !== project.name || isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Project
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
