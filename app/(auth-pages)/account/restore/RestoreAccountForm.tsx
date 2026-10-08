"use client";

import { useState } from "react";
import { Button } from "@ai-matrx/design-system/controls";
import { ErrorNotice } from "@ai-matrx/design-system";

export function RestoreAccountForm({ userId, requestId, token }: { userId: string; requestId: string; token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const restore = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/account/restore", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, requestId, token }) });
      const body = await response.json() as { error?: string; actionLink?: string };
      if (!response.ok || !body.actionLink) throw new Error(body.error ?? "Account recovery failed.");
      window.location.assign(body.actionLink);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Account recovery failed.");
      setPending(false);
    }
  };
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Retained data stays intact; subscriptions stay canceled.</p>{error ? <ErrorNotice message={error} size="inline" /> : null}<Button type="button" variant="danger" onClick={() => void restore()} disabled={pending}>{pending ? "Restoring…" : "Restore account"}</Button></div>;
}
