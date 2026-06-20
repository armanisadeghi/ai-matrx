"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  Play,
  AlertTriangle,
  XCircle,
  Pause,
  ArrowRight,
  Lock,
  type LucideIcon,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Visual + behavioral states for a stage node in the orchestra.
 *
 *  - `empty`     no data ever produced; e.g. Document before any run
 *  - `idle`      has data, nothing pending, nothing running
 *  - `gated`     manual mode + upstream finished — waiting on the user
 *  - `queued`    will run automatically when upstream completes
 *  - `active`    currently running — animated ring + flowing edge into next
 *  - `partial`   finished but some items failed
 *  - `complete`  finished cleanly
 *  - `failed`    hard error
 */
export type OrchestraStatus =
  | "empty"
  | "idle"
  | "gated"
  | "queued"
  | "active"
  | "partial"
  | "complete"
  | "failed";

export interface OrchestraNodeProps {
  icon: LucideIcon;
  label: string;
  /**
   * The big number / fraction shown in the body of the card.
   * String so callers can render "12 / 15", "—", "Ready", etc.
   */
  count: ReactNode;
  /** Subtle line under the count — e.g. "of 5 max", "0 failed", "from 2 sources". */
  hint?: ReactNode;
  status: OrchestraStatus;
  /** Where clicking the body navigates to (the corresponding detail page). */
  href: string;
  /**
   * If supplied, the node renders a small primary action button
   * (a play icon by default) that triggers this stage manually.
   * Hidden when status is "active" or when `actionDisabled` is true.
   */
  onAction?: () => Promise<void> | void;
  actionLabel?: string;
  actionIcon?: LucideIcon;
  actionDisabled?: boolean;
  /**
   * Optional SECOND action button (e.g. a node that can run two related passes,
   * like Tags → auto-tag + auto-consolidate). Rendered to the left of the
   * primary action with the same visuals. Same active/disabled rules apply.
   */
  onSecondaryAction?: () => Promise<void> | void;
  secondaryActionLabel?: string;
  secondaryActionIcon?: LucideIcon;
  secondaryActionDisabled?: boolean;
  /**
   * Optional ribbon strip drawn at the top of the card — used for
   * tag-source breakdowns ("S 12 · A 8"), quota chips, etc.
   */
  ribbon?: ReactNode;
  /** Optional rich tooltip shown on hover. Falls back to a sensible default. */
  tooltip?: ReactNode;
  /** Whether the node should appear inactive/dimmed (e.g. quota at zero). */
  dim?: boolean;
}

const STATUS_BADGE: Record<
  OrchestraStatus,
  { icon: LucideIcon | null; className: string; label: string } | null
> = {
  empty: null,
  idle: null,
  gated: {
    icon: Lock,
    className: "text-amber-600 dark:text-amber-400",
    label: "Waiting for you",
  },
  queued: {
    icon: Pause,
    className: "text-primary/80",
    label: "Will run next",
  },
  active: {
    icon: Loader2,
    className: "text-primary animate-spin",
    label: "Running now",
  },
  partial: {
    icon: AlertTriangle,
    className: "text-amber-600 dark:text-amber-400",
    label: "Some failures",
  },
  complete: {
    icon: CheckCircle2,
    className: "text-emerald-500",
    label: "Done",
  },
  failed: {
    icon: XCircle,
    className: "text-destructive",
    label: "Failed",
  },
};

/**
 * A single node in the pipeline orchestra. Owns its own visuals; ordering,
 * edges, and stage triggering are the parent's responsibility.
 */
