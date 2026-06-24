"use client";

/**
 * DynamicIcon.dynamic — the ONLY sanctioned entry point for rendering an icon
 * whose name comes from the DATABASE (user-defined icons).
 *
 * ⚠️ DB-ONLY. If you are rendering a KNOWN, hardcoded icon in app code (a menu,
 * a header, a button, anything that isn't a user-defined value loaded from the
 * DB), DO NOT use this. Import the icon directly:
 *     import { Flame } from "lucide-react";
 * or use the server-eligible Matrx SVG / TapTarget icon set. Routing a hardcoded
 * icon through this system drags the entire icon payload into your chunk and
 * trips the [IconResolver][TRIPWIRE] logs — that is always a bug.
 *
 * WHY THIS EXISTS
 * `IconResolver.tsx` statically imports ~145 lucide-react icons + ~30
 * react-icons/fc + react-icons/fa6. Any STATIC value import of `DynamicIcon`
 * (or anything else) from that module drags the whole icon payload into the
 * importing chunk. With ~70 importers that weight gets compiled into many
 * chunks — a build-time leak of the exact class that ballooned the build for
 * the canonical context menu (see the code-splitting skill).
 *
 * This wrapper does the split ONCE (Method B "front door"): it loads the heavy
 * component via `next/dynamic({ ssr: false })`, so the icon payload only enters
 * a chunk when an icon actually renders. Callsites import THIS module, never
 * `@/components/official/icons/IconResolver` directly.
 *
 * Props type is declared here (in the shell) so consumers get types without
 * pulling the heavy core into their graph.
 */

import dynamic from "next/dynamic";

/**
 * Props for {@link DynamicIcon}. Mirrors the `IconProps` contract in
 * `IconResolver.tsx`. Declared in the shell so importing the type never drags
 * in the icon payload.
 *
 * - `color` accepts a Tailwind color name (e.g. "blue", "zinc") or a hex
 *   string (e.g. "#ff0000").
 * - `size` is a Tailwind size step (h-/w-), not pixels.
 */
export interface DynamicIconProps {
  name: string | null;
  color?: string;
  size?: number;
  className?: string;
  fallbackIcon?: string;
}

function IconGlyphSkeleton() {
  return (
    <span
      className="inline-block h-4 w-4 animate-pulse rounded-sm bg-muted align-middle"
      aria-hidden
    />
  );
}

const DynamicIcon = dynamic(
  () => import("./IconResolver").then((m) => m.DynamicIcon),
  { ssr: false, loading: IconGlyphSkeleton },
);

export default DynamicIcon;
