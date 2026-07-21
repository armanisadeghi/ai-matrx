import {
  isPropertyKind,
  type DiscoveredItem,
  type PropertyKind,
} from "@/features/marketing/types";

/** Resolve a social discovery into the canonical web.property taxonomy. */
export function inferDiscoveredPropertyType(
  item: Pick<DiscoveredItem, "guessed_kind" | "url">,
): PropertyKind {
  if (
    item.guessed_kind &&
    item.guessed_kind !== "website" &&
    isPropertyKind(item.guessed_kind)
  ) {
    return item.guessed_kind;
  }
  if (!item.url) return "other";
  try {
    const host = new URL(item.url).hostname.replace(/^www\./, "");
    if (host === "instagram.com") return "instagram";
    if (host === "facebook.com" || host === "fb.com") return "facebook";
    if (host === "x.com" || host === "twitter.com") return "x";
    if (host === "tiktok.com") return "tiktok";
    if (host === "youtube.com" || host === "youtu.be") return "youtube";
    if (host === "linkedin.com") return "linkedin";
    if (host === "pinterest.com" || host === "pin.it") return "pinterest";
  } catch {
    // Malformed URLs are still reviewable as a labeled Other property.
  }
  return "other";
}
