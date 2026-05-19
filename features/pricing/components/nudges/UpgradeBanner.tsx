"use client";

import { useState } from "react";
import { ArrowRight, Crown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpgradeBannerProps {
  message?: string;
  ctaLabel?: string;
  onCta?: () => void;
  variant?: "subtle" | "accent";
  className?: string;
}

export function UpgradeBanner({
  message = "You're on the Free plan. Unlock frontier models with a 14-day Pro trial.",
  ctaLabel = "Try Pro free",
  onCta,
  variant = "subtle",
  className,
}: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div
      role="region"
      aria-label="Upgrade nudge"
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-sm",
        variant === "subtle"
          ? "border-b border-border/60 bg-muted/40 text-foreground"
          : "border-b border-foreground/15 bg-foreground text-background",
        className,
      )}
    >
      <Crown className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} />
      <span className="flex-1 truncate">{message}</span>
      <button
        type="button"
        onClick={onCta}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
          variant === "subtle"
            ? "bg-foreground text-background hover:bg-foreground/90"
            : "bg-background text-foreground hover:bg-background/90",
        )}
      >
        {ctaLabel}
        <ArrowRight className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className={cn(
          "rounded p-1 transition-colors",
          variant === "subtle"
            ? "text-muted-foreground hover:text-foreground"
            : "text-background/70 hover:text-background",
        )}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
