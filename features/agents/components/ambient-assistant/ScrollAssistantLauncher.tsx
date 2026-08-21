"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { ScrollAssistantLauncherImplProps } from "./ScrollAssistantLauncherImpl";

const ScrollAssistantLauncherImpl = dynamic<ScrollAssistantLauncherImplProps>(
  () => import("./ScrollAssistantLauncherImpl"),
  {
    ssr: false,
    // A prop-blind loading shell would jump between the two supported heights.
    // Reveal the correctly sized implementation once its chunk is ready.
    loading: () => null,
  },
);

/**
 * Tiny front door for the ambient page assistant. The expensive agent/chat
 * graph is not requested until a desktop user actually scrolls the surface.
 */
export function ScrollAssistantLauncher({
  inputVariant = "single-line",
}: ScrollAssistantLauncherImplProps) {
  const isMobile = useIsMobile();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (isMobile || revealed) return undefined;

    let bottomIntentTimer: ReturnType<typeof setTimeout> | null = null;

    const clearBottomIntent = () => {
      if (!bottomIntentTimer) return;
      clearTimeout(bottomIntentTimer);
      bottomIntentTimer = null;
    };

    const reveal = () => {
      clearBottomIntent();
      setRevealed(true);
    };

    const isNavigationInteraction = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest("aside, [data-slot='sidebar']"));

    const revealOnScroll = (event: Event) => {
      const target = event.target;
      if (isNavigationInteraction(target)) return;
      const offset =
        target instanceof Element ? target.scrollTop : window.scrollY;
      if (offset < 72) return;
      reveal();
    };

    // A no-scroll page still has a deliberate discovery path: dwelling near
    // the bottom edge signals that the user is looking for a page-level action.
    // A brief pass through the zone is ignored, so the launcher never appears
    // merely because the pointer crossed the bottom of the viewport.
    const revealOnBottomIntent = (event: PointerEvent) => {
      if (
        event.pointerType !== "mouse" ||
        isNavigationInteraction(event.target) ||
        event.clientY < window.innerHeight - 96
      ) {
        clearBottomIntent();
        return;
      }
      if (bottomIntentTimer) return;
      bottomIntentTimer = setTimeout(reveal, 600);
    };

    const shellMain = document.querySelector<HTMLElement>(".shell-main");
    window.addEventListener("scroll", revealOnScroll, { passive: true });
    shellMain?.addEventListener("scroll", revealOnScroll, { passive: true });
    document.addEventListener("scroll", revealOnScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("pointermove", revealOnBottomIntent, {
      capture: true,
      passive: true,
    });
    return () => {
      clearBottomIntent();
      window.removeEventListener("scroll", revealOnScroll);
      shellMain?.removeEventListener("scroll", revealOnScroll);
      document.removeEventListener("scroll", revealOnScroll, true);
      document.removeEventListener("pointermove", revealOnBottomIntent, true);
    };
  }, [isMobile, revealed]);

  if (isMobile || !revealed) return null;
  return <ScrollAssistantLauncherImpl inputVariant={inputVariant} />;
}
