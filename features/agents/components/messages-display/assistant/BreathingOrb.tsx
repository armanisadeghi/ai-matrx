/**
 * BreathingOrb
 *
 * Live "thinking" indicator for an in-flight assistant turn. A two-layer orb
 * that scales like a slow breath (~3.2s in/out, eased) — a soft halo plus a
 * solid core slightly out of phase for an organic feel. Inherits its color
 * from the `text-*` class on the wrapper (`currentColor`).
 *
 * Ported from the matrx-extend Chrome extension chat. Uses SMIL so the
 * animation lives on the element itself and keeps running smoothly while the
 * surrounding message streams in (CSS keyframes can stutter under heavy
 * re-render). Rendered below the streaming message; it moves down as content
 * grows above it and unmounts the moment the stream ends.
 */

import { cn } from "@/lib/utils";

export interface BreathingOrbProps {
  className?: string;
  /** Pixel size of the SVG. Defaults to 28. */
  size?: number;
}

const KEY_SPLINES = "0.42 0 0.58 1; 0.42 0 0.58 1";

export function BreathingOrb({ className, size = 28 }: BreathingOrbProps) {
  return (
    <output
      className={cn("inline-flex items-center text-primary", className)}
      aria-label="Working"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <title>Working</title>
        <defs>
          <radialGradient id="breathing-orb-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="70%" stopColor="currentColor" stopOpacity="0.05" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Soft halo */}
        <circle cx="20" cy="20" r="14" fill="url(#breathing-orb-halo)">
          <animate
            attributeName="r"
            values="12;18;12"
            dur="3.2s"
            calcMode="spline"
            keySplines={KEY_SPLINES}
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="0.6;1;0.6"
            dur="3.2s"
            calcMode="spline"
            keySplines={KEY_SPLINES}
            repeatCount="indefinite"
          />
        </circle>
        {/* Solid core — slightly out of phase for organic feel */}
        <circle cx="20" cy="20" r="6" fill="currentColor">
          <animate
            attributeName="r"
            values="5;8;5"
            dur="3.2s"
            calcMode="spline"
            keySplines={KEY_SPLINES}
            repeatCount="indefinite"
            begin="0.15s"
          />
          <animate
            attributeName="opacity"
            values="0.7;1;0.7"
            dur="3.2s"
            calcMode="spline"
            keySplines={KEY_SPLINES}
            repeatCount="indefinite"
            begin="0.15s"
          />
        </circle>
      </svg>
    </output>
  );
}
