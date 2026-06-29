"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Several Filerobot tabs hide their primary action in the bottom tool bar —
 * e.g. selecting "Watermark" doesn't add a watermark, it reveals an "Add
 * watermark" button below the canvas that's easy to miss. This component
 * watches the active Filerobot tab and floats an attention-grabbing hint
 * just above the tool bar pointing at the action the user needs to take.
 *
 * Tabs whose effect is immediate (Filters apply on click; Finetune shows
 * sliders inline) get no hint. The hint auto-dismisses after a few seconds
 * and won't re-show for a tab the user has already acted on in this session.
 */
const TAB_HINTS: Record<string, string> = {
  Annotate:
    "Pick a tool in the bar below — pen, shapes, text, or image — then draw on the image.",
  Watermark:
    'Click "Add watermark" in the bar below to drop in text or an image watermark.',
};

interface Props {
  canvasAreaRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function EditorTabHint({ canvasAreaRef }: Props) {
  const [hint, setHint] = useState<{ tab: string; text: string } | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const area = canvasAreaRef.current;
    if (!area) return undefined;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const checkActiveTab = () => {
      const tabs = area.querySelectorAll<HTMLElement>(".FIE_tab");
      let activeLabel: string | null = null;
      tabs.forEach((t) => {
        if (t.getAttribute("aria-selected") === "true") {
          activeLabel = (t.textContent || "").trim();
        }
      });
      if (
        activeLabel &&
        TAB_HINTS[activeLabel] &&
        !dismissedRef.current.has(activeLabel)
      ) {
        setHint({ tab: activeLabel, text: TAB_HINTS[activeLabel] });
        clearTimer();
        timerRef.current = setTimeout(() => setHint(null), 7000);
      } else {
        setHint(null);
      }
    };

    const observer = new MutationObserver(checkActiveTab);
    observer.observe(area, {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-selected"],
    });
    // Initial check (in case a hint-worthy tab is already active).
    checkActiveTab();

    return () => {
      observer.disconnect();
      clearTimer();
    };
  }, [canvasAreaRef]);

  if (!hint) return null;

  const dismiss = () => {
    dismissedRef.current.add(hint.tab);
    setHint(null);
  };

  return (
    <div
      className={cn(
        "absolute bottom-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5",
        "max-w-md rounded-lg border border-primary/30 bg-card px-3 py-2 shadow-lg",
        "animate-in fade-in slide-in-from-bottom-2 duration-300",
      )}
      role="status"
    >
      <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-xs text-foreground leading-snug">{hint.text}</span>
      <ArrowDown className="h-4 w-4 shrink-0 text-primary animate-bounce" />
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent"
        aria-label="Dismiss hint"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
