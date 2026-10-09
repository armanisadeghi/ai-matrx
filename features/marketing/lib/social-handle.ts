/**
 * How a social handle is WRITTEN on screen. One function for every place a handle renders
 * (accounts list, competitor directory, overview, report rows, forms): "@name" for most
 * platforms, and for Reddit the shared classification — "r/name" for a community, "u/name"
 * for a person — never "@name", which hides which of the two it is.
 */

import { classifyRedditHandle, classifyRedditUrl } from "./reddit-links";

export function formatSocialHandle(args: {
  platform: string | null | undefined;
  handle: string | null | undefined;
  /** The profile link when known: it is the only thing that tells a bare Reddit name apart. */
  url?: string | null;
}): string {
  const handle = (args.handle ?? "").trim();
  if (args.platform?.toLowerCase() === "reddit") {
    const target =
      (args.url ? classifyRedditUrl(args.url) : null) ?? (handle ? classifyRedditHandle(handle) : null);
    if (target) return target.label;
  }
  return handle ? `@${handle.replace(/^@/, "")}` : "";
}
