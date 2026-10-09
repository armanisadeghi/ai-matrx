import { AtSign, Ghost, Globe2, MessagesSquare } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Facebook,
  Google,
  Instagram,
  Linkedin,
  Pinterest,
  Tiktok,
  Twitter,
  Youtube,
} from "@/components/icons/brand-icons";
import { cn } from "@/lib/utils";
import type { BrandProperty, PropertyKind } from "@/features/marketing/types";
import { isPropertyKind } from "@/features/marketing/types";
import { classifyRedditHandle } from "@/features/marketing/lib/reddit-links";

const KIND_ICONS: Record<PropertyKind, LucideIcon> = {
  website: Globe2,
  instagram: Instagram,
  facebook: Facebook,
  x: Twitter,
  tiktok: Tiktok,
  youtube: Youtube,
  linkedin: Linkedin,
  pinterest: Pinterest,
  google_business_profile: Google,
  threads: AtSign,
  reddit: MessagesSquare,
  snapchat: Ghost,
  other: AtSign,
};

/**
 * Official platform brand colors — the one deliberate exception to the
 * semantic-token rule: these tiles ARE the third party's brand identity.
 * X and TikTok invert in dark mode so the black tile never vanishes.
 */
const KIND_TILE_CLASSES: Record<PropertyKind, string> = {
  website: "bg-muted text-muted-foreground",
  instagram:
    "bg-[linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)] text-white",
  facebook: "bg-[#1877F2] text-white",
  x: "bg-black text-white dark:bg-white dark:text-black",
  tiktok: "bg-black text-white dark:bg-white dark:text-black",
  youtube: "bg-[#FF0000] text-white",
  linkedin: "bg-[#0A66C2] text-white",
  pinterest: "bg-[#E60023] text-white",
  google_business_profile: "bg-[#4285F4] text-white",
  threads: "bg-black text-white dark:bg-white dark:text-black",
  reddit: "bg-[#FF4500] text-white",
  snapchat: "bg-[#FFFC00] text-black",
  other: "bg-muted text-muted-foreground",
};

/** Canonical public profile URL from a bare handle, per platform. */
const HANDLE_URL_BUILDERS: Partial<Record<PropertyKind, (h: string) => string>> =
  {
    instagram: (h) => `https://instagram.com/${h}`,
    facebook: (h) => `https://facebook.com/${h}`,
    x: (h) => `https://x.com/${h}`,
    tiktok: (h) => `https://tiktok.com/@${h}`,
    youtube: (h) => `https://youtube.com/@${h}`,
    pinterest: (h) => `https://pinterest.com/${h}`,
    threads: (h) => `https://www.threads.com/@${h}`,
    reddit: (h) => classifyRedditHandle(h)?.url ?? `https://www.reddit.com/user/${h}`,
    snapchat: (h) => `https://snapchat.com/add/${h}`,
  };

/** Example profile URL + handle for the Add property fields: they follow the chosen Type. */
const PROPERTY_PLACEHOLDERS: Partial<Record<PropertyKind, { url: string; handle: string }>> = {
  website: { url: "https://yourbrand.com", handle: "" },
  instagram: { url: "https://instagram.com/yourbrand", handle: "@yourbrand" },
  facebook: { url: "https://facebook.com/yourbrand", handle: "yourbrand" },
  x: { url: "https://x.com/yourbrand", handle: "@yourbrand" },
  tiktok: { url: "https://tiktok.com/@yourbrand", handle: "@yourbrand" },
  youtube: { url: "https://youtube.com/@yourbrand", handle: "@yourbrand" },
  linkedin: { url: "https://linkedin.com/company/yourbrand", handle: "yourbrand" },
  pinterest: { url: "https://pinterest.com/yourbrand", handle: "yourbrand" },
  threads: { url: "https://www.threads.com/@yourbrand", handle: "@yourbrand" },
  reddit: { url: "https://reddit.com/r/yourbrand", handle: "r/yourbrand or u/yourbrand" },
  snapchat: { url: "https://snapchat.com/add/yourbrand", handle: "yourbrand" },
};

export function propertyPlaceholders(kind: PropertyKind): { url: string; handle: string } {
  return PROPERTY_PLACEHOLDERS[kind] ?? { url: "https://", handle: "@yourbrand" };
}

export function toPropertyKind(value: string): PropertyKind {
  return isPropertyKind(value) ? value : "other";
}

/**
 * Best public URL for a property: its stored URL, else one derived from the
 * handle for platforms with a canonical handle → URL mapping.
 */
export function propertyPublicUrl(
  property: Pick<BrandProperty, "kind" | "url" | "handle">,
): string | null {
  if (property.url) return property.url;
  const handle = property.handle?.trim().replace(/^@/, "");
  if (!handle) return null;
  const build = HANDLE_URL_BUILDERS[toPropertyKind(property.kind)];
  return build ? build(handle) : null;
}

/**
 * The recognizable platform mark: official glyph on the platform's own brand
 * color. Every surface that lists a brand's social properties renders this —
 * never a generic icon.
 */
export function PropertyKindMark({
  kind,
  size = 28,
  className,
}: {
  kind: string;
  size?: number;
  className?: string;
}) {
  const resolved = toPropertyKind(kind);
  const Icon = KIND_ICONS[resolved];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md shadow-sm",
        KIND_TILE_CLASSES[resolved],
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
    </span>
  );
}
