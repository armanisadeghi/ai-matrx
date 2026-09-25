"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, ShieldAlert } from "lucide-react";

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
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useAppSelector } from "@/lib/redux/hooks";
import { createClient } from "@/utils/supabase/client";
import {
  downloadVaultLoginCsv,
  confirmVaultPasswordIdentity,
  getVaultExportActor,
  previewVaultLoginCsv,
  VaultLoginExportTransportError,
  VaultIdentityConfirmationError,
  type VaultLoginCsvPreviewResponse,
  type VaultVerifiedExportActor,
} from "../vault-service";
import { WEBSITE_LOGIN_DEFINITION_KEY, type VaultItem } from "../types";

const DEFAULT_CSV_PROFILE = "matrx_login_csv_v1" as const;
const EXPORT_FILENAME = "matrx-login-export.csv";
const CSV_PROFILES = [
  {
    value: "matrx_login_csv_v1",
    label: "Matrx login CSV",
    detail: "A compact Matrx login export with ordinary website-login fields.",
  },
  {
    value: "nordpass_csv_v1",
    label: "NordPass CSV",
    detail:
      "Targets NordPass's documented import template and carries ordinary login fields only.",
  },
  {
    value: "google_password_manager_csv_v1",
    label: "Google Password Manager CSV",
    detail:
      "Google's CSV format has no title or notes columns. The preview lists those omissions before download.",
  },
  {
    value: "dashlane_csv_v1",
    label: "Dashlane CSV",
    detail:
      "Uses Dashlane's ordinary-login CSV template for name, URL, username, password, and note. TOTP and collections stay blank.",
  },
  {
    value: "keeper_csv_v1",
    label: "Keeper CSV",
    detail:
      "Uses Keeper's ordinary-login CSV columns for title, URL, username, password, and notes; folder, shared-folder, and custom-field columns are blank.",
  },
  {
    value: "lastpass_csv_v1",
    label: "LastPass CSV",
    detail:
      "Uses LastPass's ordinary-login CSV columns for title, URL, username, password, and notes; grouping, favorite, and TOTP use the ordinary-login defaults.",
  },
  {
    value: "firefox_csv_v1",
    label: "Firefox CSV",
    detail:
      "Uses Firefox's ordinary-login URL, username, and password columns. The preview lists any title or notes omissions before download.",
  },
  {
    value: "roboform_csv_v1",
    label: "RoboForm CSV",
    detail:
      "Uses RoboForm's documented ordinary-login template for name, URL, login, password, and note. Folder placement stays blank.",
  },
] as const;
type VaultLoginCsvProfile = (typeof CSV_PROFILES)[number]["value"];

function isVaultLoginCsvProfile(value: string): value is VaultLoginCsvProfile {
  return CSV_PROFILES.some((profile) => profile.value === value);
}

function sameActor(
  left: VaultVerifiedExportActor,
  right: VaultVerifiedExportActor,
): boolean {
  return (
    left.userId === right.userId &&
    left.organizationId === right.organizationId
  );
}

function omissionsText(omissions: Record<string, number> | undefined): string | null {
  if (!omissions) return null;
  const entries = Object.entries(omissions).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;
  return entries.map(([reason, count]) => `${count} ${reason.replaceAll("_", " ")}`).join(", ");
}

