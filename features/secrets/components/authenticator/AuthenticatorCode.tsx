"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { fetchAuthenticatorCode } from "../../authenticator-service";

export function AuthenticatorCode({
  credentialItemId,
  enabled,
}: {
  credentialItemId: string;
  enabled: boolean;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchAuthenticatorCode(credentialItemId)
      .then((next) => {
        if (cancelled) return;
        setCode(next.code);
        setSeconds(next.valid_for_seconds);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Code unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [credentialItemId, enabled, reload]);

  useEffect(() => {
    if (!enabled || !code) return;
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setReload((value) => value + 1);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [code, enabled]);

  if (!enabled) {
    return (
      <p className="text-sm text-muted-foreground">
        Turn it on to see the code.
      </p>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/60 px-4 py-3">
      <div>
        <div className="font-mono text-4xl font-semibold tracking-[0.22em] text-foreground tabular-nums sm:text-5xl">
          {code ?? "••••••"}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {code ? `New code in ${seconds}s` : "Getting code…"}
        </p>
      </div>
      <Button
        variant="outline"
        size="icon"
        disabled={!code}
        aria-label="Copy authenticator code"
        onClick={async () => {
          if (!code) return;
          await navigator.clipboard.writeText(code);
          toast.success("Code copied");
        }}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
}
