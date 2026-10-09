"use client";

/**
 * The platform mark for social rows and cards. The marketing feature already
 * ships the official glyph-on-brand-color set (`PropertyKindMark`, covering
 * every social platform); this is the social feature's one entry to it, so a
 * platform name from `social.*` (which has no `other`) resolves in one place.
 */

import { PropertyKindMark } from "@/features/marketing/components/shared/PropertyKindMark";

import { SOCIAL_PLATFORM_LABELS, isSocialPlatform } from "../types";

export function platformLabel(platform: string): string {
  return isSocialPlatform(platform) ? SOCIAL_PLATFORM_LABELS[platform] : platform;
}

export function PlatformMark({
  platform,
  size = 20,
  className,
}: {
  platform: string;
  size?: number;
  className?: string;
}) {
  return (
    <span title={platformLabel(platform)} className="inline-flex shrink-0">
      <PropertyKindMark kind={platform} size={size} className={className} />
    </span>
  );
}
