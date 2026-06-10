"use client";

// run-b — unique, animated, per-kind stage loaders.
//
// Requirement: each step's RUNNING state must clearly stand out and look like
// what it's doing — not one generic spinner. So every StageKind gets its own
// small inline SVG animation (a sweeping radar for research, a pulsing waveform
// for audio, a typing cursor for the script, a developing photo for images, …).
//
// Requirement: the DONE state must NOT paint a filled chip background. It uses
// the kind's accent on the icon + a near-transparent tint only, so a finished
// step reads as a colored glyph, never a misplaced solid chip.

import {
  Globe,
  FileSearch,
  ListFilter,
  FileText,
  LayoutGrid,
  AudioLines,
  ImageIcon,
  Clapperboard,
  Circle,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StageKind } from "@/features/podcasts/generator/constants";

// Per-kind accent — text color for the glyph and a very light tint for the done
// halo. Deliberately NO opaque `bg-*` chip: the done state stays transparent.
const ACCENT: Record<StageKind, { text: string; stroke: string; halo: string }> =
  {
    research: { text: "text-sky-500", stroke: "stroke-sky-500", halo: "bg-sky-500/10" },
    prepare: { text: "text-violet-500", stroke: "stroke-violet-500", halo: "bg-violet-500/10" },
    post: { text: "text-amber-500", stroke: "stroke-amber-500", halo: "bg-amber-500/10" },
    script: { text: "text-blue-500", stroke: "stroke-blue-500", halo: "bg-blue-500/10" },
    metadata: { text: "text-pink-500", stroke: "stroke-pink-500", halo: "bg-pink-500/10" },
    audio: { text: "text-emerald-500", stroke: "stroke-emerald-500", halo: "bg-emerald-500/10" },
    image: { text: "text-fuchsia-500", stroke: "stroke-fuchsia-500", halo: "bg-fuchsia-500/10" },
    video: { text: "text-orange-500", stroke: "stroke-orange-500", halo: "bg-orange-500/10" },
    other: { text: "text-slate-400", stroke: "stroke-slate-400", halo: "bg-slate-400/10" },
  };

const DONE_ICON: Record<StageKind, LucideIcon> = {
  research: Globe,
  prepare: FileSearch,
  post: ListFilter,
  script: FileText,
  metadata: LayoutGrid,
  audio: AudioLines,
  image: ImageIcon,
  video: Clapperboard,
  other: Circle,
};

// ── The animated SVG per kind (running state only) ─────────────────────────
// Each is a 24×24 viewBox, currentColor-driven, with CSS keyframes scoped
// inside a <style> tag so they are fully self-contained.

function RunningGlyph({ kind }: { kind: StageKind }) {
  const a = ACCENT[kind];
  const c = cn("h-5 w-5", a.text);

  switch (kind) {
    case "research":
      // Radar sweep over a globe.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="none">
          <circle cx="12" cy="12" r="9" className={cn(a.stroke, "opacity-30")} strokeWidth="1.5" />
          <circle cx="12" cy="12" r="5" className={cn(a.stroke, "opacity-30")} strokeWidth="1.5" />
          <line x1="12" y1="12" x2="21" y2="12" className={a.stroke} strokeWidth="2" strokeLinecap="round" style={{ transformOrigin: "12px 12px", animation: "rb-spin 1.4s linear infinite" }} />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
      );
    case "prepare":
      // Document with scanning line.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="none">
          <rect x="5" y="3" width="14" height="18" rx="2" className={cn(a.stroke, "opacity-40")} strokeWidth="1.5" />
          <line x1="8" y1="8" x2="16" y2="8" className={cn(a.stroke, "opacity-30")} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="12" x2="16" y2="12" className={cn(a.stroke, "opacity-30")} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="8" y1="16" x2="13" y2="16" className={cn(a.stroke, "opacity-30")} strokeWidth="1.5" strokeLinecap="round" />
          <rect x="4" y="4" width="16" height="2.4" rx="1" fill="currentColor" style={{ animation: "rb-scan 1.6s ease-in-out infinite" }} />
        </svg>
      );
    case "post":
      // Sliders settling.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="none" strokeLinecap="round">
          <line x1="4" y1="7" x2="20" y2="7" className={cn(a.stroke, "opacity-30")} strokeWidth="1.5" />
          <line x1="4" y1="12" x2="20" y2="12" className={cn(a.stroke, "opacity-30")} strokeWidth="1.5" />
          <line x1="4" y1="17" x2="20" y2="17" className={cn(a.stroke, "opacity-30")} strokeWidth="1.5" />
          <circle cx="9" cy="7" r="2.2" fill="currentColor" style={{ animation: "rb-slide-a 1.8s ease-in-out infinite" }} />
          <circle cx="15" cy="12" r="2.2" fill="currentColor" style={{ animation: "rb-slide-b 1.8s ease-in-out infinite" }} />
          <circle cx="11" cy="17" r="2.2" fill="currentColor" style={{ animation: "rb-slide-a 2.1s ease-in-out infinite" }} />
        </svg>
      );
    case "script":
      // Typing line + blinking cursor.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="none" strokeLinecap="round">
          <line x1="5" y1="7" x2="14" y2="7" className={cn(a.stroke, "opacity-40")} strokeWidth="1.5" />
          <line x1="5" y1="12" x2="17" y2="12" className={cn(a.stroke, "opacity-40")} strokeWidth="1.5" />
          <line x1="5" y1="17" x2="10" y2="17" className={a.stroke} strokeWidth="1.5" style={{ animation: "rb-type 1.4s ease-in-out infinite" }} />
          <rect x="11" y="14.5" width="1.8" height="5" rx="0.9" fill="currentColor" style={{ animation: "rb-blink 0.9s step-end infinite" }} />
        </svg>
      );
    case "metadata":
      // Grid tiles popping in.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="currentColor">
          <rect x="4" y="4" width="7" height="7" rx="1.5" style={{ animation: "rb-pop 1.6s ease-in-out infinite" }} />
          <rect x="13" y="4" width="7" height="7" rx="1.5" style={{ animation: "rb-pop 1.6s ease-in-out infinite 0.2s" }} />
          <rect x="4" y="13" width="7" height="7" rx="1.5" style={{ animation: "rb-pop 1.6s ease-in-out infinite 0.4s" }} />
          <rect x="13" y="13" width="7" height="7" rx="1.5" style={{ animation: "rb-pop 1.6s ease-in-out infinite 0.6s" }} />
        </svg>
      );
    case "audio":
      // Live waveform bars.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="currentColor">
          {[0, 1, 2, 3, 4].map((i) => (
            <rect
              key={i}
              x={3 + i * 4}
              y="4"
              width="2.4"
              height="16"
              rx="1.2"
              style={{
                transformOrigin: "center",
                animation: `rb-wave 0.9s ease-in-out infinite ${i * 0.12}s`,
              }}
            />
          ))}
        </svg>
      );
    case "image":
      // Picture developing — frame with a rising fill.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="none">
          <rect x="4" y="5" width="16" height="14" rx="2" className={a.stroke} strokeWidth="1.5" />
          <rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" className="opacity-25" style={{ transformOrigin: "12px 19px", animation: "rb-develop 2s ease-in-out infinite" }} />
          <circle cx="9" cy="10" r="1.6" fill="currentColor" />
          <path d="M5 18l4-4 3 3 3-4 4 5" className={a.stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "video":
      // Clapperboard / playhead sweeping.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="none">
          <rect x="3" y="6" width="18" height="13" rx="2" className={a.stroke} strokeWidth="1.5" />
          <path d="M3 9h18" className={cn(a.stroke, "opacity-40")} strokeWidth="1.5" />
          <path d="M11 12l4 2.5-4 2.5z" fill="currentColor" />
          <line x1="6" y1="6" x2="6" y2="19" className="opacity-0" />
          <rect x="4" y="6" width="1.6" height="13" rx="0.8" fill="currentColor" style={{ animation: "rb-playhead 1.8s linear infinite" }} />
        </svg>
      );
    default:
      // Generic pulsing ring.
      return (
        <svg viewBox="0 0 24 24" className={c} fill="none">
          <circle cx="12" cy="12" r="8" className={a.stroke} strokeWidth="2" strokeLinecap="round" strokeDasharray="38" style={{ transformOrigin: "12px 12px", animation: "rb-spin 1s linear infinite" }} />
        </svg>
      );
  }
}

