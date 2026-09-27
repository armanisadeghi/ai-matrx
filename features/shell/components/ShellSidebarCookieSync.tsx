"use client";

/**
 * ShellSidebarCookieSync — persistence island for the CSS-driven sidebar.
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

    const write = () => {
      document.cookie =
        `${SHELL_SIDEBAR_COOKIE}=${toggle.checked ? "1" : "0"}` +
        `; path=/; max-age=${SHELL_SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
    };

    toggle.addEventListener("change", write);
    return () => toggle.removeEventListener("change", write);
  }, []);

  return null;
}
