"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteOrganization } from "../service";
import type { Organization } from "../types";

interface DangerZoneProps {
  organization: Organization;
}

/**
 * DangerZone - Tab for destructive organization actions
 *
 * Features:
 * - Delete organization (owner only)
 * - Requires typing org name to confirm
 * - Shows warning about consequences
 * - Redirects to org list after deletion
 * - Cannot delete personal organizations
 */
export function DangerZone({ organization }: DangerZoneProps) {
  const router = useRouter();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const isConfirmationValid = confirmName === organization.name;

  // Handle organization deletion
  const handleDeleteOrganization = async () => {
    if (!isConfirmationValid) {
      toast.error("Please type the organization name correctly");
      return;
    }

    setIsDeleting(true);

    try {
      const result = await deleteOrganization(organization.id);

      if (result.success) {
        toast.success("Organization deleted successfully");
        setIsDeleteDialogOpen(false);

        // Redirect to organizations list
        router.push("/settings/organizations");
      } else {
        toast.error(result.error || "Failed to delete organization");
      }
    } catch (error: unknown) {
      console.error("Error deleting organization:", error);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Delete Organization Section */}
      <div className="border border-red-200 dark:border-red-800 rounded-lg p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-medium text-red-900 dark:text-red-100">
              Delete Organization
            </h3>
            <p className="text-sm text-muted-foreground">
              Permanently remove this organization and all data. This cannot be
              undone.
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

        <ul className="text-xs text-muted-foreground space-y-0.5 border-t pt-3">
          <li>• All members lose access immediately</li>
          <li>• Shared resources become private</li>
          <li>• Pending invitations are cancelled</li>
        </ul>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Delete Organization?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                This action will permanently delete{" "}
                <strong>{organization.name}</strong> and all of its data. This
                cannot be undone.
              </p>

              <div className="space-y-2">
                <Label htmlFor="confirm-name" className="text-foreground">
                  Type <strong>{organization.name}</strong> to confirm:
                </Label>
                <Input
                  id="confirm-name"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={organization.name}
                  className={
                    confirmName && !isConfirmationValid ? "border-red-500" : ""
                  }
                  disabled={isDeleting}
                  autoComplete="off"
                />
                {confirmName && !isConfirmationValid && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    The name doesn't match. Please type it exactly.
                  </p>
                )}
              </div>

              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                  ⚠️ This will permanently delete:
                </p>
                <ul className="text-sm text-red-700 dark:text-red-300 mt-2 space-y-1 list-disc list-inside">
                  <li>Organization settings and data</li>
                  <li>All member associations</li>
                  <li>All pending invitations</li>
                  <li>Shared resource permissions</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrganization}
              disabled={!isConfirmationValid || isDeleting}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Permanently
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
