"use client";

/**
 * ScopeIcon — DB scope-type icon renderer.
 *
 * ⚠️ TEMPORARY BISECT BUILD (2026-06-23): this version renders ONLY a plain,
 * direct `Boxes` lucide icon and contains NO `next/dynamic` import at all. Its
 * sole purpose is to measure whether the `next/dynamic(() => import(
 * "IconResolver"))` split point introduced by this component is what spiked the
 * production build time. Once we have a clean measurement we restore real DB
 * icon resolution.
 *
 * Color contract (lean, payload-free helpers):
 *   - hex (`#2563eb`) → inline `style={{ color }}`.
 *   - tailwind name (`blue`) → `text-blue-600 dark:text-blue-400`.
 *   - absent → inherits the parent's `currentColor`.
 */

import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTextColorClass,
  isHexColor,
} from "@/components/official/icons/icon-resolve";

export interface ScopeIconProps {
  /** DB-defined icon name (lucide name, custom id, or `svg:` asset). */
  name: string | null | undefined;
  /** Scope color — Tailwind name or hex. */
  color?: string | null;
  /** Extra classes (sizing lives here, e.g. `h-4 w-4`). Defaults to `h-4 w-4`. */
  className?: string;
  /** Fallback icon name when `name` is missing/unresolvable. */
  fallbackIcon?: string;
}

function resolveColorBits(color?: string | null) {
  if (!color) return { colorClass: undefined, colorStyle: undefined };
  if (isHexColor(color)) {
    return { colorClass: undefined, colorStyle: { color } as const };
  }
  return {
    colorClass: getTextColorClass(color) ?? undefined,
    colorStyle: undefined,
  };
}

export function ScopeIcon({ color, className }: ScopeIconProps) {
  const { colorClass, colorStyle } = resolveColorBits(color);
  const sizeClass = className ?? "h-4 w-4";
  return (
    <Boxes
      className={cn("shrink-0", sizeClass, colorClass)}
      style={colorStyle}
      aria-hidden
    />
  );
}

export default ScopeIcon;
