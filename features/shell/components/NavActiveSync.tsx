"use client";

// NavActiveSync — Single source of truth for active navigation state.
//
// Updates data-pathname on .shell-root after every client-side navigation.
// Every nav component (sidebar, dock, mobile sheet, any future component)
// reads active state from this one attribute via CSS selectors:
//
//   .shell-root[data-pathname^="/demos/ssr/chat"] [data-nav-href="/demos/ssr/chat"] { ... }
//
// Zero re-renders. No state. No props. Mounts once, cleans up on unmount.
// This is the ONLY client-side piece needed for the entire navigation system.

import { useEffect } from "react";

function syncNav() {
  const pathname = window.location.pathname;
  const root = document.querySelector<HTMLElement>(".shell-root");
  if (root) root.dataset.pathname = pathname;
}

export default function NavActiveSync() {
  useEffect(() => {
    // Sync on mount — corrects any server/client pathname mismatch
    syncNav();

    // Back / forward navigation
    window.addEventListener("popstate", syncNav);

    // Client-side Link navigation patches pushState
    const originalPushState = history.pushState.bind(history);
    history.pushState = function (...args) {
      originalPushState(...args);
      syncNav();
    };

    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = function (...args) {
      originalReplaceState(...args);
      syncNav();
    };

    return () => {
      window.removeEventListener("popstate", syncNav);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  return null;
}
