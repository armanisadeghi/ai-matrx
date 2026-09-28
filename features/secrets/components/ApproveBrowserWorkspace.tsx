"use client";

/**
 * /vault/approve-browser — approve one browser for password filling with a
 * passkey (access ladder T-30c).
 *
 * The AI Matrx extension opens this page with its key's thumbprint when the
 * person chooses "Approve with a passkey" (the equal alternative to typing their
 * password, and the only way for an account that signs in with Google). The
 * person confirms with their account passkey; the extension turns filling on
 * when they return to it. A person with no passkey is told so and can add one
 * here. Passkeys belong to aimatrx.com, so anywhere else this page says so and
 * links there instead of offering a button that cannot work.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ExternalLink,
  Fingerprint,
  KeyRound,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

import {
  addAccountPasskey,
  approveBrowserWithPasskey,
  PASSKEY_RP_ID,
  passkeysWorkHere,
} from "../passkey-approval";
import {
  getVaultFillStepUpMethods,
  type VaultFillStepUpMethods,
} from "../vault-service";

/** First 16 hex characters in groups of four — the extension shows the same. */
export function shortFingerprint(thumbprint: string): string {
  return (thumbprint.slice(0, 16).match(/.{1,4}/g) ?? [])
    .join(" ")
    .toUpperCase();
}

export function ApproveBrowserWorkspace() {
  const params = useSearchParams();
  const thumbprint = (params.get("key") ?? "").toLowerCase();
  const label = (params.get("label") ?? "").slice(0, 200) || null;
  const validKey = /^[0-9a-f]{64}$/.test(thumbprint);

  const [methods, setMethods] = useState<VaultFillStepUpMethods | null>(null);
  const [busy, setBusy] = useState<"approve" | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvedUntil, setApprovedUntil] = useState<string | null>(null);
  const [here, setHere] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMethods(await getVaultFillStepUpMethods());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const works = passkeysWorkHere();
    setHere(works);
    // Off aimatrx.com no passkey ceremony can run, so there is nothing to check.
    if (validKey && works) void load();
  }, [load, validKey]);

  const approve = async () => {
    setBusy("approve");
    setError(null);
    try {
      const { expiresAt } = await approveBrowserWithPasskey({
        keyThumbprint: thumbprint,
        label,
      });
      setApprovedUntil(expiresAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const addPasskey = async () => {
    setBusy("add");
    setError(null);
    try {
      await addAccountPasskey();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const productionUrl =
    typeof window === "undefined"
      ? null
      : `https://www.${PASSKEY_RP_ID}${window.location.pathname}${window.location.search}`;

  return (
    <div className="h-full overflow-hidden">
      <div className="h-full min-h-0 overflow-y-auto pt-[var(--shell-header-h)]">
        <div className="mx-auto w-full max-w-md px-4 pb-safe pt-6">
          <div
            className="rounded-xl border border-border bg-card p-5"
            data-testid="approve-browser"
          >
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-base font-semibold text-foreground">
                Turn on password filling{label ? ` in ${label}` : ""}
              </h1>
            </div>

            {!validKey ? (
              <p className="mt-3 text-sm text-muted-foreground">
                This link is missing the browser to approve. Open the AI Matrx
                extension, go to its Vault tab, and choose Approve with a
                passkey again.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  The AI Matrx extension asked to fill your saved passwords in
                  this browser. Approve it only if you just asked for this. The
                  extension shows the same code:
                </p>
                <p
                  className="mt-2 rounded-md bg-muted px-3 py-2 text-center font-mono text-sm tracking-wider text-foreground"
                  data-testid="approve-browser-code"
                >
                  {shortFingerprint(thumbprint)}
                </p>

                {error && (
                  <ErrorNotice
                    size="inline"
                    className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
                    message={error}
                  />
                )}

                {approvedUntil ? (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-border p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <p
                      className="text-sm text-foreground"
                      data-testid="approve-browser-done"
                    >
                      Approved. Go back to the AI Matrx extension and filling
                      turns on there. Do it within 5 minutes, or approve again.
                    </p>
                  </div>
                ) : here === false ? (
                  <div className="mt-4 space-y-2 rounded-lg border border-border p-3 text-sm">
                    <p className="text-muted-foreground">
                      Passkeys for your AI Matrx account work only on{" "}
                      {PASSKEY_RP_ID}, and this page is open somewhere else.
                    </p>
                    {productionUrl && (
                      <a
                        href={productionUrl}
                        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                      >
                        Open this page on {PASSKEY_RP_ID}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ) : methods === null && !error ? (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking your account
                  </div>
                ) : methods && !methods.passkey ? (
                  <div className="mt-4 space-y-3">
                    <p
                      className="text-sm text-foreground"
                      data-testid="approve-browser-no-passkey"
                    >
                      {methods.password
                        ? "Your account has no passkey yet. Add one to approve this browser, or type your AI Matrx password in the extension instead."
                        : "Your account has no password or passkey yet, so a browser cannot be approved. Add a passkey to your account, then approve this browser with it."}
                    </p>
                    <Button
                      onClick={() => void addPasskey()}
                      disabled={busy !== null}
                      className="w-full"
                    >
                      {busy === "add" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Fingerprint className="mr-2 h-4 w-4" />
                      )}
                      Add a passkey
                    </Button>
                  </div>
                ) : methods ? (
                  <Button
                    onClick={() => void approve()}
                    disabled={busy !== null}
                    className="mt-4 w-full"
                    data-testid="approve-browser-passkey"
                  >
                    {busy === "approve" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Fingerprint className="mr-2 h-4 w-4" />
                    )}
                    Approve with passkey
                  </Button>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
