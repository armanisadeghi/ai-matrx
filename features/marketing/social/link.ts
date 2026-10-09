/**
 * Pasted-link helpers: which platform a URL or `@handle` names, and whether
 * the text is a post link or a profile. Pure; the server re-validates.
 */

import type { SocialPlatform } from "./types";

const HOSTS: ReadonlyArray<[RegExp, SocialPlatform]> = [
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "youtube"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$/, "facebook"],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, "x"],
  [/(^|\.)threads\.(com|net)$/, "threads"],
  [/(^|\.)pinterest\.[a-z.]+$/, "pinterest"],
  [/(^|\.)reddit\.com$/, "reddit"],
  [/(^|\.)snapchat\.com$/, "snapchat"],
];

function parseUrl(text: string): URL | null {
  const trimmed = text.trim();
  if (!/^(https?:\/\/|www\.)/i.test(trimmed) && !/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(trimmed)) {
    return null;
  }
  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

/** The platform a pasted URL names; null for a bare handle or unknown host. */
export function detectPlatform(text: string): SocialPlatform | null {
  const url = parseUrl(text);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  return HOSTS.find(([re]) => re.test(host))?.[1] ?? null;
}

/** True when the pasted URL points at one post/video rather than a profile. */
export function looksLikePostUrl(text: string): boolean {
  const url = parseUrl(text);
  if (!url) return false;
  const p = url.pathname.toLowerCase();
  return (
    /\/video\/\d+/.test(p) ||
    /^\/(p|reel|reels|tv)\//.test(p) ||
    p.startsWith("/watch") ||
    p.startsWith("/shorts/") ||
    host(url) === "youtu.be" ||
    /\/(status|statuses)\/\d+/.test(p) ||
    /\/posts?\//.test(p) ||
    /\/feed\/update\//.test(p)
  );
}

function host(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

/** Display handle for a pasted value: strips URL parts down to the last segment. */
export function handleFromInput(text: string): string {
  const url = parseUrl(text);
  const raw = url
    ? (url.pathname.split("/").filter(Boolean).find((s) => s.startsWith("@")) ??
        url.pathname.split("/").filter(Boolean).pop() ??
        "")
    : text;
  return raw.trim().replace(/^@/, "");
}

/**
 * The ONE handle normalizer: a profile URL (query and trailing slash included), a `www.` address, an
 * `@handle` or a bare handle all become the bare handle. Anything that is not an address passes
 * through trimmed. Research intake, brand prefill and the tracking dialog all go through this.
 */
export function normalizeHandle(input: string | null | undefined): string {
  return handleFromInput(input ?? "");
}

export interface SocialLink {
  kind: "post" | "profile";
  platform: SocialPlatform;
  /** The address to ingest, with a scheme. */
  url: string;
  /** Profile links only: the handle named in the address. */
  handle: string | null;
}

/** Hosts whose bare address is a home page, not an account. */
const NON_ACCOUNT_SEGMENTS = new Set([
  "", "explore", "search", "login", "signup", "help", "about", "home", "feed", "hashtag", "tag", "tags",
  "discover", "watch", "results", "trending", "music", "i", "intent", "share", "legal", "privacy", "terms",
]);

/**
 * What a pasted line is on a board: a post or a profile of a social platform, or null (a plain web
 * address, a bare handle, an unknown host). A post wins over a profile; a platform home or search
 * page is neither. Pure; the server re-validates.
 */
export function classifySocialLink(text: string): SocialLink | null {
  const platform = detectPlatform(text);
  if (!platform) return null;
  const url = parseUrl(text);
  if (!url) return null;
  if (looksLikePostUrl(text)) return { kind: "post", platform, url: url.href, handle: null };
  const segments = url.pathname.split("/").filter(Boolean);
  const first = segments[0]?.toLowerCase() ?? "";
  if (NON_ACCOUNT_SEGMENTS.has(first)) return null;
  // LinkedIn accounts live under /in/<name> or /company/<name>; YouTube under /@name, /c/, /channel/, /user/.
  const handle = handleFromInput(text);
  if (!handle) return null;
  if (platform === "linkedin" && !["in", "company", "school"].includes(first)) return null;
  if (platform === "youtube" && !(first.startsWith("@") || ["c", "channel", "user"].includes(first))) return null;
  if (platform === "tiktok" && !first.startsWith("@")) return null;
  return { kind: "profile", platform, url: url.href, handle };
}
