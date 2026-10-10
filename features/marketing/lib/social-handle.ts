/**
 * How a social handle is WRITTEN on screen. One function for every place a handle renders
 * (accounts list, competitor directory, overview, report rows, forms): "@name" for most
 * platforms, and for Reddit the shared classification — "r/name" for a community, "u/name"
 * for a person — never "@name", which hides which of the two it is.
 */

import { classifyRedditHandle, classifyRedditUrl } from "./reddit-links";

/**
 * A LinkedIn person's slug ends in a generated id (`arman-sadeghi-8b176627`); the id is an address, never part of a name.
 * A company/school slug keeps its path (`company/acme`). Returns the address people recognise, without the id.
 */
export function linkedInAddress(handle: string | null | undefined): string {
  const slug = (handle ?? "").trim().replace(/^@/, "").replace(/^\/+|\/+$/g, "");
  if (!slug) return "";
  if (slug.includes("/")) return `linkedin.com/${slug.replace(/^in\//, "in/")}`;
  const clean = slug.replace(/-(?=[0-9a-f]*\d)[0-9a-f]{6,}$/i, "");
  return `linkedin.com/in/${clean || slug}`;
}

export function formatSocialHandle(args: {
  platform: string | null | undefined;
  handle: string | null | undefined;
  /** The profile link when known: it is the only thing that tells a bare Reddit name apart. */
  url?: string | null;
}): string {
  const handle = (args.handle ?? "").trim();
  // A raw YouTube channel id is an address, not a handle: never printed as one.
  if (args.platform?.toLowerCase() === "youtube" && /^@?UC[\w-]{22}$/.test(handle)) return "";
  if (args.platform?.toLowerCase() === "linkedin") return linkedInAddress(handle);
  if (args.platform?.toLowerCase() === "reddit") {
    const target =
      (args.url ? classifyRedditUrl(args.url) : null) ?? (handle ? classifyRedditHandle(handle) : null);
    if (target) return target.label;
  }
  return handle ? `@${handle.replace(/^@/, "")}` : "";
}
