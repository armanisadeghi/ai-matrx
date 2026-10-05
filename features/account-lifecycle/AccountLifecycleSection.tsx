"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { performLocalSignOut } from "@/features/shell/auth/useSignOut";

type ClosureRead = { closure: { state: "closing" | "closed" | "failed" | "restored" } | null };

export function AccountLifecycleSection() {
  const [state, setState] = useState<ClosureRead["closure"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch("/api/account/closure").then(async (response) => {
      if (!response.ok) throw new Error("Account closure status could not be loaded.");
      const read = await response.json() as ClosureRead;
      setState(read.closure);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Account closure status could not be loaded."));
  }, []);

  const close = async () => {
    const accepted = await confirm({
      title: "Close account?",
      description: "Personal subscriptions are canceled. Shared data stays retained and a recovery email is sent first; no refund is promised.",
      confirmLabel: "Close account",
      variant: "destructive",
    });
    if (!accepted) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/closure", { method: "POST" });
      const body = await response.json() as { error?: string; blockers?: string[] };
      if (!response.ok) {
        const suffix = body.blockers?.length ? " Transfer ownership in organization settings, then try again." : "";
        throw new Error(`${body.error ?? "Account closure failed."}${suffix}`);
      }
      await performLocalSignOut("/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account closure failed.");
      setPending(false);
    }
  };

  return <SettingsSection title="Account closure" icon={AlertTriangle} description="Close access; retained data remains recoverable.">
    <div className="space-y-3">
      {state?.state === "closed" ? <p className="text-sm text-muted-foreground">Closed accounts restore from their recovery email.</p> : <p className="text-sm text-muted-foreground">Personal subscriptions end before access closes.</p>}
      <p className="text-sm text-muted-foreground"><Link href="/organizations" className="underline">Manage shared ownership before closing.</Link></p>
      <p className="text-sm text-muted-foreground">No refunds are promised.</p>
      {error ? <ErrorNotice message={error} size="inline" /> : null}
      {state?.state !== "closed" ? <Button variant="danger" onClick={() => void close()} disabled={pending}>{pending ? "Closing…" : "Close account"}</Button> : null}
    </div>
  </SettingsSection>;
}
