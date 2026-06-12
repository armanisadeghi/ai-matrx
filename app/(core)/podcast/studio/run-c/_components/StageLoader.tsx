"use client";

// app/(core)/podcast/studio/run-c/_components/StageLoader.tsx
//
// Per-kind animated stage loaders — the centerpiece of the run-c redesign.
// Each StageKind gets a DISTINCT, custom-animated icon that visually matches
// what the step is doing (research = sweeping radar, script = a writing pen,
// audio = a live waveform, image = shimmering tiles, video = a film reel, …).
// The running state STANDS OUT; the done state uses a transparent background
// with the kind's accent color only (fixing the old misplaced-chip look).

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
import type { StageKind } from "@/features/podcasts/generator/constants";
import { cn } from "@/lib/utils";

// One accent token per kind — drives both the running animation and the
// transparent-background done state. Using explicit utility strings (not
// computed) so Tailwind keeps them.
interface KindStyle {
  text: string;
  border: string;
  bgSoft: string;
  glow: string;
  icon: LucideIcon;
}

const KIND_STYLE: Record<StageKind, KindStyle> = {
  research: { text: "text-sky-500", border: "border-sky-500/40", bgSoft: "bg-sky-500/10", glow: "shadow-[0_0_0_3px_rgba(14,165,233,0.12)]", icon: Globe },
  prepare: { text: "text-violet-500", border: "border-violet-500/40", bgSoft: "bg-violet-500/10", glow: "shadow-[0_0_0_3px_rgba(139,92,246,0.12)]", icon: FileSearch },
  post: { text: "text-amber-500", border: "border-amber-500/40", bgSoft: "bg-amber-500/10", glow: "shadow-[0_0_0_3px_rgba(245,158,11,0.12)]", icon: ListFilter },
  script: { text: "text-blue-500", border: "border-blue-500/40", bgSoft: "bg-blue-500/10", glow: "shadow-[0_0_0_3px_rgba(59,130,246,0.12)]", icon: FileText },
  metadata: { text: "text-pink-500", border: "border-pink-500/40", bgSoft: "bg-pink-500/10", glow: "shadow-[0_0_0_3px_rgba(236,72,153,0.12)]", icon: LayoutGrid },
  audio: { text: "text-emerald-500", border: "border-emerald-500/40", bgSoft: "bg-emerald-500/10", glow: "shadow-[0_0_0_3px_rgba(16,185,129,0.12)]", icon: AudioLines },
  image: { text: "text-fuchsia-500", border: "border-fuchsia-500/40", bgSoft: "bg-fuchsia-500/10", glow: "shadow-[0_0_0_3px_rgba(217,70,239,0.12)]", icon: ImageIcon },
  video: { text: "text-orange-500", border: "border-orange-500/40", bgSoft: "bg-orange-500/10", glow: "shadow-[0_0_0_3px_rgba(249,115,22,0.12)]", icon: Clapperboard },
  other: { text: "text-slate-400", border: "border-slate-400/40", bgSoft: "bg-slate-400/10", glow: "shadow-[0_0_0_3px_rgba(148,163,184,0.12)]", icon: Circle },
};

export function kindAccentText(kind: StageKind): string {
  return KIND_STYLE[kind].text;
}

type Status = "pending" | "running" | "done" | "failed";

/**
 * The animated loader. `size` is the box edge in px. While running, each kind
 * renders a bespoke animation; otherwise a static accent icon (done) /
 * transparent muted icon (pending) / red X (failed).
 */
export function StageLoader({
  kind,
  status,
  size = 36,
}: {
  kind: StageKind;
  status: Status;
  size?: number;
}) {
  const style = KIND_STYLE[kind];

  if (status === "failed") {
    return (
      <span
        className="flex items-center justify-center rounded-xl bg-destructive/10"
        style={{ width: size, height: size }}
      >
        <X className="h-1/2 w-1/2 text-destructive" />
      </span>
    );
  }

  // DONE — transparent background, accent icon + a tiny corner check. No filled
  // chip (this is the fix for the old "misplaced chip" look).
  if (status === "done") {
    const Icon = style.icon;
    return (
      <span
        className={cn(
          "relative flex items-center justify-center rounded-xl border bg-transparent",
          style.border,
        )}
        style={{ width: size, height: size }}
      >
        <Icon className={cn("h-1/2 w-1/2", style.text)} />
        <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-card">
          <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
        </span>
      </span>
    );
  }

  if (status === "pending") {
    const Icon = style.icon;
    return (
      <span
        className="flex items-center justify-center rounded-xl border border-dashed border-border bg-transparent"
        style={{ width: size, height: size }}
      >
        <Icon className="h-1/2 w-1/2 text-muted-foreground/50" />
      </span>
    );
  }

  // RUNNING — bespoke, attention-grabbing per-kind animation.
  return (
    <span
      className={cn(
        "relative flex items-center justify-center rounded-xl border",
        style.border,
        style.bgSoft,
        style.glow,
      )}
      style={{ width: size, height: size }}
    >
      <RunningArt kind={kind} className={style.text} />
    </span>
  );
}

// ── The per-kind running artwork. Each is a self-contained SVG with inline
//    <style> keyframes scoped via a unique class, so no global CSS is touched. ──

function RunningArt({ kind, className }: { kind: StageKind; className: string }) {
  switch (kind) {
    case "research":
      return <ResearchArt className={className} />;
    case "prepare":
      return <PrepareArt className={className} />;
    case "script":
      return <ScriptArt className={className} />;
    case "metadata":
      return <MetadataArt className={className} />;
    case "audio":
      return <AudioArt className={className} />;
    case "image":
      return <ImageArt className={className} />;
    case "video":
      return <VideoArt className={className} />;
    case "post":
      return <PostArt className={className} />;
    default:
      return <OtherArt className={className} />;
  }
}

