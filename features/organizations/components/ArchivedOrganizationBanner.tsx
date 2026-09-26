"use client";

import React, { useEffect, useRef, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
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
import {
  organizationArchiveState,
  restoreOrganization,
  type OrganizationArchiveState,
} from "../service/organizationArchive";
import type { Organization } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface ArchivedOrganizationBannerProps {
  organization: Organization;
}

/**
 * ArchivedOrganizationBanner — AN ARCHIVED ORGANIZATION SAYS SO, HONESTLY.
 *
 * A screen never lies and never wears a dead control. On an archived
 * organization's own settings page this banner says, in one sentence, that it
 * is archived, who archived it, when, why, and that nothing was deleted — and
 * then it either offers Restore (to an owner or a super admin) or says plainly
 * who can do it. It is never a disabled-looking button with no explanation.
 *
 * Restore has no window and no expiry: `iam.organization_restore` puts the
 * organization back into `iam.my_orgs()` and every row scoped to it reappears,
 * untouched, for every member at once.
 *
 * It renders NOTHING when the organization is live, so every other page is
 * exactly as it was.
 */
export function ArchivedOrganizationBanner({
  organization,
}: ArchivedOrganizationBannerProps) {
  const router = useRouter();
  const [state, setState] = useState<OrganizationArchiveState | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const confirmationId = React.useId();

  useEffect(() => {
    let active = true;
    void organizationArchiveState(organization.id).then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, [organization.id]);

  if (!state?.archived) return null;

  const isConfirmationValid = confirmName === organization.name;

  const handleRestore = async () => {
    if (!isConfirmationValid) return;
    setIsRestoring(true);
    setRefusal(null);
    try {
      const outcome = await restoreOrganization(organization.id, confirmName);
      toast.success(outcome.sentence || `${organization.name} is open again.`);
      setIsDialogOpen(false);
      router.refresh();
      const next = await organizationArchiveState(organization.id);
      setState(next);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      setRefusal(message);
      toast.error(message);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div
      data-testid="organization-archived-banner"
      className="rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <Archive className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            This organization is archived
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {state.sentence}
          </p>
          {!state.mayRestore && (
            <p className="text-sm text-amber-800/80 dark:text-amber-200/80">
              An owner of this organization, or a super admin, can restore it.
            </p>
          )}
        </div>
      </div>
      {state.mayRestore && (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => setIsDialogOpen(true)}
        >
          Restore organization
        </Button>
      )}

      <AlertDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (isRestoring) return;
          setIsDialogOpen(open);
          if (!open) {
            setConfirmName("");
            setRefusal(null);
          }
        }}
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
              void handleRestore();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                Restore {organization.name}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p>
                    Everyone who was a member gets their access back, and every
                    agent, schedule and automation bound to this organization
                    starts running again.
                  </p>
                  {refusal && (
                    <p
                      data-testid="organization-restore-refusal"
                      className="text-sm text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded p-3"
                    >
                      {refusal}
                      <ErrorAlchemyMenu error={refusal} />
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
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={organization.name}
                      disabled={isRestoring}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={isRestoring}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={!isConfirmationValid || isRestoring}
              >
                {isRestoring ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Restoring…
                  </>
                ) : (
                  "Restore organization"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
