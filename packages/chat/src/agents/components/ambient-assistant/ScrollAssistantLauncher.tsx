"use client";

import { ScrollAssistantLauncherImpl, ScrollVoiceAssistantLauncherImpl } from "../../../next/lazy/ScrollAssistantLaunchers";
import { usePathname } from "../../../host/navigation";
import { useEffect, useState } from "react";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import type { ScrollAssistantLauncherImplProps } from "./ScrollAssistantLauncherImpl";
import { useAmbientAssistantSuppressed } from "./ambientAssistantSuppression";

export interface ScrollAssistantLauncherProps {
  inputVariant?: "single-line" | "multiline" | "text-voice";
  /** Exact routes whose natural-height content can safely host the dock. */
  includePathnames?: readonly string[];
}

/**
 * A scroll (or a pointer dwell) that belongs to something floating OVER the page — a dialog, a
 * window panel, a menu or popover — is not the person scrolling the page.
 * The reveal listens in the capture phase (it must hear the shell's own
 * scroller), so without this a shortcut's window streaming its reply
 * (auto-scrolling its transcript), or a pointer resting on its composer near
 * the bottom edge, revealed the page assistant's chat dock
 * behind it, and it stayed after the window closed (blind run PB-03, /notes,
 * 2026-10-01).
 */
const FLOATING_SCROLLER =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-window-panel], [data-radix-popper-content-wrapper], [data-slot="dialog-overlay"], .ambient-assistant-dock';

export function isOnFloatingSurface(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(FLOATING_SCROLLER));
}

/**
 * Tiny front door for the ambient page assistant. The expensive agent/chat
 * graph is not requested until a desktop user actually scrolls the surface.
 * Its scrolling host uses `scroll-page-end-space`; the fixed implementation
 * uses `ambient-assistant-dock` so overlay keyboards cannot cover the input.
 */
export function ScrollAssistantLauncher({
  inputVariant = "single-line",
  includePathnames,
}: ScrollAssistantLauncherProps) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [revealed, setRevealed] = useState(false);
  // A page holding the screen/mic (a FastFire drill) keeps the dock away.
  const suppressed = useAmbientAssistantSuppressed();
  const isIncludedPath =
    !suppressed && (!includePathnames || includePathnames.includes(pathname));

  useEffect(() => {
    if (!isIncludedPath || isMobile || revealed) return undefined;

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
      if (isNavigationInteraction(target) || isOnFloatingSurface(target)) return;
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
        isOnFloatingSurface(event.target) ||
        event.clientY < window.innerHeight - 96
      ) {
        clearBottomIntent();
        return;
      }
      if (bottomIntentTimer) return;
      bottomIntentTimer = setTimeout(reveal, 600);
    };

    const clearBottomIntentOnPointerExit = (event: PointerEvent) => {
      if (!event.relatedTarget) clearBottomIntent();
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
    document.addEventListener("pointerout", clearBottomIntentOnPointerExit, {
      capture: true,
      passive: true,
    });
    window.addEventListener("blur", clearBottomIntent);
    return () => {
      clearBottomIntent();
      window.removeEventListener("scroll", revealOnScroll);
      shellMain?.removeEventListener("scroll", revealOnScroll);
      document.removeEventListener("scroll", revealOnScroll, true);
      document.removeEventListener("pointermove", revealOnBottomIntent, true);
      document.removeEventListener(
        "pointerout",
        clearBottomIntentOnPointerExit,
        true,
      );
      window.removeEventListener("blur", clearBottomIntent);
    };
  }, [isIncludedPath, isMobile, revealed]);

  if (!isIncludedPath || isMobile || !revealed) return null;
  if (inputVariant === "text-voice") {
    return <ScrollVoiceAssistantLauncherImpl />;
  }
  return <ScrollAssistantLauncherImpl inputVariant={inputVariant} />;
}
