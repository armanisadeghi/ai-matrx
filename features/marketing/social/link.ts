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
