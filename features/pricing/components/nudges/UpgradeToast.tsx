"use client";

import { useState } from "react";
import { ArrowRight, Crown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpgradeToastProps {
  title?: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
  position?: "bottom-right" | "bottom-left" | "top-right";
  className?: string;
}

const POSITIONS = {
  "bottom-right": "bottom-6 right-6",
  "bottom-left": "bottom-6 left-6",
  "top-right": "top-6 right-6",
} as const;

export function UpgradeToast({
  title = "You're hitting Pro features",
  body = "Tool execution, replayable trajectories, and Sonnet-class models — all free for 14 days.",
  ctaLabel = "Start trial",
  onCta,
  position = "bottom-right",
  className,
}: UpgradeToastProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="alert"
      className={cn(
        "fixed z-50 w-[340px] overflow-hidden rounded-2xl border border-border/70 bg-card/95 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.25)] backdrop-blur-xl animate-in slide-in-from-bottom-2 fade-in duration-300",
        POSITIONS[position],
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/30 to-transparent" />
      <div className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <Crown className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold leading-tight tracking-tight">
              {title}
            </h4>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="-mr-1 -mt-1 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {body}
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onCta}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {ctaLabel}
              <ArrowRight className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
