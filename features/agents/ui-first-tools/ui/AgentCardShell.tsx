/**
 * AgentCardShell — the shared chrome for every inline agent card (asks +
 * approvals) that sits above the chat input.
 *
 * One look, applied everywhere: a rounded-2xl elevated card, a tone-tinted top
 * accent, a compact header row (plain tinted icon + eyebrow + badge + dismiss ×)
 * with the title on its OWN full-width row below (so a long question spans the
 * whole card instead of being squeezed into a middle column), a subtitle, a body
 * slot, an optional muted footer band for the action row, and a bottom slot for a
 * countdown bar. `<AskCard>` and `<ApprovalCard>` both render through this, so they
 * share spacing, rounding, elevation, and hierarchy — the card just supplies its
 * header text, body, and actions.
 *
 * Tone drives the accent strip + icon color; "neutral" hides the strip. The icon
 * carries no chip background/padding — the tone reads via the strip + icon tint.
 */

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AccentTone =
  "neutral" | "primary" | "info" | "success" | "warning" | "danger" | "violet";

// Icon tint only — no chip background/padding. The tone still reads at a glance
// via the accent strip + the icon color, without stealing horizontal space.
const ICON_TONE: Record<AccentTone, string> = {
  neutral: "text-muted-foreground",
  primary: "text-primary",
  info: "text-sky-600 dark:text-sky-400",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  danger: "text-red-600 dark:text-red-400",
  violet: "text-violet-600 dark:text-violet-400",
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
  return (
    <div
      className={cn(
        // Cap the card so it can never outgrow the viewport (the chat input +
        // messages must stay reachable, especially on mobile). The header stays
        // pinned, the body scrolls internally, and the footer/countdown stay
        // pinned at the bottom — so the primary action is always accessible no
        // matter how long the question or how many options.
        "group relative flex max-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground",
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
          className={cn(
            "h-0.5 w-full shrink-0 bg-gradient-to-r to-transparent",
            STRIP[tone],
          )}
        />
      )}

      <div className="flex shrink-0 flex-col px-4 pt-3">
        {/* Top row: plain icon + eyebrow + badge + dismiss. Compact — the
            question no longer lives boxed between the icon and the ×. */}
        <div className="flex items-center gap-2">
          {Icon && (
            <Icon
              className={cn("size-[18px] shrink-0", ICON_TONE[tone])}
              strokeWidth={2.25}
            />
          )}
          {eyebrow && (
            <div className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </div>
          )}
          {badge && (
            <span
              className={cn(
                "shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground",
                !eyebrow && "ml-auto",
              )}
            >
              {badge}
            </span>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className={cn(
                "-mr-1 shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground",
                !eyebrow && !badge && "ml-auto",
              )}
              title={dismissLabel}
              aria-label={dismissLabel}
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Title on its OWN full-width row — spans the entire card width
            instead of being squeezed into a middle column. */}
        {title && (
          <div className="mt-1.5 max-h-[28dvh] overflow-y-auto overscroll-contain whitespace-pre-wrap text-[15px] font-semibold leading-snug text-foreground">
            {title}
          </div>
        )}
        {subtitle && (
          <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
        )}
      </div>

      {children ? (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3",
            !footer && "pb-3.5",
          )}
        >
          {children}
        </div>
      ) : null}

      {footer && (
        <div className="shrink-0 border-t border-border/60 bg-muted/30 px-4 py-3">
          {footer}
        </div>
      )}

      {bottomSlot}
    </div>
  );
}
