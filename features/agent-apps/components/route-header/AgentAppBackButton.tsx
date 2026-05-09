"use client";

import { ChevronLeft } from "lucide-react";
import { useSmartBack } from "@/features/agent-apps/hooks/useSmartBack";

interface AgentAppBackButtonProps {
  /** Where to land if there's no usable browser history. */
  fallbackHref: string;
  /** Accessible label. */
  label?: string;
}

/**
 * Tap-target back button used in /agent-apps/[id] sub-route headers.
 *
 * Clicking calls `router.back()` so the user lands on whatever they came
 * from — preserving the previous page's filter URL state, scroll position,
 * etc. If the browser history is empty (deep link entry), falls back to
 * `fallbackHref` so the user never gets stuck.
 *
 * Mirrors the `<ChevronLeftTapButton>` look & feel without taking an href.
 */
export function AgentAppBackButton({
  fallbackHref,
  label = "Back",
}: AgentAppBackButtonProps) {
  const goBack = useSmartBack(fallbackHref);
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-95"
    >
      <ChevronLeft className="w-4 h-4" />
    </button>
  );
}
