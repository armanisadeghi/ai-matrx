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

function syncNav() {
  const pathname = window.location.pathname;
  const root = document.querySelector<HTMLElement>(".shell-root");
  if (root) root.dataset.pathname = pathname;
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
