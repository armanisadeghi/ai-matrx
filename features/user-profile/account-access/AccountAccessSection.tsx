"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { KeyRound, LogOut, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { ErrorNotice } from "@ai-matrx/design-system";
import { InfoHint } from "@/components/official/InfoHint";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { readAccountAccess, requestEmailChange, signOutOtherSessions, type AccountAccessState } from "./accountAccess";

import { Spinner } from "@/components/ui/loaders/Spinner";
type Operation = "email" | "sessions" | null;

export function AccountAccessSection() {
  const [account, setAccount] = useState<AccountAccessState | null>(null);
  const [email, setEmail] = useState("");
  const [operation, setOperation] = useState<Operation>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    void readAccountAccess()
      .then((current) => {
        if (!active) return;
        setAccount(current);
        setEmail(current.pendingEmail ?? current.email);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Couldn’t load your account.");
      });
    return () => { active = false; };
  }, [refreshCount]);

  const submitEmail = async () => {
    if (operation || !account) return;
    setOperation("email");
    setError(null);
    setNotice(null);
    try {
      const current = await requestEmailChange(email, window.location.origin);
      setAccount(current);
      setEmail(current.pendingEmail ?? current.email);
      setNotice("Check your email to confirm the change.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t request that email change.");
    } finally {
      setOperation(null);
    }
  };

  const endOtherSessions = async () => {
    if (operation) return;
    setOperation("sessions");
    setError(null);
    setNotice(null);
    try {
      await signOutOtherSessions();
      setNotice("Other sessions were signed out.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Couldn’t sign out other sessions.");
    } finally {
      setOperation(null);
    }
  };

  const emailUnchanged = !account || email.trim().toLowerCase() === account.email.toLowerCase() || email.trim().toLowerCase() === account.pendingEmail?.toLowerCase();

  return (
    <SettingsSection title="Account access">
      <div className="space-y-4 p-4">
        {error ? <ErrorNotice message={error} size="inline" /> : null}
        {notice ? <p className="type-body text-success">{notice}</p> : null}
        {!account && !error ? <div className="flex items-center gap-2 type-body text-muted-foreground"><Spinner size="xs" className="text-current" />Loading account…</div> : null}
        {account ? (
          <>
            <SettingsReadOnlyValue label="Primary email" value={account.email} />
            {account.pendingEmail ? <SettingsReadOnlyValue label="Pending email" value={account.pendingEmail} /> : null}
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="sr-only" htmlFor="account-email">New email address</label>
              <Input id="account-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={operation !== null} />
              <Button icon={operation === "email" ? <Spinner size="xs" className="text-current" /> : <Mail aria-hidden />} variant="primary" type="button" onClick={() => void submitEmail()} disabled={operation !== null || emailUnchanged}> Change email
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Button asChild variant="outline"><Link href="/forgot-password?redirectTo=%2Fuser-settings%2Faccount"><KeyRound className="h-4 w-4" aria-hidden />Reset password</Link></Button>
              <Button icon={operation === "sessions" ? <Spinner size="xs" className="text-current" /> : <LogOut aria-hidden />} type="button" variant="outline" onClick={() => void endOtherSessions()} disabled={operation !== null}> Sign out other sessions
              </Button>
              <InfoHint label="About other sessions" text="Other sessions lose refresh access; issued access tokens remain valid until they expire." />
            </div>
          </>
        ) : null}
        {error && !account ? <Button type="button" variant="outline" onClick={() => { setError(null); setRefreshCount((count) => count + 1); }}>Try again</Button> : null}
      </div>
    </SettingsSection>
  );
}
