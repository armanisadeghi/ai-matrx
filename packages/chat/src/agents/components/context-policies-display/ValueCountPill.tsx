"use client";

/**
 * ValueCountPill — the compact face of a sent message's value group: icon +
 * count ("5 sent"). The one 28px control (Button outline).
 *
 * It carries NO generic word: never "Context" (Arman, 2026-10-01: "If the best
 * word you can come up with is context, then you should not have any text at
 * all"). A real name, when the caller has one, goes in `name`.
 */

import { forwardRef, type ComponentType } from "react";
import { Button } from "@ai-matrx/design-system/controls";

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
      <Button
        ref={ref}
        type={type}
        variant="outline"
        tone={warn ? "warning" : undefined}
        icon={<Icon />}
        className={className}
        {...props}
      >
        {name ? `${name} · ${text}` : text}
      </Button>
    );
  },
);
