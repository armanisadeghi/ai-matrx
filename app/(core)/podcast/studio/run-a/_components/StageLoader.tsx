"use client";

// app/(core)/podcast/studio/run-a/_components/StageLoader.tsx
//
// The signature element of the run redesign: a UNIQUE animated loader per stage
// kind. Each running state is a bespoke mini-animation that matches the work —
// research scans, the script writes with a blinking caret, audio pulses like an
// equalizer, images develop, video reels spin. The DONE state is a flat,
// accent-colored icon on a TRANSPARENT background (the fix for the old
// out-of-place colored chip) with a small corner check; FAILED is a quiet red.

import { Check, X } from "lucide-react";
import {
  STAGE_KIND_ICON,
  STAGE_KIND_COLOR,
  type StageKind,
} from "@/features/podcasts/generator/constants";
import { cn } from "@/lib/utils";
import type { StageStatus } from "@/features/podcasts/generator/types";

interface StageLoaderProps {
  kind: StageKind;
  status: StageStatus;
  /** sm = inline timeline row; lg = the featured "now running" hero. */
  size?: "sm" | "lg";
}

export function StageLoader({ kind, status, size = "sm" }: StageLoaderProps) {
  const color = STAGE_KIND_COLOR[kind];
  const box = size === "lg" ? "h-11 w-11" : "h-7 w-7";

  // ── FAILED — quiet, transparent, red. ──
  if (status === "failed") {
    return (
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl",
          box,
        )}
      >
        <X
          className={cn(
            "text-destructive",
            size === "lg" ? "h-5 w-5" : "h-4 w-4",
          )}
        />
      </span>
    );
  }

  // ── DONE — accent-colored icon, TRANSPARENT background (the coloring fix). ──
  if (status === "done") {
    const Icon = STAGE_KIND_ICON[kind];
    return (
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl",
          box,
        )}
      >
        <Icon
          className={cn(color.text, size === "lg" ? "h-5 w-5" : "h-4 w-4")}
        />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-emerald-500 text-white",
            size === "lg" ? "h-4 w-4" : "h-3 w-3",
          )}
        >
          <Check className={size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2"} strokeWidth={3} />
        </span>
      </span>
    );
  }

  // ── RUNNING — the bespoke per-kind animation. ──
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl",
        box,
        color.bg,
      )}
    >
      {/* ambient halo */}
      <span
        className={cn(
          "runa-halo absolute inset-0 rounded-xl",
          color.bg,
        )}
        aria-hidden
      />
      <RunningGlyph kind={kind} colorText={color.text} large={size === "lg"} />
    </span>
  );
}

/** The per-kind animated glyph. Drawn with small SVGs so motion is precise. */
function RunningGlyph({
  kind,
  colorText,
  large,
}: {
  kind: StageKind;
  colorText: string;
  large: boolean;
}) {
  const s = large ? 22 : 16;
  const stroke = colorText;

  switch (kind) {
    case "research":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className={cn(stroke)}>
          <circle
            cx="12"
            cy="12"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="1.5"
          />
          <g className="runa-scan" style={{ transformBox: "fill-box" }}>
            <line
              x1="12"
              y1="12"
              x2="12"
              y2="4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
      );

    case "prepare":
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          className={cn(stroke, "runa-bob")}
          style={{ transformBox: "fill-box" }}
        >
          <rect
            x="5"
            y="4"
            width="14"
            height="16"
            rx="2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <line x1="8" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "script":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className={cn(stroke)}>
          <g className="runa-write" style={{ transformBox: "fill-box" }}>
            <path
              d="M5 19 L15 9 L18 12 L8 22 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              transform="scale(0.7) translate(3 -2)"
            />
          </g>
          <line
            x1="6"
            y1="20"
            x2="14"
            y2="20"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="runa-caret"
          />
        </svg>
      );

    case "metadata":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className={cn(stroke)}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" fill="currentColor" className="runa-pop runa-pop-1" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
          <rect x="13" y="4" width="7" height="7" rx="1.5" fill="currentColor" className="runa-pop runa-pop-2" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
          <rect x="4" y="13" width="7" height="7" rx="1.5" fill="currentColor" className="runa-pop runa-pop-3" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
          <rect x="13" y="13" width="7" height="7" rx="1.5" fill="currentColor" className="runa-pop runa-pop-4" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        </svg>
      );

    case "audio":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className={cn(stroke)}>
          <rect x="4" y="6" width="3" height="12" rx="1.5" fill="currentColor" className="runa-eq runa-eq-1" style={{ transformBox: "fill-box" }} />
          <rect x="9" y="6" width="3" height="12" rx="1.5" fill="currentColor" className="runa-eq runa-eq-2" style={{ transformBox: "fill-box" }} />
          <rect x="14" y="6" width="3" height="12" rx="1.5" fill="currentColor" className="runa-eq runa-eq-3" style={{ transformBox: "fill-box" }} />
          <rect x="19" y="6" width="2.5" height="12" rx="1.5" fill="currentColor" className="runa-eq runa-eq-4" style={{ transformBox: "fill-box" }} />
        </svg>
      );

    case "image":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className={cn(stroke)}>
          <defs>
            <clipPath id="runa-img-clip">
              <rect x="4" y="5" width="16" height="14" rx="2" />
            </clipPath>
          </defs>
          <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="9" cy="10" r="1.6" fill="currentColor" />
          <path d="M5 18 L11 12 L15 16 L18 13 L20 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <g clipPath="url(#runa-img-clip)">
            <rect x="0" y="5" width="5" height="14" fill="currentColor" opacity="0.5" className="runa-develop" />
          </g>
        </svg>
      );

    case "video":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" className={cn(stroke)}>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <g className="runa-reel" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            <circle cx="12" cy="7" r="1.4" fill="currentColor" />
            <circle cx="12" cy="17" r="1.4" fill="currentColor" />
            <circle cx="7" cy="12" r="1.4" fill="currentColor" />
            <circle cx="17" cy="12" r="1.4" fill="currentColor" />
          </g>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
      );

    default:
      return (
        <svg
          width={s}
          height={s}
          viewBox="0 0 24 24"
          className={cn(stroke, "runa-spin")}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
        >
          <circle
            cx="12"
            cy="12"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="14 30"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
