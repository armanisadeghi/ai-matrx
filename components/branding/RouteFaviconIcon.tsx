"use client";

/**
 * Inline route favicon badge — matches browser-tab SVG favicons from
 * `constants/favicon-route-data.ts` / `generateSVGFavicon`.
 */

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFaviconConfigByPath } from "@/utils/favicon-utils";

interface RouteFaviconIconProps {
  route: string;
  size?: number | string;
  className?: string;
}

export function RouteFaviconIcon({
  route,
  size = 15,
  className,
}: RouteFaviconIconProps) {
  const config = getFaviconConfigByPath(route);
  const color = config?.color ?? "#64748b";
  const letter = config?.letter ?? "?";
  const px = typeof size === "number" ? size : 15;
  const fontSize = letter.length === 1 ? 46 : letter.length === 2 ? 34 : 26;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      <rect width="64" height="64" rx="10" fill={color} />
      <text
        x="32"
        y="44"
        textAnchor="middle"
        fill="white"
        fontSize={fontSize}
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {letter}
      </text>
    </svg>
  );
}

/** LucideIcon-shaped wrapper for menu components that expect Lucide icons. */
export function createRouteFaviconLucideIcon(route: string): LucideIcon {
  const Icon = ({
    size = 24,
    className,
  }: {
    size?: number | string;
    className?: string;
  }) => <RouteFaviconIcon route={route} size={size} className={className} />;
  Icon.displayName = `RouteFavicon(${route})`;
  return Icon as LucideIcon;
}

/** Notes route badge — amber `#d97706` letter "N" from `/notes` favicon data. */
export const NotesRouteIcon = createRouteFaviconLucideIcon("/notes");
