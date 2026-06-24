"use client";

/**
 * IconResolver.dynamic — front door for the low-level icon-by-name renderer.
 *
 * ⚠️ DB-ONLY. Same rule as DynamicIcon.dynamic: this exists ONLY for rendering a
 * user-defined icon name loaded from the DATABASE. Hardcoded icons in app code
 * (menus, headers, buttons) must import directly from lucide-react or use the
 * Matrx SVG / TapTarget set. Misusing this trips [IconResolver][TRIPWIRE].
 *
 * WHY THIS EXISTS
 * Same reason as `DynamicIcon.dynamic.tsx`: `IconResolver.tsx` statically
 * imports the full lucide-react + react-icons payload, so a STATIC value import
 * of the default `IconResolver` component leaks that weight into the importing
 * chunk. This wrapper splits it ONCE via `next/dynamic({ ssr: false })`
 * (Method B "front door" — see the code-splitting skill), so the payload only
 * loads when an icon renders. Callsites import THIS module, never
 * `@/components/official/icons/IconResolver` directly.
 *
 * Prefer {@link DynamicIcon} (the color/size-aware wrapper) for most UI. Use
 * this lower-level resolver only when you need the raw `iconName`/`size`/`style`
 * contract.
 *
 * Props type is declared here (in the shell) so consumers get types without
 * pulling the heavy core into their graph.
 */

import type React from "react";
import dynamic from "next/dynamic";

/**
 * Props for {@link IconResolver}. Mirrors the internal `IconResolverProps`
 * contract in `IconResolver.tsx`. Declared in the shell so importing the type
 * never drags in the icon payload.
 */
export interface IconResolverProps {
  iconName: string | null;
  className?: string;
  size?: number;
  fallbackIcon?: string;
  style?: React.CSSProperties;
}

function IconGlyphSkeleton() {
  return (
    <span
      className="inline-block h-4 w-4 animate-pulse rounded-sm bg-muted align-middle"
      aria-hidden
    />
  );
}

const IconResolver = dynamic(() => import("./IconResolver"), {
  ssr: false,
  loading: IconGlyphSkeleton,
});

export default IconResolver;
