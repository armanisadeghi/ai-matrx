"use client";

// components/official/composer/ComposerHint.tsx
//
// The one line that tells a person what Return will do. NOTHING FAILS
// SILENTLY: a composer whose Enter key is a newline must say so, or the
// message just sits there unsent and the screen looks broken (census defect
// D2, 2026-09-12 — reported on the Scout interview panel, where the toggle
// that controls the rule is deliberately hidden).

import { cn } from "@/lib/utils";
import { composerHintText } from "./composerSubmit";

export interface ComposerHintProps {
  submitOnEnter: boolean;
  className?: string;
}

export function ComposerHint({ submitOnEnter, className }: ComposerHintProps) {
  return (
    <span
      className={cn(
        "select-none text-[11px] leading-none text-muted-foreground/70",
        className,
      )}
      data-composer-hint
    >
      {composerHintText(submitOnEnter)}
    </span>
  );
}