const SVG = "h-[58%] w-[58%]";

// Radar sweep — researching the web.
function ResearchArt({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <style>{`@keyframes rc-sweep{to{transform:rotate(360deg)}}`}</style>
      <circle cx="12" cy="12" r="9" opacity="0.35" />
      <circle cx="12" cy="12" r="5" opacity="0.55" />
      <line x1="12" y1="12" x2="21" y2="12" style={{ transformOrigin: "12px 12px", animation: "rc-sweep 1.6s linear infinite" }} />
    </svg>
  );
}

// Scanning magnifier over lines — preparing content.
function PrepareArt({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <style>{`@keyframes rc-scan{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}`}</style>
      <line x1="6" y1="7" x2="18" y2="7" opacity="0.4" />
      <line x1="6" y1="11" x2="16" y2="11" opacity="0.4" />
      <line x1="6" y1="15" x2="18" y2="15" opacity="0.4" />
      <g style={{ animation: "rc-scan 1.4s ease-in-out infinite" }}>
        <circle cx="11" cy="11" r="4" />
        <line x1="14" y1="14" x2="17.5" y2="17.5" />
      </g>
    </svg>
  );
}

// Writing pen with a dotted line filling in — writing the script.
function ScriptArt({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <style>{`@keyframes rc-write{0%{transform:translate(0,0)}50%{transform:translate(3px,1px)}100%{transform:translate(0,0)}}`}</style>
      <line x1="5" y1="18" x2="14" y2="18" opacity="0.45" strokeDasharray="2 2" />
      <g style={{ animation: "rc-write 1s ease-in-out infinite", transformOrigin: "center" }}>
        <path d="M5 15 L14 6 L17 9 L8 18 L5 18 Z" fill="currentColor" fillOpacity="0.12" />
        <path d="M14 6 L17 9" />
      </g>
    </svg>
  );
}

// Pulsing grid tiles — assembling metadata (title/cover/video concepts).
function MetadataArt({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="currentColor">
      <style>{`@keyframes rc-tile{0%,100%{opacity:.25}50%{opacity:1}}`}</style>
      {[
        { x: 4, y: 4, d: 0 },
        { x: 13, y: 4, d: 0.2 },
        { x: 4, y: 13, d: 0.4 },
        { x: 13, y: 13, d: 0.6 },
      ].map((t) => (
        <rect
          key={`${t.x}-${t.y}`}
          x={t.x}
          y={t.y}
          width="7"
          height="7"
          rx="1.5"
          style={{ animation: `rc-tile 1.2s ease-in-out ${t.d}s infinite` }}
        />
      ))}
    </svg>
  );
}

// Live equalizer bars — producing audio.
function AudioArt({ className }: { className: string }) {
  const bars = [
    { x: 4, d: 0 },
    { x: 9, d: 0.15 },
    { x: 14, d: 0.3 },
    { x: 19, d: 0.45 },
  ];
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="currentColor">
      <style>{`@keyframes rc-eq{0%,100%{height:4px;y:10px}50%{height:16px;y:4px}}`}</style>
      {bars.map((b) => (
        <rect
          key={b.x}
          x={b.x - 1.4}
          width="2.8"
          rx="1.4"
          height="4"
          y="10"
          style={{ animation: `rc-eq 0.9s ease-in-out ${b.d}s infinite` }}
        />
      ))}
    </svg>
  );
}

// Shimmering image frame with a moving highlight — generating cover art.
function ImageArt({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <style>{`@keyframes rc-shimmer{0%{opacity:.2}50%{opacity:.9}100%{opacity:.2}}`}</style>
      <rect x="3" y="5" width="18" height="14" rx="2" opacity="0.5" />
      <circle cx="8" cy="10" r="1.6" fill="currentColor" stroke="none" />
      <path d="M4 17 L9 12 L13 15 L17 10 L20 13" style={{ animation: "rc-shimmer 1.1s ease-in-out infinite" }} />
    </svg>
  );
}

// Spinning film reel — producing video.
function VideoArt({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="none" stroke="currentColor" strokeWidth={1.6}>
      <style>{`@keyframes rc-reel{to{transform:rotate(360deg)}}`}</style>
      <g style={{ transformOrigin: "12px 12px", animation: "rc-reel 2s linear infinite" }}>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="7" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="17" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="17" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="7" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

// Sliding filter bars — post-processing.
function PostArt({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <style>{`@keyframes rc-knob1{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}@keyframes rc-knob2{0%,100%{transform:translateX(3px)}50%{transform:translateX(-3px)}}`}</style>
      <line x1="4" y1="8" x2="20" y2="8" opacity="0.4" />
      <line x1="4" y1="16" x2="20" y2="16" opacity="0.4" />
      <circle cx="10" cy="8" r="2.2" fill="currentColor" stroke="none" style={{ animation: "rc-knob1 1.3s ease-in-out infinite" }} />
      <circle cx="14" cy="16" r="2.2" fill="currentColor" stroke="none" style={{ animation: "rc-knob2 1.3s ease-in-out infinite" }} />
    </svg>
  );
}

function OtherArt({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn(SVG, className)} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <style>{`@keyframes rc-pulse{0%,100%{opacity:.3}50%{opacity:1}}`}</style>
      <circle cx="12" cy="12" r="6" style={{ animation: "rc-pulse 1.1s ease-in-out infinite" }} />
    </svg>
  );
}
