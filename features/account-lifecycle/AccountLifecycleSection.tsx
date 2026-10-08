"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { ErrorNotice } from "@ai-matrx/design-system";
import { performLocalSignOut } from "@/features/shell/auth/useSignOut";

type ClosureState = "closing" | "closed" | "failed" | "restored";
type ClosureRead = { closure: { state: ClosureState } | null };
const closureStates = new Set<ClosureState>(["closing", "closed", "failed", "restored"]);

function closureRead(value: unknown): ClosureRead {
  if (!value || typeof value !== "object") return { closure: null };
  const closure = (value as { closure?: unknown }).closure;
  const state = closure && typeof closure === "object" ? (closure as { state?: unknown }).state : undefined;
  if (typeof state !== "string" || !closureStates.has(state as ClosureState)) return { closure: null };
  return { closure: { state: state as ClosureState } };
}

function failureRead(value: unknown) {
  if (!value || typeof value !== "object") return { error: undefined, blockers: [] as string[] };
  const body = value as { error?: unknown; blockers?: unknown };
  return { error: typeof body.error === "string" ? body.error : undefined, blockers: Array.isArray(body.blockers) ? body.blockers.filter((blocker): blocker is string => typeof blocker === "string") : [] };
}

export function AccountLifecycleSection() {
  const [state, setState] = useState<ClosureRead["closure"]>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void fetch("/api/account/closure").then(async (response) => {
      if (!response.ok) throw new Error("Account closure status could not be loaded.");
      const read = closureRead(await response.json());
      setState(read.closure);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Account closure status could not be loaded."));
  }, []);

  const close = async () => {
    const accepted = await confirm({
      title: "Close account?",
      description: "You cannot sign in again; an open session can work for up to an hour. API keys are revoked, schedules pause, personal subscriptions are canceled. Your records stay. A recovery email arrives first; no refund is promised.",
      confirmLabel: "Close account",
      variant: "destructive",
    });
    if (!accepted) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/closure", { method: "POST" });
      const body = failureRead(await response.json());
      if (!response.ok) {
        const suffix = body.blockers.length ? " Transfer ownership in organization settings, then try again." : "";
        throw new Error(`${body.error ?? "Account closure failed."}${suffix}`);
      }
      await performLocalSignOut("/login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account closure failed.");
      setPending(false);
    }
  };

  return <SettingsSection title="Account closure" icon={AlertTriangle} description="Close access; retained data remains recoverable.">
    <div className="space-y-3 p-4">
      {state?.state === "closed" ? <p className="text-sm text-muted-foreground">Closed accounts restore from their recovery email.</p> : <p className="text-sm text-muted-foreground">Personal subscriptions end before access closes.</p>}
      <p className="text-sm text-muted-foreground"><Link href="/organizations" className="underline">Manage shared ownership before closing.</Link></p>
      <p className="text-sm text-muted-foreground">No refunds are promised.</p>
      {error ? <ErrorNotice message={error} size="inline" /> : null}
      {state?.state !== "closed" ? <Button variant="danger" onClick={() => void close()} disabled={pending}>{pending ? "Closing…" : "Close account"}</Button> : null}
    </div>
  </SettingsSection>;
}
