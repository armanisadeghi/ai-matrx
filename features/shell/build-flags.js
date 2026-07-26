/**
 * TEMP build A/B flags for the shell. Shared by next.config.js (resolve aliases)
 * and AppShell (layout `data-no-sidebar`). Flip back to false after the test.
 *
 * FORCE_EXCLUDE_SIDEMENU — alias Sidebar / MobileSideSheet / MobileDock /
 * ShellSidebarCookieSync to empty stubs so those module graphs stay out of the
 * compile; AppShell also stamps data-no-sidebar so the grid goes full-bleed.
 */
module.exports = {
  FORCE_EXCLUDE_SIDEMENU: false,
};
