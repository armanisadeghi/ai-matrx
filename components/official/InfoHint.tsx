// components/official/InfoHint.tsx
//
// THE DEFINITION HINT — a small info icon beside a label that reveals one
// sentence defining it. Use it wherever a label needs a definition
// (`common-docs/policies/interface-text-is-layout.md`: definitions live behind
// an info icon, never in visible prose). Model: Stripe dashboard metric labels.
//
// Reachable three ways, which a native `title=` is not:
// - mouse: hover opens the tooltip;
// - keyboard: the icon is a real button, so Tab focus opens the tooltip and
//   Escape closes it;
// - touch (`pointer: coarse` or a phone-width viewport): tap toggles a small
//   popover; outside tap or Escape closes it.
//
// Safe inside a link or clickable row (KpiTile with `href`): the trigger and
// the portaled content both stop propagation and prevent the default, so
// opening a definition never navigates.
//
// The icon's hit area is ≥ 24px (44px on a coarse pointer) via an absolutely positioned pseudo-element,
// so the glyph sits inline without changing the surrounding line height.
// Text budget: one sentence, ≤ 140 characters.

"use client";

import { Info } from "lucide-react";
import { useState, useSyncExternalStore, type SyntheticEvent } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { cn } from "@/lib/utils";

const COARSE_POINTER_QUERY = "(pointer: coarse)";

function subscribeCoarse(onChange: () => void) {
  const mq = window.matchMedia(COARSE_POINTER_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useCoarsePointer() {
  return useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE_POINTER_QUERY).matches,
    () => false,
  );
}

/** Keep a hint's clicks from reaching a parent link, row, or card. */
function isolate(e: SyntheticEvent) {
  e.stopPropagation();
  e.preventDefault();
}

export interface InfoHintProps {
  /** The definition: one sentence, ≤ 140 characters. */
  text: string;
  /** Accessible name of the icon button. */
  label?: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

const TRIGGER_CLASS =
  "relative inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center rounded-sm align-[-0.125em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring before:absolute before:-inset-[5px] before:content-[''] [@media(pointer:coarse)]:before:-inset-[15px]";

const CONTENT_CLASS =
  "max-w-[16rem] text-xs font-normal normal-case leading-snug tracking-normal";

export function InfoHint({ text, label = "More info", className, side = "top" }: InfoHintProps) {
  const coarse = useCoarsePointer();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const glyph = <Info aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />;

  if (coarse || isMobile) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className={cn(TRIGGER_CLASS, className)}
            onClick={(e) => {
              isolate(e);
              setOpen((v) => !v);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {glyph}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side={side}
          sideOffset={6}
          className={cn("w-auto px-3 py-2 text-popover-foreground", CONTENT_CLASS)}
          onClick={isolate}
          onPointerDown={(e) => e.stopPropagation()}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {text}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    // Brings its own provider: an official component works wherever it is imported (a
    // test, a portal, a page without the app shell) — 2026-09-30, final-switch tests.
    <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(TRIGGER_CLASS, className)}
          onClick={isolate}
        >
          {glyph}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className={CONTENT_CLASS} onClick={isolate}>
        {text}
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}

export default InfoHint;
