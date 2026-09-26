"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { createClient } from "@/utils/supabase/client";
import {
  confirmVaultPasswordIdentity,
  getVaultExportActor,
  restoreVaultItem,
  VaultRestoreTransportError,
  VaultIdentityConfirmationError,
  type VaultRestoreResult,
  type VaultVerifiedExportActor,
} from "@/features/secrets/vault-service";
import type { TrashItem, VaultRecoveryPreview } from "./service";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

function sameActor(
  left: VaultVerifiedExportActor,
  right: VaultVerifiedExportActor,
): boolean {
  return (
    left.userId === right.userId && left.organizationId === right.organizationId
  );
}

function refusalText(reason: string | null): string {
  if (reason === "recovery_tracking_unavailable") {
    return "This credential was deleted before recovery tracking began. Automatic recovery is unavailable, and its retained recovery data is preserved.";
  }
  if (reason === "recovery_manifest_unsupported") {
    return "This credential’s recovery manifest cannot be restored automatically yet. Its retained recovery data is preserved.";
  }
  if (reason === "protected_component_requires_native_recovery") {
    return "This credential contains protected material that cannot be restored automatically yet. Its retained recovery data is preserved.";
  }
  if (reason === "linked_component_requires_native_recovery") {
    return "This credential is linked to a provider or integration and cannot be restored automatically yet. Its retained recovery data is preserved.";
  }
  if (reason === "native_recovery_unavailable") {
    return "Native passkey recovery is temporarily unavailable. Reload Trash and try again; its retained recovery data is preserved.";
  }
  if (reason === "native_components_missing") {
    return "The passkey recovery components are no longer complete. This credential was not changed; reload Trash and review it again.";
  }
  if (reason === "native_components_conflict") {
    return "The passkey recovery components no longer match this credential. This credential was not changed; reload Trash and review it again.";
  }
  if (reason === "native_manifest_invalid") {
    return "This passkey recovery record is invalid. This credential was not changed; reload Trash and review it again.";
  }
  return "This credential cannot be recovered automatically. Its retained recovery data is preserved.";
}

