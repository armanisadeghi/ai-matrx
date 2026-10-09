/**
 * Social profile links found on a competitor's website.
 *
 * "Find their socials" scrapes the competitor's home page through the existing scraper
 * (`/scraper/quick-scrape`, `get_links`) and reads every URL in the response, so it does not
 * depend on the scraper's exact response shape. Share buttons, post links and login walls are
 * rejected: only a profile / page / channel URL counts.
 */

import { parseSocialAccount } from "../social/link";

export const COMPETITOR_SOCIAL_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "x", label: "X" },
] as const;

export type CompetitorSocialPlatform =
  (typeof COMPETITOR_SOCIAL_PLATFORMS)[number]["id"];

export interface FoundSocialLink {
  platform: CompetitorSocialPlatform;
  /** Canonical profile URL (https, no query, no trailing slash). */
  url: string;
}

const RESERVED: Record<CompetitorSocialPlatform, ReadonlySet<string>> = {
  instagram: new Set(["p", "reel", "reels", "explore", "accounts", "stories", "direct", "tv", "about", "legal", "developer", "web"]),
  tiktok: new Set(["tag", "music", "discover", "foryou", "login", "signup", "legal", "about", "business"]),
  youtube: new Set(["watch", "shorts", "playlist", "results", "feed", "embed", "redirect", "live", "hashtag", "about", "t", "howyoutubeworks"]),
  linkedin: new Set(),
  facebook: new Set(["sharer", "sharer.php", "share", "share.php", "dialog", "plugins", "tr", "login", "login.php", "policies", "help", "pages", "groups", "events", "watch", "marketplace", "photo", "photo.php", "permalink.php", "story.php", "profile.php", "privacy", "legal", "ads", "business", "recover"]),
  x: new Set(["intent", "share", "home", "i", "search", "hashtag", "explore", "login", "signup", "settings", "privacy", "tos", "about", "compose", "messages", "notifications"]),
};

function firstSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
}

const COMPETITOR_PLATFORM_IDS: ReadonlySet<string> = new Set(COMPETITOR_SOCIAL_PLATFORMS.map((p) => p.id));

/**
 * One URL -> a profile link, or null when it is not a profile of a tracked platform. The address is
 * read by the ONE parser (`parseSocialAccount`); what is added here is the strictness a scraped
 * link needs (share buttons and login walls are not accounts, a person's LinkedIn page is not a company's).
 */
export function socialProfileFromUrl(raw: string): FoundSocialLink | null {
  const text = raw.trim();
  if (!/^https?:\/\//i.test(text)) return null;
  const parsed = parseSocialAccount(text, null);
  if (parsed.status !== "ok" || !COMPETITOR_PLATFORM_IDS.has(parsed.platform)) return null;
  const platform = parsed.platform as CompetitorSocialPlatform;
  const first = firstSegments(new URL(text).pathname)[0] ?? "";
  if (platform === "tiktok" && !(first.startsWith("@") && first.length > 1)) return null;
  if (platform === "linkedin" && first !== "company" && first !== "school") return null;
  if (platform === "x" && !/^\w{1,15}$/.test(parsed.handle)) return null;
  if (RESERVED[platform].has(first.replace(/^@/, "").toLowerCase())) return null;
  return { platform, url: parsed.url };
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 12 || value == null) return;
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, depth + 1);
  } else if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, out, depth + 1);
    }
  }
}

/** Every distinct profile link in any scraper payload, one per platform (first seen wins). */
export function extractSocialLinks(payload: unknown): FoundSocialLink[] {
  const strings: string[] = [];
  collectStrings(payload, strings);
  const found = new Map<CompetitorSocialPlatform, FoundSocialLink>();
  for (const text of strings) {
    const candidates = text.match(/https?:\/\/[^\s"'<>)\\]+/g) ?? [];
    for (const candidate of candidates) {
      const link = socialProfileFromUrl(candidate);
      if (link && !found.has(link.platform)) found.set(link.platform, link);
    }
  }
  return [...found.values()];
}
