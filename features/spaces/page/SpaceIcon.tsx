"use client";

// features/spaces/page/SpaceIcon.tsx — draws a Space's icon: a Lucide glyph by name, or an image.

import { DynamicIcon } from "@ai-matrx/icons";
import { FileText } from "lucide-react";

import type { SpaceMedia } from "../contract";
import { SPACE_ICONS } from "../icons-registry";
import { useSpaceMediaUrl } from "./media";

/** A picture (upload, link, gallery) as opposed to a glyph: a Lucide icon or an emoji. */
export function isImageMedia(media: SpaceMedia | null | undefined): boolean {
  return !!media && !("icon" in media) && !("emoji" in media);
}

/** A callout's stored icon string is a Lucide name, or an emoji a person chose (never plain letters). */
export function isEmojiText(s: string): boolean {
  return !!s && !/^[A-Za-z0-9]+$/.test(s);
}

export function SpaceIcon({ media, size = 18, className }: { media: SpaceMedia | null | undefined; size?: number; className?: string }) {
  const url = useSpaceMediaUrl(media);
  if (media && "emoji" in media) {
    return (
      <span role="img" aria-label="emoji" className={className} style={{ fontSize: size * 0.92, lineHeight: 1, width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif" }}>
        {media.emoji}
      </span>
    );
  }
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- uploads and pasted links have no known size or host
    return <img src={url} alt="" width={size} height={size} className={className} style={{ width: size, height: size, objectFit: "cover", borderRadius: Math.max(2, size / 10) }} />;
  }
  const name = media && "icon" in media ? media.icon : "";
  // Any Lucide name draws (a callout's "Info"); the curated set without a lazy load.
  if (name && !SPACE_ICONS[name]) return <DynamicIcon name={name} size={size} className={className} fallbackIcon="FileText" />;
  const Icon = (name && SPACE_ICONS[name]) || FileText;
  return <Icon size={size} strokeWidth={size > 40 ? 1.25 : 1.75} className={className} aria-hidden />;
}
