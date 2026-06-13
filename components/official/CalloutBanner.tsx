/**
 * CalloutBanner — a compact, dismissible inline callout in a semantic tone.
 * Reusable across the app (first consumer: the agents-page drift banner). No
 * such primitive existed; this is the canonical one — extend it, don't fork.
 */

"use client";

import { X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type CalloutTone = "destructive" | "warning" | "info" | "success";

const TONE: Record<CalloutTone, { container: string; icon: string }> = {
  destructive: { container: "border-destructive/30 bg-destructive/10", icon: "text-destructive" },
  warning: { container: "border-warning/30 bg-warning/10", icon: "text-warning" },
  info: { container: "border-primary/30 bg-primary/10", icon: "text-primary" },
  success: { container: "border-success/30 bg-success/10", icon: "text-success" },
};

interface CalloutBannerProps {
  tone: CalloutTone;
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Action buttons / chips rendered on the trailing edge. */
  actions?: React.ReactNode;
  onDismiss?: () => void;
  dismissing?: boolean;
  className?: string;
}

export function CalloutBanner({
  tone,
  icon: Icon,
  title,
  description,
  actions,
  onDismiss,
  dismissing,
  className,
}: CalloutBannerProps) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center",
        t.container,
        className,
      )}
      role="status"
    >
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {Icon && <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", t.icon)} aria-hidden />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:ml-2">
        {actions}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            disabled={dismissing}
            aria-label="Dismiss"
            className="rounded-md p-1 text-muted-foreground hover:bg-background/60 hover:text-foreground disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
