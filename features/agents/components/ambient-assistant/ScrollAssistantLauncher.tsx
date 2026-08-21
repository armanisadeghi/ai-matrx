"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const ScrollAssistantLauncherImpl = dynamic(
  () => import("./ScrollAssistantLauncherImpl"),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className="pointer-events-none fixed bottom-5 left-1/2 z-[35] h-9 w-[min(380px,calc(100vw-2rem))] -translate-x-1/2 animate-pulse rounded-xl bg-card/55 shadow-sm backdrop-blur-md"
      />
    ),
  },
);

/**
 * Tiny front door for the ambient page assistant. The expensive agent/chat
 * graph is not requested until a desktop user actually scrolls the surface.
 */
export function ScrollAssistantLauncher() {
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
      if (Math.abs(event.deltaY) < 8 || isNavigationScroll(event.target)) return;
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
  return <ScrollAssistantLauncherImpl />;
}
