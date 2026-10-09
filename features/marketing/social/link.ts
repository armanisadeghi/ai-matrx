/**
 * Pasted-link helpers: which platform a URL or `@handle` names, and whether
 * the text is a post link or a profile. Pure; the server re-validates.
 */

import { classifyRedditHandle, classifyRedditUrl } from "../lib/reddit-links";
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
  const platform = url ? detectPlatform(text) : null;
  if (url && platform && !looksLikePostUrl(text)) {
    const found = accountFromUrl(platform, url);
    if (found?.handle) return found.handle.replace(/^r\//, "").replace(/^@/, "");
  }
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

// ---------------------------------------------------------------------------
// The ONE account-input parser: any way a person writes a social account -> platform + handle + URL.
// ---------------------------------------------------------------------------

/** Which address shape an account lives at on platforms that have more than one. */
export type ProfileVariant = "at" | "c" | "user" | "channel" | "in" | "company" | "school" | "r" | "u";

/** The public profile address for a bare handle. Pure; the one builder (person-brand-flow and the previews use it). */
export function profileUrlFor(platform: SocialPlatform, handle: string, variant?: ProfileVariant): string {
  const h = handle.replace(/^@/, "");
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${h}`;
    case "tiktok":
      return `https://www.tiktok.com/@${h}`;
    case "youtube":
      if (variant === "c" || variant === "user" || variant === "channel") return `https://www.youtube.com/${variant}/${h}`;
      return /^UC[\w-]{22}$/.test(h) ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`;
    case "x":
      return `https://x.com/${h}`;
    case "threads":
      return `https://www.threads.com/@${h}`;
    case "facebook":
      return `https://www.facebook.com/${h}`;
    case "linkedin":
      return `https://www.linkedin.com/${variant === "company" || variant === "school" ? variant : "in"}/${h}`;
    case "pinterest":
      return `https://www.pinterest.com/${h}`;
    case "reddit":
      return (classifyRedditHandle(variant === "r" ? `r/${h}` : h)?.url ?? `https://www.reddit.com/user/${h}`);
    case "snapchat":
      return `https://www.snapchat.com/add/${h}`;
  }
}

export type ParsedAccount =
  | { status: "empty" }
  /** A post/video address: not an account. */
  | { status: "post"; platform: SocialPlatform; url: string }
  /** A bare handle and no platform to put it on yet. */
  | { status: "needs_platform"; handle: string }
  /** Something that cannot be an account: an unknown site, a platform home page, spaces. */
  | { status: "invalid" }
  | {
      status: "ok";
      platform: SocialPlatform;
      /** Bare, no "@" ("r/name" for a subreddit). */
      handle: string;
      /** How a person writes it: "@name", "r/name". */
      label: string;
      /** Canonical public address. */
      url: string;
      /** True when the platform came from the pasted address, false when from the fallback. */
      detected: boolean;
    };

const BARE_HANDLE = /^[A-Za-z0-9._-]{1,100}$/;
const IG_SKIP = new Set(["stories", "explore", "p", "reel", "reels", "tv"]);

function accountFromUrl(
  platform: SocialPlatform,
  url: URL,
): { handle: string; variant?: ProfileVariant } | null {
  let segs = url.pathname.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  // "twitter.com/https://twitter.com/name": a whole address pasted after the host.
  const nested = segs.findIndex((s) => /^https?:$/i.test(s));
  if (nested >= 0) segs = [segs[segs.length - 1]];
  const first = segs[0] ?? "";
  const lower = first.toLowerCase();
  if (!first || NON_ACCOUNT_SEGMENTS.has(lower)) return null;
  const at = first.startsWith("@") ? first.slice(1) : null;
  switch (platform) {
    case "reddit": {
      const t = classifyRedditUrl(url.href);
      return t ? { handle: t.type === "subreddit" ? t.label : t.name, variant: t.type === "subreddit" ? "r" : "u" } : null;
    }
    case "linkedin":
      return ["in", "company", "school"].includes(lower) && segs[1]
        ? { handle: segs[1], variant: lower as ProfileVariant }
        : null;
    case "youtube":
      if (at) return { handle: at, variant: "at" };
      if (["c", "user", "channel"].includes(lower)) return segs[1] ? { handle: segs[1], variant: lower as ProfileVariant } : null;
      return ["playlist", "feed", "shorts", "live", "embed", "results", "channel"].includes(lower)
        ? null
        : { handle: first, variant: "at" };
    case "snapchat":
      if (lower === "add") return segs[1] ? { handle: segs[1] } : null;
      return { handle: at ?? first };
    case "instagram":
      if (lower === "stories" && segs[1]) return { handle: segs[1] };
      return IG_SKIP.has(lower) ? null : { handle: at ?? first };
    default:
      return { handle: at ?? first };
  }
}

/**
 * Parse whatever a person typed or pasted for a social account. Any variation works: with or without
 * protocol, `www.`/`m.`, a trailing slash, a query string, an `@`, platform paths (`/@x`, `/c/x`,
 * `/channel/UC…`, `/in/x`, `/company/x`, `/r/x`, `/u/x`, `/add/x`) and x.com or twitter.com.
 * A pasted address names its own platform; a bare handle takes `fallback` (the dialog's chosen type).
 * Pure; the server re-validates.
 */