export function VaultLoginExportDialog({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Exactly the currently loaded Mine list. It is never treated as exhaustive. */
  items: VaultItem[];
}) {
  const organizationId = useAppSelector(selectOrganizationId);
  const { organizationState } = useOrganizationRequired();
  const passwordInput = useRef<HTMLInputElement | null>(null);
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const expectedActor = useRef<VaultVerifiedExportActor | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [profile, setProfile] = useState<VaultLoginCsvProfile>(DEFAULT_CSV_PROFILE);
  const [preview, setPreview] = useState<VaultLoginCsvPreviewResponse | null>(null);
  const [identityConfirmation, setIdentityConfirmation] =
    useState<VaultVerifiedExportActor | null>(null);
  const [plaintextAcknowledged, setPlaintextAcknowledged] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCurrent = (operation: number) =>
    mounted.current && generation.current === operation;
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
  const clear = () => {
    cancelPending();
    expectedActor.current = null;
    passwordInput.current && (passwordInput.current.value = "");
    setProfile(DEFAULT_CSV_PROFILE);
    setSelectedIds(new Set());
    setPreview(null);
    setIdentityConfirmation(null);
    setPlaintextAcknowledged(false);
    setRunning(false);
    setError(null);
  };
  const close = () => {
    clear();
    onOpenChange(false);
  };
  const invalidate = (message: string) => {
    cancelPending();
    expectedActor.current = null;
    passwordInput.current && (passwordInput.current.value = "");
    setSelectedIds(new Set());
    setPreview(null);
    setIdentityConfirmation(null);
    setPlaintextAcknowledged(false);
    setRunning(false);
    setError(message);
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelPending();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const { data } = createClient().auth.onAuthStateChange((_event, session) => {
      const actor = expectedActor.current;
      if (!actor) return;
      if (!session?.user || session.user.id !== actor.userId) {
        invalidate("Your account changed. Start the export again from the current Vault.");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [open]);

  useEffect(() => {
    const actor = expectedActor.current;
    if (actor && actor.organizationId !== organizationId) {
      invalidate("Your request organization changed. Start the export again from the current Vault.");
    }
  }, [organizationId]);

  const updateSelection = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setPreview(null);
    setPlaintextAcknowledged(false);
    setError(null);
  };
  const updateProfile = (next: VaultLoginCsvProfile) => {
    cancelPending();
    expectedActor.current = null;
    setProfile(next);
    setPreview(null);
    setPlaintextAcknowledged(false);
    setIdentityConfirmation(null);
    setRunning(false);
    setError(null);
  };

  const handleExportError = (cause: unknown) => {
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    if (isOrganizationRequiredError(cause)) {
      invalidate(
        "Your organization selection changed. Choose an organization to start the export again.",
      );
      return;
    }
    if (cause instanceof VaultLoginExportTransportError) {
      if (cause.code === "recent_auth_required") {
        const actor = expectedActor.current;
        setPreview(null);
        setSelectedIds(new Set());
        setPlaintextAcknowledged(false);
        setIdentityConfirmation(actor);
        setError(null);
        return;
      }
      if (cause.code === "context_changed") {
        invalidate(cause.message);
        return;
      }
      setPreview(null);
      setPlaintextAcknowledged(false);
      setError(cause.message);
      return;
    }
    setError("Vault export could not be completed. Start again from the current Vault.");
  };

  const reviewSelection = async () => {
    if (selectedIds.size === 0) {
      setError("Select one or more loaded credentials to review for export.");
      return;
    }
    const { operation, request } = beginOperation();
    setRunning(true);
    setError(null);
    try {
      const actor = await getVaultExportActor();
      if (!isCurrent(operation)) return;
      expectedActor.current = actor;
      const nextPreview = await previewVaultLoginCsv(
        { profile, item_ids: [...selectedIds] },
        actor,
        request.signal,
      );
      if (!isCurrent(operation) || request.signal.aborted) return;
      setPreview(nextPreview);
      setPlaintextAcknowledged(false);
    } catch (cause) {
      if (isCurrent(operation)) handleExportError(cause);
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
      setError(null);
    } catch (cause) {
      if (!isCurrent(operation)) return;
      if (cause instanceof VaultIdentityConfirmationError) {
        if (cause.code === "credentials_rejected") {
          setError("That password could not confirm your identity. Try again.");
        } else if (cause.code === "context_changed") {
          invalidate(
            "Your account or organization changed. Start the export again from the current Vault.",
          );
        } else {
          invalidate(
            "We could not verify your identity. Start the export again from the current Vault.",
          );
        }
      } else {
        invalidate(
          "We could not verify your identity. Start the export again from the current Vault.",
        );
      }
    } finally {
      passwordInput.current && (passwordInput.current.value = "");
      if (isCurrent(operation)) setRunning(false);
    }
  };

  const download = async () => {
    const actor = expectedActor.current;
    if (!actor || !preview || !plaintextAcknowledged) return;
    const { operation, request } = beginOperation();
    setRunning(true);
    setError(null);
    try {
      const blob = await downloadVaultLoginCsv(
        {
          profile,
          item_ids: [...selectedIds],
          revision: preview.revision,
        },
        actor,
        request.signal,
      );
      const actual = await getVaultExportActor();
      if (!isCurrent(operation) || request.signal.aborted || !sameActor(actual, actor)) {
        throw new VaultLoginExportTransportError("context_changed");
      }
      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = EXPORT_FILENAME;
        link.click();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      close();
    } catch (cause) {
      if (isCurrent(operation)) handleExportError(cause);
    } finally {
      if (controller.current === request) controller.current = null;
      if (isCurrent(operation)) setRunning(false);
    }
  };

  const eligible = preview?.items.filter((item) => item.eligible).length ?? 0;
  const loginItems = items.filter(
    (item) => item.definition_key === WEBSITE_LOGIN_DEFINITION_KEY,
  );

  if (organizationState !== "ready") {
    return (
      <Credenza
        open={open}
        onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      >
        <CredenzaContent className="md:max-w-2xl">
          <CredenzaHeader>
            <CredenzaTitle>Export selected logins</CredenzaTitle>
          </CredenzaHeader>
          <CredenzaBody className="px-4 pb-6 md:px-0">
            <OrganizationContextNotice
              state={organizationState}
              what="Vault login exports"
              compact
            />
          </CredenzaBody>
        </CredenzaContent>
      </Credenza>
    );
  }

  return (
    <Credenza open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <CredenzaContent className="md:max-w-2xl">
        <CredenzaHeader>
          <CredenzaTitle>Export selected logins</CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="space-y-4 px-4 pb-6 md:px-0">
          {identityConfirmation ? (
            <section className="space-y-3">
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Confirm your identity before requesting a new export preview.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vault-export-email">Current account</Label>
                <Input id="vault-export-email" value={identityConfirmation.email} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vault-export-password">Current Matrx password</Label>
                <Input
                  ref={passwordInput}
                  id="vault-export-password"
                  type="password"
                  autoComplete="current-password"
                  disabled={running}
                />
              </div>
              <p className="text-xs text-muted-foreground">This export currently requires a Matrx password. Your connected-provider sign-in needs a separate confirmation method.</p>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="button" onClick={() => void confirmIdentity()} disabled={running}>
                  {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm identity
                </Button>
              </div>
            </section>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Choose the website logins to export. Showing {loginItems.length} website logins from {items.length} credentials currently loaded in Mine.</p>
              <div className="space-y-1.5">
                <Label htmlFor="vault-export-profile">CSV destination</Label>
                <Select
                  value={profile}
                  onValueChange={(next) => {
                    if (isVaultLoginCsvProfile(next)) updateProfile(next);
                  }}
                  disabled={running}
                >
                  <SelectTrigger id="vault-export-profile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CSV_PROFILES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {CSV_PROFILES.find((option) => option.value === profile)?.detail}
                </p>
              </div>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-2" aria-label="Loaded website logins">
                {loginItems.length === 0 && <p className="p-2 text-sm text-muted-foreground">No website logins are currently loaded.</p>}
                {loginItems.map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded p-2 text-sm hover:bg-muted/50">
                    <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={(checked) => updateSelection(item.id, checked === true)} disabled={running} />
                    <span className="min-w-0 flex-1 truncate">{item.display_name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{selectedIds.size} selected of {loginItems.length} shown.</p>

              {preview && (
                <section className="space-y-3 rounded-lg border border-border p-3">
                  <div>
                    <p className="font-medium">Export preview</p>
                    <p className="text-sm text-muted-foreground">{eligible} eligible of {preview.items.length} selected. We will recheck the selection before creating the file.</p>
                  </div>
                  <ul className="space-y-2 text-sm">
                    {preview.items.map((item) => (
                      <li key={item.item_id} className="rounded bg-muted/50 p-2">
                        <p>{item.title}: {item.eligible ? "will export" : item.reason ?? "will be skipped"}</p>
                        {omissionsText(item.omissions) && <p className="mt-1 text-xs text-muted-foreground">Omitted: {omissionsText(item.omissions)}</p>}
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                    <Checkbox checked={plaintextAcknowledged} onCheckedChange={(checked) => setPlaintextAcknowledged(checked === true)} />
                    <span>I understand this downloads a plaintext file containing passwords. Import it into a password manager and do not open it in a spreadsheet. It only contains the selected website logins and is not a full backup.</span>
                  </div>
                </section>
              )}

              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                {preview ? (
                  <Button type="button" onClick={() => void download()} disabled={running || !plaintextAcknowledged || eligible === 0}>
                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                    Download CSV
                  </Button>
                ) : (
                  <Button type="button" onClick={() => void reviewSelection()} disabled={running || selectedIds.size === 0}>
                    {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Review selected logins
                  </Button>
                )}
              </div>
            </>
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}
