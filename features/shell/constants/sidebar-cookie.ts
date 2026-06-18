/**
 * features/shell/constants/sidebar-cookie.ts
 *
 * Shared constants for persisting the shell left-sidebar expanded/collapsed
 * state in a cookie. Kept framework-agnostic (no next/headers, no "use client")
 * so it can be imported by both the server reader and the client write island.
 *
 * "1" = expanded, "0" / absent = collapsed (the CSS default).
 */

export const SHELL_SIDEBAR_COOKIE = "shell:sidebar-expanded";

/** One year, matching the other shell/files preference cookies. */
export const SHELL_SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