export function parseSocialAccount(input: string | null | undefined, fallback?: SocialPlatform | null): ParsedAccount {
  const text = (input ?? "").trim();
  if (!text) return { status: "empty" };
  const url = parseUrl(text);
  if (url) {
    const platform = detectPlatform(text);
    if (!platform) return { status: "invalid" };
    if (looksLikePostUrl(text)) return { status: "post", platform, url: url.href };
    const found = accountFromUrl(platform, url);
    if (!found || !found.handle.trim()) return { status: "invalid" };
    return build(platform, found.handle.trim(), found.variant, true);
  }
  // Not an address: a bare name. A platform's own bare host ("tiktok.com") is a home page, not a name.
  if (HOSTS.some(([re]) => re.test(text.toLowerCase().replace(/\/+$/, "")))) return { status: "invalid" };
  // Reddit's prefixed forms name Reddit by themselves.
  const reddit = /^\/?(r|u|user)\/[A-Za-z0-9_-]+\/?$/i.test(text) ? classifyRedditHandle(text) : null;
  if (reddit) return build("reddit", reddit.type === "subreddit" ? reddit.label : reddit.name, reddit.type === "subreddit" ? "r" : "u", true);
  const bare = text.replace(/^@+/, "").replace(/\/+$/, "");
  if (!BARE_HANDLE.test(bare)) return { status: "invalid" };
  if (!fallback) return { status: "needs_platform", handle: bare };
  return build(fallback, bare, fallback === "linkedin" ? "company" : undefined, false);
}

function build(
  platform: SocialPlatform,
  handle: string,
  variant: ProfileVariant | undefined,
  detected: boolean,
): ParsedAccount {
  const isSub = platform === "reddit" && /^r\//i.test(handle);
  const label = platform === "reddit" ? (isSub ? handle : `u/${handle.replace(/^u\//i, "")}`) : /^UC[\w-]{22}$/.test(handle) && platform === "youtube" ? handle : `@${handle}`;
  return {
    status: "ok",
    platform,
    handle,
    label,
    url: profileUrlFor(platform, isSub ? handle.slice(2) : handle, variant),
    detected,
  };
}

/** Kinds with no per-account identity (a site, a listing, a catch-all). */
const NO_IDENTITY_KINDS = new Set(["website", "google_business_profile", "other"]);

/**
 * The ONE canonical identity of a brand's social account on a platform: its lowercased bare handle (or
 * the account segment of its address when no handle is stored). Mirrors `web.property_identity` in the
 * database, whose partial unique index `property_social_identity_unique` enforces one live row per
 * (brand, kind, owner_kind, identity). Null = no identity (not an account address, e.g. a video link).
 */
export function propertyIdentity(
  kind: string,
  handle: string | null | undefined,
  url: string | null | undefined,
): string | null {
  if (NO_IDENTITY_KINDS.has(kind)) return null;
  const stored = (handle ?? "").trim();
  let raw = stored;
  if (!raw) {
    const u = url ?? "";
    const m = /(?:\/@|\/channel\/|\/user\/|\/c\/|\/r\/|\/in\/|\/company\/|\/school\/)([^/?#]+)/.exec(u);
    // YouTube and LinkedIn need a marker (a /watch or /feed address is not an account); the rest name the account first.
    const first = kind === "youtube" || kind === "linkedin" ? null : /^(?:https?:\/\/)?[^/]+\/([^/?#]+)/.exec(u);
    raw = m?.[1] ?? first?.[1] ?? "";
  }
  const id = raw.replace(/^[\s/@]+|[\s/@]+$/g, "").toLowerCase();
  return id || null;
}

/**
 * The address a stored post lives at. A pasted link is only a way in: its handle can be wrong while
 * the post id is right, and the provider answers with the real author. So the address shown and
 * linked comes from the stored post and its author, never from what was pasted: where the stored
 * address names another account than the post's author (TikTok, X), it is rebuilt from the author
 * and the post id. Anywhere else the stored address stands. Pure.
 */
export function canonicalPostUrl(args: {
  platform: string;
  platformPostId: string | null | undefined;
  handle: string | null | undefined;
  url: string | null | undefined;
}): string | null {
  const stored = args.url?.trim() || null;
  const handle = args.handle?.trim().replace(/^@/, "") || null;
  const id = args.platformPostId?.trim() || null;
  const build = (): string | null => {
    if (!handle || !id) return null;
    if (args.platform === "tiktok") return `https://www.tiktok.com/@${handle}/video/${id}`;
    if (args.platform === "x") return `https://x.com/${handle}/status/${id}`;
    return null;
  };
  if (!stored) return build();
  const url = parseUrl(stored);
  if (!url || !handle || !id) return stored;
  const segments = url.pathname.split("/").filter(Boolean);
  const named =
    args.platform === "tiktok"
      ? segments[0]?.startsWith("@") ? segments[0].slice(1) : null
      : args.platform === "x" && /^(status|statuses)$/.test(segments[1] ?? "")
        ? segments[0]
        : null;
  if (named && named.toLowerCase() !== handle.toLowerCase()) return build() ?? stored;
  return stored;
}
