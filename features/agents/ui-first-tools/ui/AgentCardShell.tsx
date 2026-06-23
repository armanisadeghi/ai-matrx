/**
 * AgentCardShell — the shared chrome for every inline agent card (asks +
 * approvals) that sits above the chat input.
 *
 * One look, applied everywhere: a rounded-2xl elevated card, a tone-tinted top
 * accent + icon chip, a clean header (eyebrow → title → subtitle), an optional
 * dismiss ×, a body slot, an optional muted footer band for the action row, and
 * a bottom slot for a countdown bar. `<AskCard>` and `<ApprovalCard>` both render
 * through this, so they share spacing, rounding, elevation, and hierarchy — the
 * card just supplies its header text, body, and actions.
 *
 * Tone drives the accent strip + icon-chip color; "neutral" hides the strip.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccentTone =
  | "neutral"
  | "primary"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "violet";

const CHIP: Record<AccentTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/12 text-primary",
  info: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  success: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  danger: "bg-red-500/12 text-red-600 dark:text-red-400",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
};

const STRIP: Record<AccentTone, string> = {
  neutral: "from-border",
  primary: "from-primary/60",
  info: "from-sky-500/60",
  success: "from-emerald-500/60",
  warning: "from-amber-500/60",
  danger: "from-red-500/60",
  violet: "from-violet-500/60",
};

export interface AgentCardShellProps {
  tone?: AccentTone;
  icon?: LucideIcon;
  /** Small uppercase label above the title (kind / verb / context). */
  eyebrow?: ReactNode;
  /** The prominent line (the question, or the entity headline). */
  title?: ReactNode;
  /** Muted secondary line under the title. */
  subtitle?: ReactNode;
  /** Top-right pill (e.g. batch "2 of 3"). */
  badge?: ReactNode;
  /** Shows the dismiss × when provided. */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Action row, rendered in a muted footer band with a top border. */
  footer?: ReactNode;
  /** Body content. When falsy, the body region is omitted entirely. */
  children?: ReactNode;
  /** Dim + disable once resolved. */
  pending?: boolean;
  /** Bottom-edge slot (the countdown bar). */
  bottomSlot?: ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function AgentCardShell({
  tone = "neutral",
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  badge,
  onDismiss,
  dismissLabel = "Dismiss",
  footer,
  children,
  pending,
  bottomSlot,
  className,
  "aria-label": ariaLabel,
}: AgentCardShellProps) {
  const hasHeaderText = Boolean(eyebrow || title || subtitle || badge);
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground",
        "shadow-[0_10px_30px_-14px_rgb(0_0_0/0.45)] ring-1 ring-black/[0.03] dark:ring-white/[0.04]",
        "animate-in fade-in slide-in-from-bottom-2 duration-300",
        pending && "opacity-50 pointer-events-none",
        className,
      )}
      role="region"
      aria-label={ariaLabel}
    >
      {tone !== "neutral" && (
        <div
          className={cn("h-0.5 w-full bg-gradient-to-r to-transparent", STRIP[tone])}
        />
      )}

      <div className="flex items-start gap-3 px-4 pt-3.5">
        {Icon && (
          <div
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-xl",
              CHIP[tone],
            )}
          >
            <Icon className="size-[18px]" strokeWidth={2.25} />
          </div>
        )}
        {hasHeaderText && (
          <div className="min-w-0 flex-1">
            {(eyebrow || badge) && (
              <div className="flex items-center gap-2">
                {eyebrow && (
                  <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {eyebrow}
                  </div>
                )}
                {badge && (
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {badge}
                  </span>
                )}
              </div>
            )}
            {title && (
              <div className="mt-0.5 whitespace-pre-wrap text-[15px] font-semibold leading-snug text-foreground">
                {title}
              </div>
            )}
            {subtitle && (
              <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
            title={dismissLabel}
            aria-label={dismissLabel}
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {children ? (
        <div className={cn("px-4 pt-3", !footer && "pb-3.5")}>{children}</div>
      ) : null}

      {footer && (
        <div className="mt-3 border-t border-border/60 bg-muted/30 px-4 py-3">
          {footer}
        </div>
      )}

      {bottomSlot}
    </div>
  );
}
