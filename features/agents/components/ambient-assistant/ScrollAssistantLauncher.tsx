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

    const isNavigationScroll = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest("aside, [data-slot='sidebar']"));

    const revealOnScroll = (event: Event) => {
      const target = event.target;
      if (isNavigationScroll(target)) return;
      const offset =
        target instanceof Element ? target.scrollTop : window.scrollY;
      if (offset < 72) return;
      setRevealed(true);
    };

    // Some app-shell surfaces are compositor-scrolled. Their visual offset can
    // move before a DOM `scroll` event reaches React (notably feature landing
    // pages), while the user's wheel intent is still delivered synchronously.
    const revealOnWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 8 || isNavigationScroll(event.target))
        return;
      setRevealed(true);
    };

    const shellMain = document.querySelector<HTMLElement>(".shell-main");
    window.addEventListener("scroll", revealOnScroll, { passive: true });
    shellMain?.addEventListener("scroll", revealOnScroll, { passive: true });
    document.addEventListener("scroll", revealOnScroll, {
      capture: true,
      passive: true,
    });
    document.addEventListener("wheel", revealOnWheel, {
      capture: true,
      passive: true,
    });
    return () => {
      window.removeEventListener("scroll", revealOnScroll);
      shellMain?.removeEventListener("scroll", revealOnScroll);
      document.removeEventListener("scroll", revealOnScroll, true);
      document.removeEventListener("wheel", revealOnWheel, true);
    };
  }, [isMobile, revealed]);

  if (isMobile || !revealed) return null;
  return <ScrollAssistantLauncherImpl inputVariant={inputVariant} />;
}
