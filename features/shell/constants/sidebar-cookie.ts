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

/**
 * A domain panel's open/closed (route-menu-registry `layout: "panel"`), kept
 * apart from the main sidebar's: on a panel family the sidebar checkbox means
 * "panel open", and toggling it there must never change the main sidebar a
 * person chose everywhere else. "0" = closed; absent = open.
 */
export const SHELL_DOMAIN_PANEL_COOKIE = "shell:domain-panel-open";

/** The checkbox state a page should open with, from the two cookies' raw values. */
export function shellToggleChecked(
  domainPanel: boolean,
  sidebarExpanded: boolean,
  panelCookie: string | undefined,
): boolean {
  return domainPanel ? panelCookie !== "0" : sidebarExpanded;
}