export function OrchestraNode({
  icon: Icon,
  label,
  count,
  hint,
  status,
  href,
  onAction,
  actionLabel,
  actionIcon: ActionIcon = Play,
  actionDisabled,
  onSecondaryAction,
  secondaryActionLabel,
  secondaryActionIcon: SecondaryActionIcon = Play,
  secondaryActionDisabled,
  ribbon,
  tooltip,
  dim,
}: OrchestraNodeProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionBusy, setActionBusy] = useState(false);
  const [secondaryBusy, setSecondaryBusy] = useState(false);
  const badge = STATUS_BADGE[status];
  const showAction = onAction != null && status !== "active";
  const showSecondaryAction = onSecondaryAction != null && status !== "active";

  // Bump the count visually whenever it changes — surfaces live increments.
  const countWrapRef = useRef<HTMLSpanElement>(null);
  const lastCountRef = useRef<ReactNode>(count);
  useEffect(() => {
    if (lastCountRef.current === count) return;
    lastCountRef.current = count;
    const el = countWrapRef.current;
    if (!el) return;
    el.dataset.bumped = "true";
    const t = window.setTimeout(() => {
      if (el.dataset.bumped) delete el.dataset.bumped;
    }, 500);
    return () => window.clearTimeout(t);
  }, [count]);

  const handleNavigate = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    if (isPending) return;
    startTransition(() => router.push(href));
  };

  const handleAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onAction || actionBusy || actionDisabled) return;
    setActionBusy(true);
    try {
      await onAction();
    } finally {
      setActionBusy(false);
    }
  };

  const handleSecondaryAction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onSecondaryAction || secondaryBusy || secondaryActionDisabled) return;
    setSecondaryBusy(true);
    try {
      await onSecondaryAction();
    } finally {
      setSecondaryBusy(false);
    }
  };

  const tooltipContent = tooltip ?? (
    <div className="space-y-0.5">
      <div className="font-medium text-xs">{label}</div>
      {badge && (
        <div className="text-[11px] text-muted-foreground">{badge.label}</div>
      )}
      <div className="text-[10px] text-muted-foreground/80">
        Click to open · ⌘-click for new tab
      </div>
    </div>
  );

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          onClick={handleNavigate}
          aria-label={`Open ${label}`}
          data-status={status}
          className={cn(
            "orchestra-node group min-w-0 select-none",
            dim && "opacity-50",
            isPending && "pointer-events-none",
          )}
        >
          {/* Loading overlay during route transition */}
          {isPending && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-background/60 backdrop-blur-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}

          {/* Optional ribbon (tags breakdown, quota chips) */}
          {ribbon && (
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 leading-none flex items-center gap-1 min-w-0">
              {ribbon}
            </div>
          )}

          {/* Header row: icon + label + status badge */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                status === "active"
                  ? "bg-primary/15 text-primary"
                  : status === "complete"
                    ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                    : status === "partial" || status === "gated"
                      ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                      : status === "failed"
                        ? "bg-destructive/12 text-destructive"
                        : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/85 truncate flex-1">
              {label}
            </span>
            {badge && badge.icon && (
              <badge.icon className={cn("h-3 w-3 shrink-0", badge.className)} />
            )}
          </div>

          {/* Body row: big count + optional play action on the right */}
          <div className="flex items-end justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <span
                ref={countWrapRef}
                className={cn(
                  "orchestra-count block text-base font-bold leading-none truncate",
                  status === "active" && "text-primary",
                  status === "empty" && "text-muted-foreground/60",
                )}
              >
                {count}
              </span>
              {hint && (
                <div className="mt-0.5 text-[10px] text-muted-foreground/80 truncate leading-tight">
                  {hint}
                </div>
              )}
            </div>

            {(showAction || showSecondaryAction) && (
              <div className="flex shrink-0 items-center gap-1">
                {showSecondaryAction && (
                  <button
                    type="button"
                    onClick={handleSecondaryAction}
                    disabled={secondaryActionDisabled || secondaryBusy}
                    aria-label={secondaryActionLabel ?? "Run this stage"}
                    className={cn(
                      "shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full",
                      "border border-border/60 bg-background/70 backdrop-blur",
                      "text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/10",
                      "transition-colors",
                      "disabled:opacity-40 disabled:pointer-events-none",
                      "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                      status === "gated" &&
                        "opacity-100 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10",
                    )}
                  >
                    {secondaryBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <SecondaryActionIcon className="h-3 w-3" />
                    )}
                  </button>
                )}
                {showAction && (
                  <button
                    type="button"
                    onClick={handleAction}
                    disabled={actionDisabled || actionBusy}
                    aria-label={actionLabel ?? "Run this stage"}
                    className={cn(
                      "shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-full",
                      "border border-border/60 bg-background/70 backdrop-blur",
                      "text-muted-foreground hover:text-foreground hover:border-primary/50 hover:bg-primary/10",
                      "transition-colors",
                      "disabled:opacity-40 disabled:pointer-events-none",
                      "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                      status === "gated" &&
                        "opacity-100 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10",
                    )}
                  >
                    {actionBusy ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ActionIcon className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
            )}
            {!showAction && !showSecondaryAction && status === "active" && (
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary/70 animate-pulse" />
            )}
          </div>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}
