"use client";

/**
 * ScopeIcon — the ONE component for rendering a scope / scope-type / template
 * icon whose name comes from the DATABASE.
 *
 * Scope-type icons (`scope_type.icon`, `scope.icon`, template `icon`) are
 * user/admin-defined names stored in the DB, so they MUST resolve through the
 * DB-only DynamicIcon front door (never a static IconResolver import — that
 * leaks the ~145-icon payload into the build; see the [IconResolver][TRIPWIRE]
 * hunt). Scopes render in MANY places (org workspace, scope hub, chips,
 * taggers, template gallery, detail views), so the right move is a single
 * reusable primitive that does the dynamic part correctly and cheaply.
 *
 * How it stays cheap:
 *   1. Renders an animated, payload-free placeholder INSTANTLY — a soft pulsing
 *      glyph tinted with the scope's color, so the UI reads as "a category" the
 *      moment it paints.
 *   2. Defers mounting the heavy DynamicIcon until the component is actually
 *      committed + idle (so the icon chunk isn't even requested during the
 *      initial render pass of a long list).
 *   3. Cross-fades the resolved icon in over the placeholder — the "cool effect"
 *      is free: it's just opacity on two stacked layers.
 *
 * All of this is internal. Callers just do `<ScopeIcon name={t.icon}
 * color={t.color} />`.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

// The heavy renderer, behind the dynamic front door. Lazily required only when
// this component decides to mount it (post-commit), so the chunk is requested
// at the latest possible moment.
const DynamicIcon = dynamic(
  () => import("@/components/official/icons/IconResolver").then((m) => m.DynamicIcon),
  { ssr: false, loading: () => null },
);

export interface ScopeIconProps {
  /** DB-defined icon name (lucide name, custom id, or `svg:` asset). */
  name: string | null | undefined;
  /** Scope color — Tailwind name or hex. Tints both placeholder and icon. */
  color?: string | null;
  /** Extra classes (sizing lives here, e.g. `h-4 w-4`). */
  className?: string;
  /** Fallback icon name when `name` is missing/unresolvable. */
  fallbackIcon?: string;
}

/**
 * Animated placeholder: a tinted, softly-pulsing rounded glyph. Zero icon
 * payload — pure CSS — so it paints instantly for every row in a list.
 */
function ScopeIconPlaceholder({
  color,
  className,
}: {
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-[5px] animate-pulse",
        "h-4 w-4",
        className,
      )}
      style={{
        backgroundColor: color ? `${color}` : "currentColor",
        opacity: 0.35,
      }}
    />
  );
}

export function ScopeIcon({
  name,
  color,
  className,
  fallbackIcon = "Boxes",
}: ScopeIconProps) {
  // Gate the heavy icon mount until after commit + a microtask, so the chunk is
  // not pulled during the synchronous render of a (potentially long) list.
  const [showReal, setShowReal] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShowReal(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <span className={cn("relative inline-flex shrink-0", "h-4 w-4", className)}>
      {/* Placeholder layer — fades OUT once the real icon is ready. */}
      <span
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          showReal ? "opacity-0" : "opacity-100",
        )}
      >
        <ScopeIconPlaceholder color={color} className="h-full w-full" />
      </span>

      {/* Real icon layer — mounts post-commit, fades IN. */}
      {showReal && (
        <span className="absolute inset-0 animate-in fade-in duration-300">
          <DynamicIcon
            name={name ?? null}
            color={color ?? undefined}
            fallbackIcon={fallbackIcon}
            className="h-full w-full"
          />
        </span>
      )}
    </span>
  );
}

export default ScopeIcon;
