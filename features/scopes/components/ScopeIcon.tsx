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

// Inlined, payload-free color helpers (the old lean `icon-resolve` module was
// removed in the icon-refactor revert). Kept local so ScopeIcon never imports
// the heavy IconResolver just for two trivial pure functions.
const isHexColor = (color: string): boolean =>
  /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);

const TEXT_COLOR_CLASS: Record<string, string> = {
  gray: "text-gray-600 dark:text-gray-400",
  rose: "text-rose-600 dark:text-rose-400",
  blue: "text-blue-600 dark:text-blue-400",
  amber: "text-amber-600 dark:text-amber-400",
  cyan: "text-cyan-600 dark:text-cyan-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  fuchsia: "text-fuchsia-600 dark:text-fuchsia-400",
  green: "text-green-600 dark:text-green-400",
  indigo: "text-indigo-600 dark:text-indigo-400",
  lime: "text-lime-600 dark:text-lime-400",
  neutral: "text-neutral-600 dark:text-neutral-400",
  orange: "text-orange-600 dark:text-orange-400",
  pink: "text-pink-600 dark:text-pink-400",
  purple: "text-purple-600 dark:text-purple-400",
  red: "text-red-600 dark:text-red-400",
  sky: "text-sky-600 dark:text-sky-400",
  slate: "text-slate-600 dark:text-slate-400",
  stone: "text-stone-600 dark:text-stone-400",
  teal: "text-teal-600 dark:text-teal-400",
  violet: "text-violet-600 dark:text-violet-400",
  yellow: "text-yellow-600 dark:text-yellow-400",
  zinc: "text-zinc-600 dark:text-zinc-400",
};

const getTextColorClass = (color?: string): string | null => {
  if (!color) return null;
  if (isHexColor(color)) return null;
  return TEXT_COLOR_CLASS[color.toLowerCase()] ?? null;
};

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
