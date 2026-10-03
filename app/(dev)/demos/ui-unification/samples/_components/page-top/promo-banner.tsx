"use client";

/**
 * PromoBanner — the page-top variant that promotes ONE feature (owner,
 * 2026-10-03, feedback item 3: "the kits page has the concept; its pill, title
 * and description run too long").
 *
 * The kits hero spent ~330px on an eyebrow pill, a 44px headline, a three-line
 * paragraph, a chip row and a glass side card. This keeps the concept — one
 * named next move, the evidence behind it, one button — in a single bordered
 * row about 56px tall:
 *
 *   [disc]  EYEBROW · Title (13px)                        [chips]  [Action]
 *           one line (12px, ≤60 chars)
 *
 * - The eyebrow is 11px meta text, never a pill.
 * - The title is one line at 13px/600; the line is one line at 12px.
 * - Chips are the outline badge (11px, 18px tall), never pills.
 * - The action is the 28px one control (`uc-btn`), so it must render inside
 *   `SampleScale` / `Scale` like every sample.
 * - Phone: the chips wrap under the text and the action stretches full width.
 *
 * One surface level: a bordered card with a faint tint from the left — never a
 * card inside a card, never glass (glass only floats).
 */

import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type PromoTone = "primary" | "success" | "warning" | "info";

const TONE: Record<PromoTone, { disc: string; wash: string; eyebrow: string }> = {
  primary: { disc: "bg-primary/10 text-primary", wash: "from-primary/[0.07]", eyebrow: "text-primary" },
  success: { disc: "bg-success/10 text-success", wash: "from-success/[0.07]", eyebrow: "text-success" },
  warning: { disc: "bg-warning/15 text-warning", wash: "from-warning/[0.08]", eyebrow: "text-warning" },
  info: { disc: "bg-info/10 text-info", wash: "from-info/[0.07]", eyebrow: "text-info" },
};

export interface PromoBannerProps {
  icon: LucideIcon;
  /** 11px label before the title, e.g. "Next challenge". Never a pill. */
  eyebrow?: string;
  /** One line, 13px. */
  title: ReactNode;
  /** One line, 12px, ≤60 characters. Omit rather than pad. */
  line?: ReactNode;
  /** Outline chips (`ToneBadge`) — the evidence behind the promo. */
  chips?: ReactNode;
  /** The one action: a 28px `uc-btn` (link or button). */
  action?: ReactNode;
  tone?: PromoTone;
  className?: string;
  /** Accessible name of the region. Defaults to the eyebrow. */
  ariaLabel?: string;
}

export function PromoBanner({
  icon: Icon,
  eyebrow,
  title,
  line,
  chips,
  action,
  tone = "primary",
  className,
  ariaLabel,
}: PromoBannerProps) {
  const t = TONE[tone];
  return (
    <section
      aria-label={ariaLabel ?? eyebrow ?? "Featured"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-card bg-gradient-to-r to-transparent py-2 pl-3 pr-[9px]",
        t.wash,
        className,
      )}
    >
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", t.disc)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex min-w-0 items-baseline gap-1.5">
          {eyebrow ? (
            <span className={cn("shrink-0 text-[0.6875rem] font-medium", t.eyebrow)}>{eyebrow}</span>
          ) : null}
          {eyebrow ? <span className="shrink-0 text-[0.6875rem] text-muted-foreground" aria-hidden>·</span> : null}
          <span className="truncate text-[0.8125rem] font-semibold leading-5 text-foreground">{title}</span>
        </div>
        {line ? <div className="truncate text-xs leading-4 text-muted-foreground">{line}</div> : null}
      </div>
      {chips ? <div className="flex flex-wrap items-center gap-1.5 max-sm:basis-full max-sm:pl-11">{chips}</div> : null}
      {action ? (
        <div className="uc-row shrink-0 max-sm:basis-full max-sm:[&>*]:flex-1" style={{ flexWrap: "nowrap" }}>
          {action}
        </div>
      ) : null}
    </section>
  );
}
