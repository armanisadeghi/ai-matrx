/**
 * URL ↔ settings-tab-id translation. Tab ids in the registry use
 * dot-notation + camelCase ("ai.textGeneration"); URL segments use slashes +
 * kebab-case ("/user-settings/ai/text-generation"). This module is the only
 * translation point.
 */

/**
 * Base URL for the new route-driven settings surface. Lives at `/user-settings`
 * during migration so it can coexist with the legacy `/settings/*` standalone
 * pages and the live `userPreferencesWindow` overlay. Once the overlay is
 * retired this should be renamed to `/settings`.
 */
export const SETTINGS_BASE = "/user-settings";

const kebabToCamel = (s: string): string =>
  s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const camelToKebab = (s: string): string =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** Convert URL path segments (from a catch-all route) into a tab id. */
export function urlToTabId(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) return "";
  return segments.filter(Boolean).map(kebabToCamel).join(".");
}

/** Build the href for a tab id. */
export function tabIdToHref(
  basePath: string,
  tabId: string | null | undefined,
): string {
  if (!tabId) return basePath;
  const slug = tabId.split(".").map(camelToKebab).join("/");
  return `${basePath}/${slug}`;
}
