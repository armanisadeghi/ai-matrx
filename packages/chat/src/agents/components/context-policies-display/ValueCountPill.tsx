"use client";

/**
 * ValueCountPill — the compact face of a sent message's value group: icon +
 * count ("5 sent"). Same height and shape as the composer's row pills.
 *
 * It carries NO generic word: never "Context" (Arman, 2026-10-01: "If the best
 * word you can come up with is context, then you should not have any text at
 * all"). A real name, when the caller has one, goes in `name`.
 */

import { forwardRef, type ComponentType } from "react";
import { cn } from "@ai-matrx/design-system";

export interface ValueCountPillProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ComponentType<{ className?: string }>;
  /** The count text — "5 sent", "13". */
  text: string;
  /** The group's real name, when there is one. */
  name?: string;
  warn?: boolean;
}

export const ValueCountPill = forwardRef<HTMLButtonElement, ValueCountPillProps>(
  function ValueCountPill(
    { icon: Icon, text, name, warn, className, type = "button", ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "inline-flex h-6 max-w-[12rem] shrink-0 items-center gap-1 rounded-md border bg-card px-1.5",
          "text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          "pointer-coarse:relative pointer-coarse:after:absolute pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:inset-x-0 pointer-coarse:after:content-['']",
          warn ? "border-warning/60 text-warning" : "border-border",
          className,
        )}
        {...props}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {name ? <span className="min-w-0 truncate text-foreground">{name}</span> : null}
        <span className="shrink-0 tabular-nums">{text}</span>
      </button>
    );
  },
);
