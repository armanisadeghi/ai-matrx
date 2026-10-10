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
 * the same page keeps the slide.
 *
 * The page change itself (a domain panel's 240px giving way to a 440px dock) is a real layout change, and
 * it lands when the new route commits: a cold chunk fetch or a slow server puts that past the 500ms
 * after the click that excuses a shift (member /chat/new to /notes: 0.11 in 3 of 8 runs). So on the
 * click of an in-app link the shell's first track is set to the target page's own width straight away
 * (`data-shell-nav-pending`, from the same cookies the server reads), and the commit changes nothing.
 * Renders nothing.
 */

import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { isDomainPanelPath } from "@/features/shell/constants/route-menu-registry";
import {
  CANVAS_CHAT_SIZES,
  CANVAS_PANEL_IDS,
  canvasChatCookieName,
  parseCanvasChatCookie,
} from "@ai-matrx/chat/canvas/workspace/workspace-cookies";
import { SHELL_CHAT_WIDE_QUERY, shellChatHome, shellChatHostedElsewhere } from "@ai-matrx/chat/canvas/workspace/shell-chat-route";
import { readSidePanelWidthClient } from "@ai-matrx/chat/ui/side-panel-width";

const INSTANT_MS = 900;
const PENDING_MS = 4000;

function cookie(name: string): string | undefined {
  const hit = document.cookie.split("; ").find((p) => p.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}

/** The dock width (px) the target page reserves in its first paint, or null when that cannot be known here. */
function targetDockWidth(path: string): number | null {
  if (window.innerWidth < 1024) return null;
  if (shellChatHostedElsewhere(path)) return 0;
  const home = shellChatHome(path, true);
  const raw = cookie(canvasChatCookieName(home.layoutId));
  const open =
    raw === undefined
      ? (home.defaultOpen ?? window.matchMedia(SHELL_CHAT_WIDE_QUERY).matches)
      : parseCanvasChatCookie(raw, true).open && parseCanvasChatCookie(raw, true).placement === "side";
  return open ? readSidePanelWidthClient(CANVAS_PANEL_IDS.chat, CANVAS_CHAT_SIZES) : 0;
}

function onLinkClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
  const root = document.querySelector<HTMLElement>(".shell-root");
  const toggle = document.getElementById("shell-sidebar-toggle") as HTMLInputElement | null;
  if (!root || !toggle || root.hasAttribute("data-no-sidebar")) return;
  // Only a target whose first track is the strip + the dock is predictable: a non-panel page, reached with
  // the sidebar in the state it will have there (a domain panel folds away; an open plain sidebar stays).
  if (isDomainPanelPath(url.pathname)) return;
  const panelHere = root.hasAttribute("data-domain-panel");
  if (!panelHere && toggle.checked) return;
  const width = targetDockWidth(url.pathname);
  if (width === null) return;
  root.style.setProperty("--shell-nav-chat-w", `${width}px`);
  root.setAttribute("data-shell-nav-pending", "");
  window.setTimeout(clearPending, PENDING_MS);
}

function clearPending() {
  const root = document.querySelector<HTMLElement>(".shell-root");
  root?.removeAttribute("data-shell-nav-pending");
  root?.style.removeProperty("--shell-nav-chat-w");
}

export default function ShellChatWidthInstant() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.querySelector<HTMLElement>(".shell-root");
    if (!root) return undefined;
    root.setAttribute("data-shell-instant", "");
    const timer = window.setTimeout(() => root.removeAttribute("data-shell-instant"), INSTANT_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    document.addEventListener("click", onLinkClick, true);
    return () => document.removeEventListener("click", onLinkClick, true);
  }, []);

  useEffect(() => {
    // The route has committed: the dock publishes its own width (--shell-chat-w) in its effects; the
    // stand-in steps aside once that has landed, never before (clearing early would drop the track).
    const root = document.querySelector<HTMLElement>(".shell-root");
    if (!root?.hasAttribute("data-shell-nav-pending")) return undefined;
    const timer = window.setTimeout(clearPending, INSTANT_MS + 600);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
