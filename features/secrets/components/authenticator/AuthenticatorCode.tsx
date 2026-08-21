"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { fetchAuthenticatorCode } from "../../authenticator-service";

export function AuthenticatorCode({
  credentialItemId,
  enabled,
  period = 30,
  presentation = "large",
}: {
  credentialItemId: string;
  enabled: boolean;
  period?: number;
  presentation?: "compact" | "large";
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
      <p className="flex h-11 items-center text-sm font-medium text-muted-foreground">
        Authenticator off
      </p>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-11 items-center gap-2">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-11"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  const displayCode = code
    ? code.replace(/\s/g, "").replace(/(.{3})(?=.)/g, "$1 ")
    : "••• •••";
  const boundedPeriod = period > 0 ? period : 30;
  const progress = Math.max(0, Math.min(1, seconds / boundedPeriod));

  if (presentation === "compact") {
    return (
      <button
        type="button"
        disabled={!code}
        className="group flex min-h-11 w-full items-center gap-3 rounded-md text-left disabled:cursor-wait"
        aria-label={code ? `Copy code ${code}` : "Getting authenticator code"}
        onClick={async () => {
          if (!code) return;
          await navigator.clipboard.writeText(code);
          toast.success("Code copied");
        }}
      >
        <span className="font-mono text-[2rem] font-medium leading-none tracking-[0.08em] text-primary tabular-nums transition-colors group-hover:text-primary/80">
          {displayCode}
        </span>
        <CountdownRing seconds={code ? seconds : null} progress={progress} />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/60 px-4 py-3">
      <div>
        <div className="font-mono text-4xl font-semibold tracking-[0.22em] text-foreground tabular-nums sm:text-5xl">
          {displayCode}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <CountdownRing seconds={code ? seconds : null} progress={progress} />
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11"
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
    </div>
  );
}

function CountdownRing({
  seconds,
  progress,
}: {
  seconds: number | null;
  progress: number;
}) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className="relative flex h-9 w-9 shrink-0 items-center justify-center text-primary"
      role="img"
      aria-label={seconds === null ? "Getting code" : `${seconds} seconds left`}
    >
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          className="stroke-muted"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className="transition-[stroke-dashoffset] duration-700 ease-linear"
        />
      </svg>
      <span className="absolute text-[10px] font-semibold tabular-nums text-foreground">
        {seconds ?? "…"}
      </span>
    </span>
  );
}
