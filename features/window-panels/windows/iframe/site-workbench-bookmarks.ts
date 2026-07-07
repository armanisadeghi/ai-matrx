/**
 * Built-in + user bookmarks for Site Workbench.
 * System entries are always shown; user entries live in
 * `userPreferences.siteWorkbench.bookmarks` (synced).
 */

export interface SiteWorkbenchBookmark {
  id: string;
  label: string;
  url: string;
}

export const SYSTEM_SITE_WORKBENCH_BOOKMARKS: ReadonlyArray<SiteWorkbenchBookmark> =
  [
    {
      id: "system-lucide",
      label: "Lucide Icons",
      url: "https://lucide.dev/icons/",
    },
    {
      id: "system-tailwind",
      label: "Tailwind CSS",
      url: "https://tailwindcss.com/docs",
    },
    {
      id: "system-mdn",
      label: "MDN Web Docs",
      url: "https://developer.mozilla.org/",
    },
    {
      id: "system-matrx",
      label: "Matrx",
      url: "https://aimatrx.com",
    },
  ] as const;

export const SITE_WORKBENCH_DEFAULT_URL =
  SYSTEM_SITE_WORKBENCH_BOOKMARKS[0]?.url ?? "https://lucide.dev/icons/";

export const SITE_WORKBENCH_USER_BOOKMARKS_MAX = 25;

const SYSTEM_IDS = new Set(
  SYSTEM_SITE_WORKBENCH_BOOKMARKS.map((bookmark) => bookmark.id),
);

export function isSystemSiteWorkbenchBookmark(id: string): boolean {
  return SYSTEM_IDS.has(id);
}

export function mergeSiteWorkbenchBookmarks(
  userBookmarks: SiteWorkbenchBookmark[],
): SiteWorkbenchBookmark[] {
  const userUrls = new Set<string>();
  const dedupedUser: SiteWorkbenchBookmark[] = [];
  for (const bookmark of userBookmarks) {
    if (!bookmark?.id || !bookmark.label || !bookmark.url) continue;
    if (userUrls.has(bookmark.url)) continue;
    userUrls.add(bookmark.url);
    dedupedUser.push(bookmark);
  }
  return [...SYSTEM_SITE_WORKBENCH_BOOKMARKS, ...dedupedUser];
}

export function parseSiteWorkbenchUserBookmarks(
  raw: unknown,
): SiteWorkbenchBookmark[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is SiteWorkbenchBookmark =>
      !!row &&
      typeof row === "object" &&
      typeof (row as SiteWorkbenchBookmark).id === "string" &&
      typeof (row as SiteWorkbenchBookmark).label === "string" &&
      typeof (row as SiteWorkbenchBookmark).url === "string" &&
      !isSystemSiteWorkbenchBookmark((row as SiteWorkbenchBookmark).id),
  );
}
