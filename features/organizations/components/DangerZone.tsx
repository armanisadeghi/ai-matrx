"use client";

import React, { useRef, useState } from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
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
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";
import { deleteOrganization } from "../service";
import {
  clearOrganizationStore,
  organizationStoreContents,
  type OrganizationStoreContents,
} from "../service/organizationStoreContents";
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
  // WHAT THIS ORGANIZATION HOLDS, read from the store's own door the moment the
  // dialog opens. `null` while we are still asking, and when the store is
  // switched off for this organization — there is then nothing of this kind to
  // say, and a screen never invents a sentence it cannot stand behind.
  const [held, setHeld] = useState<OrganizationStoreContents | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  // The store's own answer when it could not let everything go: what is
  // waiting, and the date it can. Never a foreign key.
  const [storeRefusal, setStoreRefusal] = useState<string | null>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const confirmationId = React.useId();

  const isConfirmationValid = confirmName === organization.name;

  const handleDialogOpenChange = (open: boolean) => {
    if (isDeleting) return;
    setIsDeleteDialogOpen(open);
    if (!open) {
      setConfirmName("");
      setHeld(null);
      setStoreRefusal(null);
      return;
    }
    // SAY WHAT IS IN HERE BEFORE ANYBODY DECIDES ANYTHING.
    setIsCounting(true);
    void organizationStoreContents(organization.id)
      .then(setHeld)
      .finally(() => setIsCounting(false));
  };

  // Handle organization deletion
  const handleDeleteOrganization = async () => {
    if (!isConfirmationValid) {
      toast.error("Please type the organization name correctly");
      return;
    }

    setIsDeleting(true);
    setStoreRefusal(null);

    try {
      // FIRST, THE SUPPORTED PATH. The store's own door retires everything this
      // organization holds — one undoable operation per table — and then lets go
      // of whatever the retention rule no longer protects. When something is
      // still inside its undo window the door says so, with the date, and we
      // stop there: destroying it would throw away an undo somebody was
      // promised, and nothing is lost by waiting.
      const cleared = await clearOrganizationStore(organization.id, confirmName);
      if (!cleared.isEmpty) {
        setStoreRefusal(cleared.sentence);
        toast.error(cleared.sentence);
        return;
      }

      const result = await deleteOrganization(organization.id);

      if (result.success) {
        toast.success("Organization deleted successfully");
        setIsDeleteDialogOpen(false);

        // Redirect to organizations list
        router.push("/organizations");
      } else {
        setStoreRefusal(result.error ?? null);
        toast.error(result.error || "Failed to delete organization");
      }
    } catch (error: unknown) {
      console.error("Error deleting organization:", error);
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      setStoreRefusal(message);
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
          <li>• Shared resources become personal</li>
          <li>• Pending invitations are cancelled</li>
        </ul>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={handleDialogOpenChange}
      >
        <AlertDialogContent
          className="max-w-lg"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            confirmInputRef.current?.focus();
          }}
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleDeleteOrganization();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertTriangle className="h-5 w-5" />
                Delete Organization?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p>
                    This action will permanently delete{" "}
                    <strong>{organization.name}</strong> and all of its data.
                    This cannot be undone.
                  </p>

                  {/* WHAT IT HOLDS, IN ITS OWN WORDS — read from the store
                      before anybody decides anything, so a person is never
                      shown a foreign key after the fact. */}
                  {isCounting && (
                    <p className="text-sm text-muted-foreground">
                      Checking what this organization holds…
                    </p>
                  )}
                  {held && (
                    <p
                      data-testid="organization-holds"
                      className="text-sm text-foreground"
                    >
                      {held.sentence}
                    </p>
                  )}

                  {/* AND WHAT THE STORE SAID WHEN IT COULD NOT LET GO. */}
                  {storeRefusal && (
                    <p
                      data-testid="organization-delete-refusal"
                      className="text-sm text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded p-3"
                    >
                      {storeRefusal}
                    </p>
                  )}

                  <div className="space-y-2">
                    <Label
                      htmlFor={`${confirmationId}-name`}
                      className="text-foreground"
                    >
                      Type <strong>{organization.name}</strong> to confirm:
                    </Label>
                    <Input
                      ref={confirmInputRef}
                      id={`${confirmationId}-name`}
                      aria-invalid={
                        Boolean(confirmName) && !isConfirmationValid
                      }
                      aria-describedby={
                        confirmName && !isConfirmationValid
                          ? `${confirmationId}-error`
                          : undefined
                      }
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={organization.name}
                      className={
                        confirmName && !isConfirmationValid
                          ? "border-red-500"
                          : ""
                      }
                      disabled={isDeleting}
                      autoComplete="off"
                    />
                    {confirmName && !isConfirmationValid && (
                      <p
                        id={`${confirmationId}-error`}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        The name doesn't match. Please type it exactly.
                      </p>
                    )}
                  </div>

                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
                    <p className="flex items-center gap-1.5 text-sm text-red-800 dark:text-red-200 font-medium">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      This will permanently delete:
                    </p>
                    <ul className="text-sm text-red-700 dark:text-red-300 mt-2 space-y-1 list-disc list-inside">
                      <li>Organization settings and data</li>
                      <li>All member associations</li>
                      <li>All pending invitations</li>
                      <li>Shared resource permissions</li>
                    </ul>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                type="submit"
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
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