export function VaultTrashRestoreDialog({
  item,
  preview,
  actor,
  open,
  onOpenChange,
  onRestored,
}: {
  item: TrashItem | null;
  preview: VaultRecoveryPreview | null;
  actor: VaultVerifiedExportActor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestored: (item: TrashItem, result: VaultRestoreResult) => void;
}) {
  const organizationId = useAppSelector(selectOrganizationId);
  const passwordInput = useRef<HTMLInputElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const expectedActor = useRef<VaultVerifiedExportActor | null>(actor);
  const [restoreActor, setRestoreActor] =
    useState<VaultVerifiedExportActor | null>(actor);
  const [identityConfirmation, setIdentityConfirmation] =
    useState<VaultVerifiedExportActor | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = () => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  };
  const clear = () => {
    cancel();
    expectedActor.current = null;
    setRestoreActor(null);
    passwordInput.current && (passwordInput.current.value = "");
    setIdentityConfirmation(null);
    setRunning(false);
    setError(null);
  };
  const close = () => {
    clear();
    onOpenChange(false);
  };
  const invalidate = (message: string) => {
    cancel();
    expectedActor.current = null;
    setRestoreActor(null);
    passwordInput.current && (passwordInput.current.value = "");
    setIdentityConfirmation(null);
    setRunning(false);
    setError(message);
  };
  const begin = () => {
    cancel();
    const operation = generation.current;
    const request = new AbortController();
    controller.current = request;
    return { operation, request };
  };
  const isCurrent = (operation: number) =>
    mounted.current && generation.current === operation;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancel();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const { data } = createClient().auth.onAuthStateChange(
      (_event, session) => {
        const actor = expectedActor.current;
        if (actor && (!session?.user || session.user.id !== actor.userId)) {
          invalidate(
            "Your account changed. Review this credential again before restoring it.",
          );
        }
      },
    );
    return () => data.subscription.unsubscribe();
  }, [open]);

  useEffect(() => {
    const actor = expectedActor.current;
    if (actor && actor.organizationId !== organizationId) {
      invalidate(
        "Your request organization changed. Review this credential again before restoring it.",
      );
    }
  }, [organizationId]);

  const restore = async () => {
    if (!item || !preview?.deletion_id) return;
    const { operation, request } = begin();
    setRunning(true);
    setError(null);
    try {
      const actor = expectedActor.current;
      if (!actor) {
        setError(
          "Your current account is still being verified. Try again in a moment.",
        );
        return;
      }
      if (!isCurrent(operation)) return;
      expectedActor.current = actor;
      const result = await restoreVaultItem(
        item.id,
        preview.deletion_id,
        actor,
        request.signal,
      );
      const actual = await getVaultExportActor();
      if (
        !isCurrent(operation) ||
        request.signal.aborted ||
        !sameActor(actual, actor)
      ) {
        throw new VaultRestoreTransportError("context_changed");
      }
      onRestored(item, result);
      close();
    } catch (cause) {
      if (
        !isCurrent(operation) ||
        (cause instanceof DOMException && cause.name === "AbortError")
      )
        return;
      if (cause instanceof VaultRestoreTransportError) {
        if (cause.code === "recent_auth_required") {
          setIdentityConfirmation(expectedActor.current);
          setError(null);
        } else if (cause.code === "context_changed") {
          invalidate(cause.message);
        } else {
          setError(cause.message);
        }
      } else {
        setError(
          "Recovery could not be completed. Retry this same recovery record.",
        );
      }
    } finally {
      if (controller.current === request) controller.current = null;
      if (isCurrent(operation)) setRunning(false);
    }
  };

  const confirmIdentity = async () => {
    const actor = identityConfirmation;
    const password = passwordInput.current?.value ?? "";
    passwordInput.current && (passwordInput.current.value = "");
    if (!actor || !password) {
      setError("Enter your current Matrx password to confirm your identity.");
      return;
    }
    const { operation } = begin();
    setRunning(true);
    setError(null);
    try {
      const actual = await confirmVaultPasswordIdentity(actor, password);
      if (!isCurrent(operation)) return;
      expectedActor.current = actual;
      setRestoreActor(actual);
      setIdentityConfirmation(null);
    } catch (cause) {
      if (!isCurrent(operation)) return;
      if (cause instanceof VaultIdentityConfirmationError) {
        if (cause.code === "credentials_rejected") {
          setError("That password could not confirm your identity. Try again.");
        } else if (cause.code === "context_changed") {
          invalidate(
            "Your account or request organization changed. Review this credential again before restoring it.",
          );
        } else {
          invalidate(
            "We could not verify your identity. Review this credential again before restoring it.",
          );
        }
      } else {
        invalidate(
          "We could not verify your identity. Review this credential again before restoring it.",
        );
      }
    } finally {
      passwordInput.current && (passwordInput.current.value = "");
      if (isCurrent(operation)) setRunning(false);
    }
  };

  if (!item || !preview) return null;
  const supported = preview.supported && Boolean(preview.deletion_id);
  return (
    <Credenza
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <CredenzaContent className="md:max-w-lg">
        <CredenzaHeader>
          <CredenzaTitle>Restore credential</CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="space-y-4 px-4 pb-6 md:px-0">
          {identityConfirmation ? (
            <section className="space-y-3">
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Confirm your identity before restoring this credential.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vault-restore-email">Current account</Label>
                <Input
                  id="vault-restore-email"
                  value={identityConfirmation.email}
                  readOnly
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vault-restore-password">
                  Current Matrx password
                </Label>
                <Input
                  ref={passwordInput}
                  id="vault-restore-password"
                  type="password"
                  autoComplete="current-password"
                  disabled={running}
                />
              </div>
              {error && (
                <ErrorNotice size="inline" className="text-sm" message={error} />
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void confirmIdentity()}
                  disabled={running}
                >
                  {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm identity
                </Button>
              </div>
            </section>
          ) : supported ? (
            <section className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Restore{" "}
                <span className="font-medium text-foreground">
                  {item.title || "this credential"}
                </span>{" "}
                with {preview.native_passkeys_count === 1 && "1 passkey, "}
                {preview.fields_count} field
                {preview.fields_count === 1 ? "" : "s"} and{" "}
                {preview.attachments_count} attachment
                {preview.attachments_count === 1 ? "" : "s"}.
              </p>
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Recovery keeps this credential disabled. Restored fields stay
                  inactive; sharing, browser fill, authenticator use, sandbox
                  injection, agent and integration use stay off. Reenable each
                  capability deliberately after recovery.
                </p>
              </div>
              {preview.native_passkeys_count === 1 && (
                <p className="text-sm text-muted-foreground">
                  Restoring this passkey does not reenable it or confirm that
                  the website accepts it. Remove any website registration at
                  that website if you no longer want it there.
                </p>
              )}
              {preview.prior_was_disabled && (
                <p className="text-xs text-muted-foreground">
                  It was already disabled before deletion and will remain
                  disabled.
                </p>
              )}
              {error && (
                <ErrorNotice size="inline" className="text-sm" message={error} />
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void restore()}
                  disabled={running || !restoreActor}
                >
                  {running ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Restore disabled credential
                </Button>
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{refusalText(preview.reason)}</p>
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={close}>
                  Close
                </Button>
              </div>
            </section>
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
