/**
 * Social profile links found on a competitor's website.
 *
 * "Find their socials" scrapes the competitor's home page through the existing scraper
 * (`/scraper/quick-scrape`, `get_links`) and reads every URL in the response, so it does not
 * depend on the scraper's exact response shape. Share buttons, post links and login walls are
 * rejected: only a profile / page / channel URL counts.
 */

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

/** One URL → a profile link, or null when it is not a profile of a tracked platform. */
export function socialProfileFromUrl(raw: string): FoundSocialLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, "");
  const seg = firstSegments(url.pathname);
  if (seg.length === 0) return null;
  const first = seg[0];

  if (host === "instagram.com") {
    if (RESERVED.instagram.has(first.toLowerCase())) return null;
    return { platform: "instagram", url: `https://www.instagram.com/${first}` };
  }
  if (host === "tiktok.com") {
    if (!first.startsWith("@") || first.length < 2) return null;
    return { platform: "tiktok", url: `https://www.tiktok.com/${first}` };
  }
  if (host === "youtube.com") {
    if (first.startsWith("@") && first.length > 1) {
      return { platform: "youtube", url: `https://www.youtube.com/${first}` };
    }
    if ((first === "channel" || first === "c" || first === "user") && seg[1]) {
      return { platform: "youtube", url: `https://www.youtube.com/${first}/${seg[1]}` };
    }
    return null;
  }
  if (host === "linkedin.com") {
    if ((first === "company" || first === "school") && seg[1]) {
      return { platform: "linkedin", url: `https://www.linkedin.com/${first}/${seg[1]}` };
    }
    return null;
  }
  if (host === "facebook.com" || host === "fb.com") {
    if (RESERVED.facebook.has(first.toLowerCase())) return null;
    return { platform: "facebook", url: `https://www.facebook.com/${first}` };
  }
  if (host === "x.com" || host === "twitter.com") {
    const handle = first.replace(/^@/, "");
    if (RESERVED.x.has(handle.toLowerCase()) || !/^\w{1,15}$/.test(handle)) return null;
    return { platform: "x", url: `https://x.com/${handle}` };
  }
  return null;
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
