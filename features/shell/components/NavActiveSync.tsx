"use client";

// NavActiveSync — Single source of truth for active navigation state.
//
// Updates data-pathname on .shell-root after every client-side navigation.
// Every nav component (sidebar, dock, mobile sheet, any future component)
// reads active state from this one attribute via CSS selectors:
//
//   .shell-root[data-pathname^="/demos/chat"] [data-nav-href="/demos/chat"] { ... }
//
// It listens on the three signals that can move the URL, so it never has to
// monkey-patch the global History API (which it used to — a process-wide
// mutation that stacked if two shells ever mounted, and hid every write from
// the url-state gate):
//
//   1. `usePathname()`      — every Link / router navigation.
//   2. `popstate`           — Back / Forward.
//   3. `matrx:url-state`    — the event `commitUrlParams` fires, which is how
//                             every URL write that bypasses the Next router is
//                             required to announce itself (see
//                             `pnpm check:url-state`). `navigateFilesFolderPath`
//                             is the one pathname-level writer that needs it.
//
// The component renders null, so the pathname subscription costs one no-op
// re-render of this node and nothing else in the tree.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isUserSettingsPath } from "@/features/settings/route-shell/settings-route-path";
import { isDomainPanelPath } from "@/features/shell/constants/route-menu-registry";
import {
  SHELL_DOMAIN_PANEL_COOKIE,
  SHELL_SIDEBAR_COOKIE,
  shellToggleChecked,
} from "@/features/shell/constants/sidebar-cookie";

function readCookie(name: string): string | undefined {
  const hit = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}

function syncNav() {
  const pathname = window.location.pathname;
  const root = document.querySelector<HTMLElement>(".shell-root");
  if (!root) return;

  root.dataset.pathname = pathname;
  if (isUserSettingsPath(pathname)) {
    root.setAttribute("data-settings-route", "");
  } else {
    root.removeAttribute("data-settings-route");
  }
  // Crossing into or out of a domain-panel family hands the sidebar checkbox
  // to the other remembered state (the panel's, or the main sidebar's).
  const panel = isDomainPanelPath(pathname);
  if (root.hasAttribute("data-domain-panel") !== panel) {
    root.toggleAttribute("data-domain-panel", panel);
    const toggle = document.getElementById("shell-sidebar-toggle") as HTMLInputElement | null;
    if (toggle) {
      const next = shellToggleChecked(
        panel,
        readCookie(SHELL_SIDEBAR_COOKIE) === "1",
        readCookie(SHELL_DOMAIN_PANEL_COOKIE),
      );
      if (toggle.checked !== next) {
        toggle.checked = next;
        // Listeners (useSidebarExpanded) follow; the cookie writer re-saves the same value.
        toggle.dispatchEvent(new Event("change"));
      }
    }
  }
}

export default function NavActiveSync() {
  const pathname = usePathname();

  // Router navigations, plus the mount pass that corrects any server/client
  // pathname mismatch.
  useEffect(() => {
    syncNav();
  }, [pathname]);

  // Back/forward, and URL writes that go around the router.
  useEffect(() => {
    window.addEventListener("popstate", syncNav);
    window.addEventListener("matrx:url-state", syncNav);
    return () => {
      window.removeEventListener("popstate", syncNav);
      window.removeEventListener("matrx:url-state", syncNav);
    };
  }, []);

  return null;
}
