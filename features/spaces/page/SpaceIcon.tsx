"use client";

// features/spaces/page/SpaceIcon.tsx — draws a Space's icon: a Lucide glyph by name, or an image.

import { FileText } from "lucide-react";

import type { SpaceMedia } from "../contract";
import { SPACE_ICONS } from "../icons-registry";
import { useSpaceMediaUrl } from "./media";

export function SpaceIcon({ media, size = 18, className }: { media: SpaceMedia | null | undefined; size?: number; className?: string }) {
  const url = useSpaceMediaUrl(media);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- uploads and pasted links have no known size or host
    return <img src={url} alt="" width={size} height={size} className={className} style={{ width: size, height: size, objectFit: "cover", borderRadius: Math.max(2, size / 10) }} />;
  }
  const Icon = (media && "icon" in media && SPACE_ICONS[media.icon]) || FileText;
  return <Icon size={size} strokeWidth={size > 40 ? 1.25 : 1.75} className={className} aria-hidden />;
}
