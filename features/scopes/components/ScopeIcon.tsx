"use client";

/**
 * ScopeIcon — the ONE component for rendering a scope / scope-type / template
 * icon whose name comes from the DATABASE.
 *
 * Scope-type icons (`scope_type.icon`, `scope.icon`, template `icon`) are
 * user/admin-defined names stored in the DB, so they MUST resolve through a
 * dynamic front door (never a static IconResolver import — that leaks the
 * ~145-icon payload into the build).
 *
 * Two-phase render:
 *   1. FIRST PAINT — a plain, hardcoded `Boxes` lucide icon in the right color.
 *      `Boxes` is a DIRECT lucide import, so this paint pulls ZERO dynamic
 *      payload. No animation, no pulsing background.
 *   2. AFTER MOUNT — a `useEffect` flips `mounted`, and only then do we render
 *      the dynamic `IconResolver` (the heavy chunk), which resolves the real
 *      DB icon name. A short opacity fade swaps it in.
 *
 * Color contract (matches the app via the LEAN, payload-free `icon-resolve`
 * helpers):
 *   - hex (`#2563eb`) → inline `style={{ color }}`.
 *   - tailwind name (`blue`) → `text-blue-600 dark:text-blue-400`.
 *   - absent → inherits the parent's `currentColor`.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getTextColorClass,
  isHexColor,
} from "@/components/official/icons/icon-resolve";

const IconResolver = dynamic(
  () => import("@/components/official/icons/IconResolver"),
  { ssr: false },
);

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

export function ScopeIcon({
  name,
  color,
  className,
  fallbackIcon = "Boxes",
}: ScopeIconProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { colorClass, colorStyle } = resolveColorBits(color);
  const sizeClass = className ?? "h-4 w-4";
  const iconClass = cn("shrink-0", sizeClass, colorClass);

  // Phase 1: plain hardcoded icon (direct lucide import — no dynamic payload).
  if (!mounted) {
    return <Boxes className={iconClass} style={colorStyle} aria-hidden />;
  }

  // Phase 2: the real DB icon, loaded dynamically.
  return (
    <span
      className={cn(
        "inline-flex shrink-0 animate-in fade-in duration-200",
        sizeClass,
        colorClass,
      )}
      style={colorStyle}
    >
      <IconResolver
        iconName={name ?? null}
        fallbackIcon={fallbackIcon}
        className="h-full w-full"
      />
    </span>
  );
}

export default ScopeIcon;
