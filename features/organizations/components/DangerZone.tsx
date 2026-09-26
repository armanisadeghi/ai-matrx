"use client";

import React, { useRef, useState } from "react";
import { Archive, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@ai-matrx/design-system";
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
import { archiveOrganization } from "../service/organizationArchive";
import {
  organizationStoreContents,
  type OrganizationStoreContents,
} from "../service/organizationStoreContents";
import type { Organization } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface DangerZoneProps {
  organization: Organization;
}

/**
 * DangerZone — ARCHIVE ORGANIZATION.
 *
 * THE OWNER'S RULING, 2026-09-20: "We certainly would not delete organizations
 * directly. It's absolutely an archive and we would store it for much more than
 * 30 days just in case."
 *
 * So this screen no longer offers a delete. It offers the one supported act and
 * says, in plain words, exactly what that act does and does not do — nothing is
 * deleted, members lose access, an owner can restore it at any time — before
 * anybody types anything. The name is still typed back, because closing a
 * workspace for every one of its members is not a click you make by accident.
 *
 * The refusals and the confirmations are the DOOR'S OWN SENTENCES
 * (`iam.organization_archive`), never rewritten here and never a constraint
 * name.
 */
export function DangerZone({ organization }: DangerZoneProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [reason, setReason] = useState("");
  const [isArchiving, setIsArchiving] = useState(false);
  // WHAT THIS ORGANIZATION HOLDS, read from the store's own door the moment the
  // dialog opens. `null` while we are still asking, and when the store is
  // switched off for this organization — there is then nothing of this kind to
  // say, and a screen never invents a sentence it cannot stand behind.
  const [held, setHeld] = useState<OrganizationStoreContents | null>(null);
  const [isCounting, setIsCounting] = useState(false);
  // What the door said when it refused. Never a foreign key, never a code.
  const [refusal, setRefusal] = useState<string | null>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const confirmationId = React.useId();

  const isConfirmationValid = confirmName === organization.name;

  const handleDialogOpenChange = (open: boolean) => {
    if (isArchiving) return;
    setIsDialogOpen(open);
    if (!open) {
      setConfirmName("");
      setReason("");
      setHeld(null);
      setRefusal(null);
      return;
    }
    // SAY WHAT IS IN HERE BEFORE ANYBODY DECIDES ANYTHING.
    setIsCounting(true);
    void organizationStoreContents(organization.id)
      .then(setHeld)
      .finally(() => setIsCounting(false));
  };

  const handleArchive = async () => {
    if (!isConfirmationValid) {
      toast.error("Please type the organization name correctly");
      return;
    }
    setIsArchiving(true);
    setRefusal(null);
    try {
      const outcome = await archiveOrganization(
        organization.id,
        confirmName,
        reason,
      );
      toast.success(outcome.sentence || `${organization.name} is archived.`);
      setIsDialogOpen(false);
      router.push("/organizations");
      router.refresh();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "An unexpected error occurred";
      setRefusal(message);
      toast.error(message);
    } finally {
      setIsArchiving(false);
    }
  };

  if (organization.isPersonal) {
    return (
      <div className="border border-border rounded-lg p-4">
        <h3 className="font-medium">Archive Organization</h3>
        <p className="text-sm text-muted-foreground mt-1">
          This is your personal workspace, so it cannot be archived — it is where
          your own work lives.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-amber-200 dark:border-amber-900 rounded-lg p-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-medium text-amber-900 dark:text-amber-100">
              Archive Organization
            </h3>
            <p className="text-sm text-muted-foreground">
              Close this organization. Nothing is deleted, and you can restore it
              at any time.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDialogOpen(true)}
          >
            <Archive className="h-4 w-4 mr-1" />
            Archive
          </Button>
        </div>

        <ul className="text-xs text-muted-foreground space-y-0.5 border-t pt-3">
          <li>• Every member loses access immediately</li>
          <li>• Agents, schedules and automations stop running</li>
          <li>• Everything inside it is kept exactly as it is</li>
          <li>• An owner can restore it later — there is no time limit</li>
        </ul>
      </div>

      <AlertDialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
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
              void handleArchive();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Archive className="h-5 w-5" />
                Archive {organization.name}?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4">
                  <p>
                    Archiving closes <strong>{organization.name}</strong> for
                    everyone. Nothing is deleted.
                  </p>

                  {/* WHAT IT HOLDS, IN ITS OWN WORDS — read from the store
                      before anybody decides anything. */}
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

                  {refusal && (
                    <p
                      data-testid="organization-archive-refusal"
                      className="text-sm text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded p-3"
                    >
                      {refusal}
                      <ErrorAlchemyMenu error={refusal} />
                    </p>
                  )}

                  <div className="p-3 bg-muted/50 border border-border rounded space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      What happens
                    </p>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Members cannot open it or see anything inside it</li>
                      <li>
                        Agents, schedules, pipelines and digests bound to it stop
                        running
                      </li>
                      <li>
                        Every record, file and conversation stays exactly where
                        it is
                      </li>
                      <li>
                        An owner can restore it at any time and everyone gets
                        their access back
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor={`${confirmationId}-reason`}
                      className="text-foreground"
                    >
                      Why are you archiving it? (optional)
                    </Label>
                    <Textarea
                      id={`${confirmationId}-reason`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Shown on the archived organization's page"
                      rows={2}
                      disabled={isArchiving}
                    />
                  </div>

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
                      aria-invalid={Boolean(confirmName) && !isConfirmationValid}
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
                      disabled={isArchiving}
                      autoComplete="off"
                    />
                    {confirmName && !isConfirmationValid && (
                      <p
                        id={`${confirmationId}-error`}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        The name doesn&apos;t match. Please type it exactly.
                      </p>
                    )}
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={isArchiving}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                type="submit"
                disabled={!isConfirmationValid || isArchiving}
              >
                {isArchiving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Archiving…
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4 mr-2" />
                    Archive organization
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
