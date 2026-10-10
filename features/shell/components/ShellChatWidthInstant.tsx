"use client";

/**
 * ShellChatWidthInstant — the chat dock never slides the page on a navigation.
 *
 * `.shell-root` animates its first grid track (`transition: grid-template-columns`) so the sidebar's
 * expand/collapse reflows the page smoothly, and the dock (`.shell-chat-dock`) animates its own width.
 * The dock's width rides in that track (`--shell-chat-w`), so a client navigation that opens or closes
 * the dock (/chat/new, which hosts its own chat, to /notes, which docks the shared one) slid the page
 * and the dock for 600ms: a 0.2 layout shift, most of it landing after the input window that excuses a
 * click. For one beat after a route change the root carries `data-shell-instant` (CSS: no transition),
 * so the change lands in the first frame, inside the click's own window. A person toggling the chat on
 * the same page keeps the slide. Renders nothing.
 */

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

const INSTANT_MS = 900;

export default function ShellChatWidthInstant() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>(".shell-root");
    if (!root) return undefined;
    root.setAttribute("data-shell-instant", "");
    const timer = window.setTimeout(() => root.removeAttribute("data-shell-instant"), INSTANT_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