export interface StageLoaderProps {
  kind: StageKind;
  status: "running" | "done" | "failed";
  /** Larger glyph for the featured / hero step. */
  size?: "sm" | "lg";
}

export function StageLoader({ kind, status, size = "sm" }: StageLoaderProps) {
  const a = ACCENT[kind];
  const DoneIcon = DONE_ICON[kind];
  const box = size === "lg" ? "h-11 w-11" : "h-7 w-7";
  const glyph = size === "lg" ? "h-6 w-6" : "h-4 w-4";

  if (status === "failed") {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl bg-destructive/10",
          box,
        )}
      >
        <X className={cn(glyph, "text-destructive")} />
      </span>
    );
  }

  if (status === "done") {
    // Transparent done state: accent glyph on a near-transparent halo, with a
    // tiny corner check. NO solid chip background.
    return (
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-xl",
          a.halo,
          box,
        )}
      >
        <DoneIcon className={cn(glyph, a.text)} />
        <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-card">
          <Check className="h-2 w-2 text-white" strokeWidth={3.5} />
        </span>
      </span>
    );
  }

  // running — the unique animated glyph, inside a soft pulsing halo.
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-xl",
        box,
      )}
    >
      <span
        className={cn("absolute inset-0 rounded-xl", a.halo)}
        style={{ animation: "rb-pulse 1.6s ease-in-out infinite" }}
      />
      <span className={cn("relative flex items-center justify-center", glyph)}>
        <RunningGlyph kind={kind} />
      </span>
    </span>
  );
}

// All keyframes for the loaders — scoped once, injected by the page.
export function StageLoaderKeyframes() {
  return (
    <style>{`
      @keyframes rb-spin { to { transform: rotate(360deg); } }
      @keyframes rb-pulse { 0%,100% { opacity: 0.35; transform: scale(0.96); } 50% { opacity: 0.85; transform: scale(1.04); } }
      @keyframes rb-scan { 0% { transform: translateY(0); } 50% { transform: translateY(14px); } 100% { transform: translateY(0); } }
      @keyframes rb-slide-a { 0%,100% { transform: translateX(-3px); } 50% { transform: translateX(5px); } }
      @keyframes rb-slide-b { 0%,100% { transform: translateX(4px); } 50% { transform: translateX(-4px); } }
      @keyframes rb-type { 0% { stroke-dasharray: 0 12; } 60%,100% { stroke-dasharray: 12 0; } }
      @keyframes rb-blink { 50% { opacity: 0; } }
      @keyframes rb-pop { 0%,100% { opacity: 0.3; transform: scale(0.8); transform-box: fill-box; transform-origin: center; } 50% { opacity: 1; transform: scale(1); transform-box: fill-box; transform-origin: center; } }
      @keyframes rb-wave { 0%,100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
      @keyframes rb-develop { 0% { transform: scaleY(1); opacity: 0.4; } 100% { transform: scaleY(0); opacity: 0; } }
      @keyframes rb-playhead { 0% { transform: translateX(0); } 100% { transform: translateX(14px); } }
      @keyframes rb-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
    `}</style>
  );
}
