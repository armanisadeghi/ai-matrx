/**
 * URL ↔ settings-tab-id translation. Tab ids in the registry use
 * dot-notation + camelCase ("ai.textGeneration"); URL segments use slashes +
 * kebab-case ("/user-settings/ai/text-generation"). This module is the only
 * translation point.
 */

/**
 * Base URL for the route-driven settings surface. The legacy `/settings/*`
 * pages are retired (2026-10-01) and their URLs are 307 config redirects here
 * (utils/next-config/legacySettingsRedirects.js — never 308, so a later rename
 * of this base back to `/settings` cannot meet a browser-cached loop).
 */
export const SETTINGS_BASE = "/user-settings";

const kebabToCamel = (s: string): string =>
  s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

const camelToKebab = (s: string): string =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/**
 * Tabs removed by the settings truth sweep (2026-09-25/26) → where their one
 * remaining truth lives. A bookmarked or linked old address opens the
 * replacement instead of an empty "choose a setting" page.
 */
export const RETIRED_TAB_IDS: Readonly<Record<string, string>> = {
  "appearance.accent": "appearance.theme",
  "appearance.layout": "appearance.theme",
  "voice.tts": "voice.voices",
};

/** Convert URL path segments (from a catch-all route) into a tab id. */
export function urlToTabId(segments: string[] | undefined): string {
  if (!segments || segments.length === 0) return "";
  const id = segments.filter(Boolean).map(kebabToCamel).join(".");
  return RETIRED_TAB_IDS[id] ?? id;
}

/** Build the href for a tab id. */
export function tabIdToHref(
  basePath: string,
  tabId: string | null | undefined,
): string {
  // The first screen IS the index — it has no path of its own.
  if (!tabId || tabId === "firstScreen") return basePath;
  const slug = tabId.split(".").map(camelToKebab).join("/");
  return `${basePath}/${slug}`;
}
