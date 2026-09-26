"use client";

/**
 * ShellSidebarCookieSync — persistence island for the CSS-driven sidebar, and
 * the mirror of its checkbox onto `.shell-root[data-sidebar-expanded]`.
 *
 * The sidebar expand/collapse is a pure-CSS checkbox (`#shell-sidebar-toggle`)
 * with no React state, so there's nothing for Redux/sync to hook into. This
 * tiny island simply mirrors the checkbox's state into a cookie on every
 * toggle. The server layout reads that cookie back via `readSidebarExpandedCookie`
 * and seeds `defaultChecked`, so the next load paints in the saved state with
 * no flash. Renders nothing.
 */

import { useEffect } from "react";
import {
  SHELL_SIDEBAR_COOKIE,
  SHELL_SIDEBAR_COOKIE_MAX_AGE,
} from "@/features/shell/constants/sidebar-cookie";

export default function ShellSidebarCookieSync() {
  useEffect(() => {
    const toggle = document.getElementById(
      "shell-sidebar-toggle",
    ) as HTMLInputElement | null;
    if (!toggle) return undefined;

    // The shell's own grid reads the state from .shell-root[data-sidebar-expanded]
    // (styles/shell.css § 3: a :has() on .shell-root re-checked the whole app on
    // every DOM insertion). The server renders it from the same cookie; this
    // keeps it true on every toggle.
    const root = toggle.closest(".shell-root");
    const mirror = () => root?.toggleAttribute("data-sidebar-expanded", toggle.checked);
    mirror();

    const write = () => {
      mirror();
      document.cookie =
        `${SHELL_SIDEBAR_COOKIE}=${toggle.checked ? "1" : "0"}` +
        `; path=/; max-age=${SHELL_SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
    };

    toggle.addEventListener("change", write);
    return () => toggle.removeEventListener("change", write);
  }, []);

  return null;
}
