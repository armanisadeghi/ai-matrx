"use client";

import { useEffect, useRef, useState } from "react";
import {
  Download,
  FileArchive,
  Loader2,
  RotateCcw,
  ShieldAlert,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { createClient } from "@/utils/supabase/client";

import type { VaultItem } from "../types";
import {
  confirmVaultPasswordIdentity,
  getVaultExportActor,
  VaultIdentityConfirmationError,
  type VaultVerifiedExportActor,
} from "../vault-service";
import {
  clearRestoreRunForContext,
  clearStoredRestoreRun,
  downloadVaultBackup,
  previewVaultBackup,
  previewVaultBackupRestore,
  readBackupFile,
  restoreRunForPreview,
  restoreVaultBackup,
  startNewRestoreRun,
  VaultBackupTransportError,
  type VaultBackupDownloadPreview,
  type VaultBackupOmission,
  type VaultBackupRestorePreview,
  type VaultBackupRestoreResult,
} from "../vault-backup-service";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { asClause } from "@/lib/text/asClause";

const BACKUP_FILENAME = "matrx-vault-backup.matrxvault";

function sameActor(
  left: VaultVerifiedExportActor,
  right: VaultVerifiedExportActor,
): boolean {
  return (
    left.userId === right.userId && left.organizationId === right.organizationId
  );
}

function omissionText(omission: VaultBackupOmission): string {
  const name = omission.component.replaceAll("_", " ");
  const count =
    omission.count === null ? "an unknown number of" : omission.count;
  return `${count} ${name} component${omission.count === 1 ? "" : "s"}: ${omission.reason.replaceAll("_", " ")}`;
}

function Summary({
  value,
}: {
  value: VaultBackupDownloadPreview | VaultBackupRestorePreview;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-4">
      <p>
        <strong>{value.record_count}</strong>
        <br />
        <span className="text-muted-foreground">credentials</span>
      </p>
      <p>
        <strong>{value.field_count}</strong>
        <br />
        <span className="text-muted-foreground">protected fields</span>
      </p>
      <p>
        <strong>{value.attachment_count}</strong>
        <br />
        <span className="text-muted-foreground">files</span>
      </p>
      <p>
        <strong>{value.attachment_bytes.toLocaleString()}</strong>
        <br />
        <span className="text-muted-foreground">file bytes</span>
      </p>
    </div>
  );
}

function Omissions({
  omissions,
  checked,
  onCheckedChange,
}: {
  omissions: VaultBackupOmission[];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  if (omissions.length === 0) return null;
  return (
    <section
      className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
      aria-labelledby="backup-omissions-title"
    >
      <h3 id="backup-omissions-title" className="text-sm font-semibold">
        This first backup version leaves some Vault data out
      </h3>
      <ul className="max-h-32 list-disc space-y-1 overflow-y-auto pl-5 text-xs text-muted-foreground">
        {omissions.map((omission, index) => (
          <li
            key={`${omission.component}-${omission.source_item_id ?? "all"}-${index}`}
          >
            {omissionText(omission)}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Keep the original Vault until later backup versions cover history,
        protected credentials, organization data, sharing, favorites, and
        collections.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-label="Accept listed backup omissions"
        />
        <span>
          I reviewed these omissions and want to continue with the included
          credentials.
        </span>
      </label>
    </section>
  );
}

export function VaultBackupDialog({
  open,
  onOpenChange,
  items,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: VaultItem[];
  onRestored: () => void | Promise<void>;
}) {
  const organizationId = useAppSelector(selectOrganizationId);
  const { organizationState } = useOrganizationRequired();
  const [mode, setMode] = useState<"download" | "restore">("download");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadPreview, setDownloadPreview] =
    useState<VaultBackupDownloadPreview | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] =
    useState<VaultBackupRestorePreview | null>(null);
  const [restoreRunId, setRestoreRunId] = useState<string | null>(null);
  const [restoreResult, setRestoreResult] =
    useState<VaultBackupRestoreResult | null>(null);
  const [omissionsAccepted, setOmissionsAccepted] = useState(false);
  const [newRunAccepted, setNewRunAccepted] = useState(false);
  const [identityConfirmation, setIdentityConfirmation] =
    useState<VaultVerifiedExportActor | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backupPassphrase = useRef<HTMLInputElement | null>(null);
  const accountPassword = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const expectedActor = useRef<VaultVerifiedExportActor | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  const cancelPending = () => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
  };
  const beginOperation = () => {
    cancelPending();
    const operation = generation.current;
    const request = new AbortController();
    controller.current = request;
    return { operation, request };
  };
  const isCurrent = (operation: number) =>
    mounted.current && generation.current === operation;
  const clearPassphrases = () => {
    if (backupPassphrase.current) backupPassphrase.current.value = "";
    if (accountPassword.current) accountPassword.current.value = "";
  };
  const clear = () => {
    cancelPending();
    clearPassphrases();
    expectedActor.current = null;
    if (fileInput.current) fileInput.current.value = "";
    setSelectedIds(new Set());
    setDownloadPreview(null);
    setRestoreFile(null);
    setRestorePreview(null);
    setRestoreRunId(null);
    setRestoreResult(null);
    setOmissionsAccepted(false);
    setNewRunAccepted(false);
    setIdentityConfirmation(null);
    setRunning(false);
    setError(null);
    setMode("download");
  };
  const close = () => {
    clear();
    onOpenChange(false);
  };
  const invalidate = (message: string) => {
    clearStoredRestoreRun();
    clear();
    setError(message);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelPending();
      clearPassphrases();
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const { data } = createClient().auth.onAuthStateChange(
      (_event, session) => {
        const actor = expectedActor.current;
        if (actor && (!session?.user || session.user.id !== actor.userId))
          invalidate(
            "Your account changed. Start again from the current Vault.",
          );
      },
    );
    return () => data.subscription.unsubscribe();
  }, [open]);
  useEffect(() => {
    const actor = expectedActor.current;
    if (actor && actor.organizationId !== organizationId)
      invalidate(
        "Your request organization changed. Start again from the current Vault.",
      );
  }, [organizationId]);

  const handleError = (cause: unknown) => {
    clearPassphrases();
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    if (cause instanceof VaultBackupTransportError) {
      if (cause.code === "recent_auth_required" && expectedActor.current) {
        setIdentityConfirmation(expectedActor.current);
        setError(null);
        return;
      }
      if (cause.code === "context_changed") {
        invalidate(cause.message);
        return;
      }
      if (cause.code === "preview_changed") {
        setDownloadPreview(null);
        setRestorePreview(null);
        setRestoreResult(null);
      }
      setError(cause.message);
      return;
    }
    setError(
      "Vault backup could not be completed. Retry from the current Vault.",
    );
  };

  const reviewDownload = async () => {
    if (selectedIds.size === 0) {
      setError("Select one or more loaded personal credentials.");
      return;
    }
    const { operation, request } = beginOperation();
    setRunning(true);
    setError(null);
    try {
      const actor = await getVaultExportActor();
      if (!isCurrent(operation)) return;
      expectedActor.current = actor;
      clearRestoreRunForContext(actor);
      const preview = await previewVaultBackup(
        [...selectedIds],
        actor,
        request.signal,
      );
      if (isCurrent(operation) && !request.signal.aborted) {
        setDownloadPreview(preview);
        setOmissionsAccepted(false);
      }
    } catch (cause) {
      if (isCurrent(operation)) handleError(cause);
    } finally {
      if (controller.current === request) controller.current = null;
      if (isCurrent(operation)) setRunning(false);
    }
  };

  const download = async () => {
    const actor = expectedActor.current;
    const passphrase = backupPassphrase.current?.value ?? "";
    clearPassphrases();
    if (!actor || !downloadPreview) return;
    if (!passphrase) {
      setError(
        "Enter a backup passphrase. You will need it to restore this file.",
      );
      return;
    }
    if (downloadPreview.omissions.length > 0 && !omissionsAccepted) {
      setError("Review and accept the listed omissions before downloading.");
      return;
    }
    const { operation, request } = beginOperation();
    setRunning(true);
    setError(null);
    try {
      const blob = await downloadVaultBackup(
        {
          item_ids: [...selectedIds],
          revision: downloadPreview.revision,
          passphrase,
          accept_omissions: omissionsAccepted,
        },
        actor,
        request.signal,
      );
      const actual = await getVaultExportActor();
      if (
        !isCurrent(operation) ||
        request.signal.aborted ||
        !sameActor(actual, actor)
      )
        throw new VaultBackupTransportError("context_changed");
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = BACKUP_FILENAME;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      close();
    } catch (cause) {
      if (isCurrent(operation)) handleError(cause);
    } finally {
      if (controller.current === request) controller.current = null;
      if (isCurrent(operation)) setRunning(false);
    }
  };

  const reviewRestore = async () => {
    const file = restoreFile;
    const passphrase = backupPassphrase.current?.value ?? "";
    clearPassphrases();
    if (!file) {
      setError("Choose a .matrxvault backup file.");
      return;
    }
    if (!passphrase) {
      setError("Enter the passphrase used to create this backup.");
      return;
    }
    const { operation, request } = beginOperation();
    setRunning(true);
    setError(null);
    try {
      const actor = await getVaultExportActor();
      if (!isCurrent(operation)) return;
      expectedActor.current = actor;
      clearRestoreRunForContext(actor);
      const encoded = await readBackupFile(file, request.signal);
      const preview = await previewVaultBackupRestore(
        encoded,
        passphrase,
        actor,
        request.signal,
      );
      if (
        preview.actor_id !== actor.userId ||
        preview.organization_id !== actor.organizationId
      )
        throw new VaultBackupTransportError("context_changed");
      if (isCurrent(operation) && !request.signal.aborted) {
        setRestorePreview(preview);
        setRestoreRunId(restoreRunForPreview(preview));
        setRestoreResult(null);
        setOmissionsAccepted(false);
        setNewRunAccepted(false);
      }
    } catch (cause) {
      if (isCurrent(operation)) handleError(cause);
    } finally {
      if (controller.current === request) controller.current = null;
      if (isCurrent(operation)) setRunning(false);
    }
  };

  const restore = async () => {
    const actor = expectedActor.current;
    const file = restoreFile;
    const preview = restorePreview;
    const runId = restoreRunId;
    const passphrase = backupPassphrase.current?.value ?? "";
    clearPassphrases();
    if (!actor || !file || !preview || !runId) return;
    if (!passphrase) {
      setError("Re-enter the backup passphrase to restore these credentials.");
      return;
    }
    if (preview.omissions.length > 0 && !omissionsAccepted) {
      setError("Review and accept the listed omissions before restoring.");
      return;
    }
    const { operation, request } = beginOperation();
    setRunning(true);
    setError(null);
    try {
      const encoded = await readBackupFile(file, request.signal);
      const result = await restoreVaultBackup(
        {
          envelope_base64: encoded,
          passphrase,
          expected_digest: preview.envelope_digest,
          preview_actor_id: preview.actor_id,
          preview_organization_id: preview.organization_id,
          restore_run_id: runId,
          accept_omissions: omissionsAccepted,
        },
        actor,
        request.signal,
      );
      const actual = await getVaultExportActor();
      if (
        !isCurrent(operation) ||
        request.signal.aborted ||
        !sameActor(actual, actor)
      )
        throw new VaultBackupTransportError("context_changed");
      setRestoreResult(result);
      if (result.created + result.replayed > 0) await onRestored();
    } catch (cause) {
      if (isCurrent(operation)) handleError(cause);
    } finally {
      if (controller.current === request) controller.current = null;
      if (isCurrent(operation)) setRunning(false);
    }
  };

  const confirmIdentity = async () => {
    const actor = identityConfirmation;
    const password = accountPassword.current?.value ?? "";
    clearPassphrases();
    if (!actor || !password) {
      setError("Enter your current Matrx password to confirm your identity.");
      return;
    }
    const { operation } = beginOperation();
    setRunning(true);
    setError(null);
    try {
      const actual = await confirmVaultPasswordIdentity(
        actor,
        password,
        getVaultExportActor,
      );
      if (!isCurrent(operation)) return;
      expectedActor.current = actual;
      setIdentityConfirmation(null);
    } catch (cause) {
      if (!isCurrent(operation)) return;
      if (
        cause instanceof VaultIdentityConfirmationError &&
        cause.code === "credentials_rejected"
      )
        setError("That password could not confirm your identity. Try again.");
      else
        invalidate(
          "Your identity or request organization changed. Start again from the current Vault.",
        );
    } finally {
      clearPassphrases();
      if (isCurrent(operation)) setRunning(false);
    }
  };

  const switchMode = (next: "download" | "restore") => {
    cancelPending();
    clearPassphrases();
    setMode(next);
    setError(null);
    setIdentityConfirmation(null);
    setDownloadPreview(null);
    setRestorePreview(null);
    setRestoreResult(null);
    setOmissionsAccepted(false);
  };
  const retryable = (restoreResult?.retryable_failure ?? 0) > 0;

  if (organizationState !== "ready") {
    return (
      <Credenza
        open={open}
        onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      >
        <CredenzaContent className="max-h-[92dvh] overflow-hidden md:max-w-3xl">
          <CredenzaHeader>
            <CredenzaTitle>Encrypted Vault backup</CredenzaTitle>
          </CredenzaHeader>
          <CredenzaBody className="overflow-y-auto px-4 pb-6 md:px-0">
            <OrganizationContextNotice
              state={organizationState}
              what="Vault backups"
              compact
            />
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>
    );
  }

  return (
    <Credenza
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <CredenzaContent className="max-h-[92dvh] overflow-hidden md:max-w-3xl">
        <CredenzaHeader>
          <CredenzaTitle>Encrypted Vault backup</CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="space-y-4 overflow-y-auto px-4 pb-6 md:px-0">
          <div
            className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1"
            role="tablist"
            aria-label="Backup action"
          >
            <Button
              type="button"
              variant={mode === "download" ? "secondary" : "ghost"}
              role="tab"
              aria-selected={mode === "download"}
              onClick={() => switchMode("download")}
            >
              Download backup
            </Button>
            <Button
              type="button"
              variant={mode === "restore" ? "secondary" : "ghost"}
              role="tab"
              aria-selected={mode === "restore"}
              onClick={() => switchMode("restore")}
            >
              Restore backup
            </Button>
          </div>

          {identityConfirmation ? (
            <section className="space-y-3">
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Confirm your Matrx account before retrying. This password is
                  separate from the backup passphrase.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vault-backup-account">Current account</Label>
                <Input
                  id="vault-backup-account"
                  value={identityConfirmation.email}
                  readOnly
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vault-backup-account-password">
                  Current Matrx password
                </Label>
                <Input
                  ref={accountPassword}
                  id="vault-backup-account-password"
                  type="password"
                  autoComplete="current-password"
                />
              </div>
              <Button onClick={() => void confirmIdentity()} disabled={running}>
                {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm identity
              </Button>
            </section>
          ) : mode === "download" ? (
            <section className="space-y-4" role="tabpanel">
              <p className="text-sm text-muted-foreground">
                Select from the personal credentials currently loaded below. The
                encrypted file includes current ordinary fields and files. It
                excludes history, protected credentials, organization data,
                sharing, favorites, and collections.
              </p>
              <fieldset className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                <legend className="px-1 text-sm font-medium">
                  Personal credentials
                </legend>
                {items.length === 0 ? (
                  <p className="p-2 text-sm text-muted-foreground">
                    No personal credentials are loaded.
                  </p>
                ) : (
                  items.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`backup-item-${item.id}`}
                        checked={selectedIds.has(item.id)}
                        onCheckedChange={(value) => {
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            value === true
                              ? next.add(item.id)
                              : next.delete(item.id);
                            return next;
                          });
                          setDownloadPreview(null);
                          setOmissionsAccepted(false);
                          setError(null);
                        }}
                      />
                      <span className="min-w-0 truncate">
                        {item.display_name}
                      </span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                        {item.status === "active" ? "Active" : `Excluded: ${item.status}`}
                      </span>
                    </label>
                  ))
                )}
              </fieldset>
              {!downloadPreview ? (
                <Button
                  onClick={() => void reviewDownload()}
                  disabled={running || items.length === 0}
                >
                  {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Review selected backup
                </Button>
              ) : (
                <>
                  <Summary value={downloadPreview} />
                  <Omissions
                    omissions={downloadPreview.omissions}
                    checked={omissionsAccepted}
                    onCheckedChange={setOmissionsAccepted}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="vault-backup-passphrase">
                      New backup passphrase
                    </Label>
                    <Input
                      ref={backupPassphrase}
                      id="vault-backup-passphrase"
                      type="password"
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-muted-foreground">
                      This passphrase encrypts the downloaded file. Matrx does
                      not save it and cannot recover it.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => void download()}
                      disabled={
                        running ||
                        (downloadPreview.omissions.length > 0 &&
                          !omissionsAccepted)
                      }
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Encrypt and download
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDownloadPreview(null);
                        setOmissionsAccepted(false);
                      }}
                    >
                      Change selection
                    </Button>
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="space-y-4" role="tabpanel">
              <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                <FileArchive className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Restored credentials are created in your personal Vault
                  disabled and restricted. Review them before enabling or
                  sharing anything.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vault-backup-file">Encrypted backup file</Label>
                <Input
                  ref={fileInput}
                  id="vault-backup-file"
                  type="file"
                  accept=".matrxvault,application/octet-stream"
                  onChange={(event) => {
                    setRestoreFile(event.target.files?.[0] ?? null);
                    setRestorePreview(null);
                    setRestoreResult(null);
                    setError(null);
                  }}
                />
              </div>
              {!restorePreview ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="vault-restore-passphrase">
                      Backup passphrase
                    </Label>
                    <Input
                      ref={backupPassphrase}
                      id="vault-restore-passphrase"
                      type="password"
                      autoComplete="off"
                    />
                  </div>
                  <Button
                    onClick={() => void reviewRestore()}
                    disabled={running || !restoreFile}
                  >
                    {running && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    <Upload className="mr-2 h-4 w-4" />
                    Review restore
                  </Button>
                </>
              ) : (
                <>
                  <Summary value={restorePreview} />
                  <Omissions
                    omissions={restorePreview.omissions}
                    checked={omissionsAccepted}
                    onCheckedChange={setOmissionsAccepted}
                  />
                  {restoreResult && (
                    <section
                      className="space-y-2 rounded-lg border border-border p-3"
                      aria-live="polite"
                    >
                      <h3 className="text-sm font-semibold">Restore result</h3>
                      <p className="text-sm">
                        Created {restoreResult.created}; replayed{" "}
                        {restoreResult.replayed}; refused{" "}
                        {restoreResult.refused}; retryable{" "}
                        {asClause(restoreResult.retryable_failure)}.
                      </p>
                      <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                        {restoreResult.results.map((entry, index) => (
                          <li key={entry.source_item_id}>
                            Credential {index + 1}:{" "}
                            {entry.status.replaceAll("_", " ")}
                            {entry.reason === "alias_conflict" && (
                              <p>
                                An environment alias from this backup is already in use.
                                Existing credentials were unchanged. Rename or remove
                                the conflicting alias, then retry.
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="vault-restore-confirm-passphrase">
                      Re-enter backup passphrase
                    </Label>
                    <Input
                      ref={backupPassphrase}
                      id="vault-restore-confirm-passphrase"
                      type="password"
                      autoComplete="off"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => void restore()}
                      disabled={
                        running ||
                        (restorePreview.omissions.length > 0 &&
                          !omissionsAccepted)
                      }
                    >
                      {running && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {retryable
                        ? "Retry same restore run"
                        : "Restore credentials"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRestorePreview(null);
                        setRestoreResult(null);
                        setOmissionsAccepted(false);
                      }}
                    >
                      Choose another file
                    </Button>
                  </div>
                  {restoreResult && !retryable && (
                    <div className="space-y-2 rounded-lg border border-destructive/30 p-3">
                      <label className="flex items-start gap-2 text-sm">
                        <Checkbox
                          checked={newRunAccepted}
                          onCheckedChange={(value) =>
                            setNewRunAccepted(value === true)
                          }
                        />
                        <span>
                          I understand that a new restore run creates another
                          copy of every accepted credential.
                        </span>
                      </label>
                      <Button
                        variant="destructive"
                        disabled={!newRunAccepted}
                        onClick={() => {
                          setRestoreRunId(startNewRestoreRun(restorePreview));
                          setRestoreResult(null);
                          setNewRunAccepted(false);
                          setError(null);
                        }}
                      >
                        Start a new restore run
                      </Button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {error && (
            <ErrorNotice size="inline" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" message={error} />
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
