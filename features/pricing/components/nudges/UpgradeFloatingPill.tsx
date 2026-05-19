"use client";

import { useState } from "react";
import { ArrowRight, Crown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpgradeFloatingPillProps {
  message?: string;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
}

export function UpgradeFloatingPill({
  message = "Try Pro free for 14 days",
  ctaLabel = "Start trial",
  onCta,
  className,
}: UpgradeFloatingPillProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit items-center gap-2 rounded-full border border-border/70 bg-card/95 py-1.5 pl-1.5 pr-1.5 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.3)] backdrop-blur-xl animate-in slide-in-from-bottom-4 fade-in duration-500",
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 pl-3 text-xs font-medium">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {message}
      </span>
      <button
        type="button"
        onClick={onCta}
        className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background transition-transform hover:scale-[1.03]"
      >
        <Crown className="h-3 w-3" />
        {ctaLabel}
        <ArrowRight className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
