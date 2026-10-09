/**
 * Reddit has two kinds of public page that look alike and mean different things:
 * a subreddit (`/r/ewaste`, a community) and a user (`/u/name`, `/user/name`, a person).
 * Anything that reads or builds a Reddit link goes through here so the two are never mixed.
 */

export type RedditTarget = {
  type: "subreddit" | "user";
  /** The bare name: "ewaste", "spez". */
  name: string;
  /** How a person writes it: "r/ewaste", "u/spez". */
  label: string;
  /** Canonical public URL. */
  url: string;
};

const REDDIT_HOST = /^(?:www|old|new|np|m|i)\.reddit\.com$|^reddit\.com$/i;

function target(type: RedditTarget["type"], name: string): RedditTarget {
  const prefix = type === "subreddit" ? "r" : "u";
  const path = type === "subreddit" ? "r" : "user";
  return { type, name, label: `${prefix}/${name}`, url: `https://www.reddit.com/${path}/${name}` };
}

/** A reddit.com URL → subreddit or user; null for posts-only, the front page or another host. */
export function classifyRedditUrl(raw: string): RedditTarget | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!REDDIT_HOST.test(url.hostname)) return null;
  const [first, second] = url.pathname.split("/").filter(Boolean);
  if (!first || !second) return null;
  const kind = first.toLowerCase();
  if (kind === "r") return target("subreddit", second);
  if (kind === "u" || kind === "user") return target("user", second);
  return null;
}

/**
 * A typed handle → subreddit or user. "r/x" and "/r/x" are subreddits, "u/x", "/u/x",
 * "user/x" and "@x" are users; a bare name is a user (the only unprefixed form Reddit has).
 */
export function classifyRedditHandle(raw: string): RedditTarget | null {
  const text = raw.trim().replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "");
  if (!text) return null;
  const parts = text.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const kind = parts[0].toLowerCase();
    if (kind === "r") return target("subreddit", parts[1]);
    if (kind === "u" || kind === "user") return target("user", parts[1]);
    return null;
  }
  const name = parts[0].replace(/^@/, "");
  return name ? target("user", name) : null;
}
