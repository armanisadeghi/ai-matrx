"use client";

/**
 * NewTabLink — THE box-with-arrow (lucide `ExternalLink`) control.
 *
 * Arman, 2026-09-26: the ExternalLink icon means ONE thing platform-wide —
 * "open this in a new tab". It was being drawn on same-tab links and rendered
 * disabled beside names that had nothing to open. So the icon has one home:
 *
 *   - it is always a real anchor with `target="_blank"` + `rel="noopener
 *     noreferrer"` (modified clicks and middle-clicks stay native);
 *   - it is never disabled — with no `href` it renders NOTHING;
 *   - it stops propagation, so it is safe inside clickable rows and cards.
 *
 * A same-tab "open" uses `ArrowUpRight` (see `EntityDoorControls`), never this
 * icon. The Lightbulb means Peek. Guard: `pnpm check:new-tab-icon`.
 */

import React from "react";
import { ExternalLink } from "lucide-react";
import { AppLink } from "@/components/navigation/AppLink";
import { cn } from "@/lib/utils";

export const NEW_TAB_CONTROL_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground " +
  "transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none " +
  "focus-visible:ring-1 focus-visible:ring-ring";

export interface NewTabLinkProps {
  /** Where the new tab goes. Absent/empty → the control is absent. */
  href: string | null | undefined;
  /** What opens, for the tooltip and screen readers ("Deep Research"). */
  label: string;
  className?: string;
  iconClassName?: string;
  /** Text beside the icon ("New tab"). Icon-only when omitted. */
  children?: React.ReactNode;
}

export function NewTabLink({
  href,
  label,
  className,
  iconClassName,
  children,
}: NewTabLinkProps) {
  if (!href) return null;
  const words = `Open ${label} in a new tab`;
  return (
    <AppLink
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      prefetch={false}
      data-tap-target
      onClick={(event) => event.stopPropagation()}
      title={words}
      aria-label={children ? undefined : words}
      className={cn(children ? "inline-flex items-center gap-1.5" : NEW_TAB_CONTROL_CLASS, className)}
    >
      <ExternalLink className={cn("h-3.5 w-3.5", iconClassName)} aria-hidden />
      {children}
    </AppLink>
  );
}
