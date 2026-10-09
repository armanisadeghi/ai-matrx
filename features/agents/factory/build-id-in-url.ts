/**
 * The Agent Factory build the person is watching rides the page address (`?build=<id>`), so a
 * full reload mid-build re-attaches the build view instead of losing it (REGISTER R59). The
 * build itself runs on the server and never depended on the page.
 */

export const BUILD_PARAM = "build";

// The server's build ids are 32 hex characters (dashes optional).
const BUILD_ID = /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The build id in a query string (`?build=…`), or null when absent or not an id. */
export function buildIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(BUILD_PARAM);
  return value && BUILD_ID.test(value) ? value : null;
}

/** `pathname` + `search` with the build id set (replacing an earlier one). */
export function hrefWithBuild(pathname: string, search: string, buildId: string): string {
  const params = new URLSearchParams(search);
  params.set(BUILD_PARAM, buildId);
  return `${pathname}?${params.toString()}`;
}
