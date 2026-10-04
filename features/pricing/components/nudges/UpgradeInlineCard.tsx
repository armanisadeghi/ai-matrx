"use client";

import { ArrowRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpgradeInlineCardProps {
  feature?: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  variant?: "card" | "soft" | "outline";
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}

export function UpgradeInlineCard({
  feature = "Tool execution",
  description = "Run sandboxed tools, browse, query, and write files — included on paid plans.",
  ctaLabel = "Upgrade to unlock",
  onCta,
  variant = "card",
  icon: Icon = Lock,
  className,
}: UpgradeInlineCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-xl p-5 transition-all duration-300",
        variant === "card" &&
          "border border-border/70 bg-card hover:border-foreground/40",
        variant === "soft" && "bg-muted/40",
        variant === "outline" &&
          "border-2 border-dashed border-border hover:border-foreground/40",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5 text-foreground ring-1 ring-foreground/10">
          <Icon className="h-4 w-4" />
        </span>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold tracking-tight">{feature}</h4>
            <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/70">
              Paid
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onCta}
        className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        {ctaLabel}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}
