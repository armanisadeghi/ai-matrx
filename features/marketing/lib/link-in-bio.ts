/**
 * Link-in-bio discovery — from a creator's bio link (a Linktree / Beacons /
 * Stan page, or any page) to the rest of their presence: their other social
 * accounts and the outbound links that may be their website.
 *
 * Pure. Reads ANY payload — a raw HTML page, the scraper's NDJSON events, a
 * profile's bio text — by collecting every URL in it, so it never depends on
 * one page builder's markup or the scraper's exact response shape. Accounts are
 * classified by the ONE social-link classifier (`social/link.ts`).
 */

import { classifySocialLink } from "../social/link";
import type { SocialPlatform } from "../social/types";

/** Hosts whose pages are link-in-bio hubs (the page itself is never an account or a website). */
export const LINK_IN_BIO_HOSTS: readonly string[] = [
  "linktr.ee",
  "linktree.com",
  "beacons.ai",
  "beacons.page",
  "stan.store",
  "lnk.bio",
  "bio.link",
  "linkin.bio",
  "taplink.cc",
  "taplink.at",
  "campsite.bio",
  "hoo.be",
  "komi.io",
  "solo.to",
  "linkpop.com",
  "snipfeed.co",
  "allmylinks.com",
  "msha.ke",
  "carrd.co",
  "linkfly.to",
  "tap.bio",
  "direct.me",
];

/** Asset, tracking and infrastructure hosts that are never a person's link. */
const NOISE_HOSTS: readonly string[] = [
  "schema.org",
  "w3.org",
  "googletagmanager.com",
  "google-analytics.com",
  "googleapis.com",
  "gstatic.com",
  "doubleclick.net",
  "facebook.net",
  "cloudfront.net",
  "amazonaws.com",
  "mzstatic.com",
  "cdninstagram.com",
  "fbcdn.net",
  "tiktokcdn.com",
  "ytimg.com",
  "ggpht.com",
  "sentry.io",
  "segment.com",
  "segment.io",
  "cookielaw.org",
  "onetrust.com",
  "typekit.net",
  "jsdelivr.net",
  "unpkg.com",
  "imgix.net",
  "cloudinary.com",
  "vercel.app",
  "linktr.ee",
  "giphy.com",
  "stripe.com",
  "apple.com",
  "google.com",
  "datagrail.io",
  "scdn.co",
  // Affiliate / ad redirectors: a sponsor's tracking link is never the person's site.
  "sjv.io",
  "pxf.io",
  "wk5q.net",
  "linksynergy.com",
  "kqzyfj.com",
  "anrdoezrs.net",
  "dpbolvw.net",
  "jdoqocy.com",
  "tkqlhce.com",
  "thanks.is",
  "amzn.to",
  "geni.us",
  "bit.ly",
];

const ASSET_PATH = /\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|json|woff2?|ttf|otf|mp4|webm|mp3|m3u8|xml|txt|avif|heic)$/i;

export interface DiscoveredAccount {
  platform: SocialPlatform;
  handle: string;
  /** Canonical profile address (https, no query, no trailing slash). */
  url: string;
}

export interface PresenceLinks {
  /** Social accounts, one per platform + handle, in first-seen order. */
  accounts: DiscoveredAccount[];
  /** Every other outbound link (podcasts, shops, websites), one per address, first-seen order. */
  links: string[];
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./, "");
}

function hostMatches(host: string, list: readonly string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** True when the address is a link-in-bio hub page (Linktree, Beacons, Stan, …). */
export function isLinkInBioUrl(raw: string | null | undefined): boolean {
  const url = parseHttpUrl(raw);
  return url ? hostMatches(hostOf(url), LINK_IN_BIO_HOSTS) : false;
}

export function parseHttpUrl(raw: string | null | undefined): URL | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 14 || value == null) return;
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, depth + 1);
  } else if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out, depth + 1);
  }
}

/** Every http(s) address in a text, with JSON/HTML escapes undone and trailing punctuation dropped. */
export function urlsInText(text: string): string[] {
  const unescaped = text
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
  const found = unescaped.match(/https?:\/\/[^\s"'<>)\\\]}`,]+/g) ?? [];
  return found.map((u) => u.replace(/[.,;:!?]+$/, ""));
}

function canonicalLink(url: URL): string {
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${url.hostname.toLowerCase().replace(/^www\./, "")}${path}${url.search}`;
}

/**
 * Accounts and outbound links in any payload. `ignore` drops accounts already
 * known (the profile the search started from), matched on platform + handle.
 */
export function extractPresenceLinks(
  payload: unknown,
  opts: { ignore?: ReadonlyArray<{ platform: string; handle: string }> } = {},
): PresenceLinks {
  const strings: string[] = [];
  collectStrings(payload, strings);
  const ignore = new Set((opts.ignore ?? []).map((a) => `${a.platform}:${a.handle.toLowerCase()}`));
  const accounts = new Map<string, DiscoveredAccount>();
  const links = new Map<string, string>();

  for (const text of strings) {
    for (const candidate of urlsInText(text)) {
      const url = parseHttpUrl(candidate);
      if (!url) continue;
      const host = hostOf(url);
      if (hostMatches(host, LINK_IN_BIO_HOSTS)) continue;
      const social = classifySocialLink(url.href);
      if (social) {
        if (social.kind !== "profile" || !social.handle) continue;
        const handle = social.handle.replace(/^@/, "");
        const key = `${social.platform}:${handle.toLowerCase()}`;
        if (ignore.has(key) || accounts.has(key)) continue;
        accounts.set(key, {
          platform: social.platform,
          handle,
          url: `https://${url.hostname.toLowerCase().replace(/^(m|mobile|web)\./, "www.")}${url.pathname.replace(/\/+$/, "")}`,
        });
        continue;
      }
      // A known social host that is not a profile (a post, a share button) is not a website either.
      if (/(instagram|tiktok|youtube|youtu|facebook|fb|twitter|x|threads|linkedin|pinterest|reddit|snapchat)\.(com|be|net)$/.test(host)) {
        continue;
      }
      if (hostMatches(host, NOISE_HOSTS) || ASSET_PATH.test(url.pathname)) continue;
      const canonical = canonicalLink(url);
      if (!links.has(canonical)) links.set(canonical, canonical);
    }
  }
  return { accounts: [...accounts.values()], links: [...links.values()] };
}

/**
 * The outbound link most likely to be the person's own website: a host whose
 * name carries their handle or their name (melrobbins.com for @melrobbins).
 * Null when nothing matches — the person picks, nothing is guessed.
 */
export function likelyWebsite(
  links: readonly string[],
  who: { handle?: string | null; name?: string | null },
): string | null {
  const keys = [who.handle, who.name]
    .map((v) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((v) => v.length >= 4);
  if (keys.length === 0) return null;
  for (const link of links) {
    const url = parseHttpUrl(link);
    if (!url) continue;
    const label = hostOf(url).split(".").slice(0, -1).join("").replace(/[^a-z0-9]/g, "");
    if (keys.some((k) => label === k || label.includes(k) || (label.length >= 6 && k.includes(label)))) {
      return `https://${hostOf(url)}`;
    }
  }
  return null;
}

/** Display text for a link: host + path, no scheme. */
export function linkLabel(link: string): string {
  return link.replace(/^https?:\/\//, "").replace(/^www\./, "");
}
