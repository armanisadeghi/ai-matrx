"use client";

/**
 * RandomWheelInline — animated renderer for the `random_wheel` server tool.
 *
 * Lifecycle (driven entirely by `entry.status`, never by array shape):
 *   started / progress / step → wheel is spinning.
 *   completed                 → landed; `entry.result` holds the final output.
 *   error                     → show error (`entry.errorMessage`).
 *
 * The spin parameters arrive in a `tool_step` event whose `data.step === "spin"`
 * with the payload nested under `data.metadata`. The final result lands on
 * `entry.result`. The server sleeps `spin_duration_ms` then sends `completed`,
 * so the animation and the result arrive ~together.
 *
 * Persisted / reduced-motion: snap straight to the winner, no fresh long spin.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Dices,
  RefreshCw,
  Trophy,
  Globe,
  ImageIcon,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Camera,
} from "lucide-react";

import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { setContextEntry } from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { filterStepEvents, isTerminal, resultAsObject } from "../_shared";
import type {
  RandomWheelImage,
  RandomWheelMode,
  RandomWheelResult,
  RandomWheelSource,
  ResolvedWheel,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants (behavior tuning — not feature flags)
// ─────────────────────────────────────────────────────────────────────────────

/** Full rotations the wheel makes before settling on the winner. */
const SPIN_FULL_TURNS = 6;
/** Minimum on-screen animation so even a tiny spin_duration_ms still reads. */
const MIN_VISIBLE_SPIN_MS = 600;
/** Wheel diameter in px (the SVG is square). Big enough to read 15–20 radial labels. */
const WHEEL_SIZE = 320;

/** Theme-token segment fills — alternate so neighbours are distinguishable.
 *  These reference CSS variables so they work in light AND dark mode. */
const SEGMENT_FILLS = [
  "var(--color-primary, hsl(var(--primary)))",
  "var(--color-secondary, hsl(var(--secondary)))",
  "var(--color-muted, hsl(var(--muted)))",
  "var(--color-accent, hsl(var(--accent)))",
] as const;

const SEGMENT_TEXT_FILLS = [
  "var(--color-primary-foreground, hsl(var(--primary-foreground)))",
  "var(--color-secondary-foreground, hsl(var(--secondary-foreground)))",
  "var(--color-muted-foreground, hsl(var(--muted-foreground)))",
  "var(--color-accent-foreground, hsl(var(--accent-foreground)))",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Resolution helpers
// ─────────────────────────────────────────────────────────────────────────────

const MODE_META: Record<
  RandomWheelMode,
  { label: string; Icon: typeof Globe }
> = {
  list: { label: "Random pick", Icon: Dices },
  web: { label: "Web lookup", Icon: Globe },
  image: { label: "Stock image", Icon: ImageIcon },
};

function asMode(value: unknown): RandomWheelMode {
  return value === "web" || value === "image" || value === "list"
    ? value
    : "list";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v : String(v ?? "")));
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length <= 0) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), length - 1);
}

/** Parse the typed result envelope, defaulting every field so we never crash. */
function parseResult(entry: ToolLifecycleEntry): RandomWheelResult | null {
  const raw = resultAsObject(entry);
  if (!raw) return null;

  const candidates = asStringArray(raw.candidates);
  const mode = asMode(raw.mode);
  const chosenRaw = (raw.chosen ?? null) as {
    label?: unknown;
    value?: unknown;
  } | null;

  const sourcesRaw = raw.sources;
  const sources: RandomWheelSource[] | null = Array.isArray(sourcesRaw)
    ? sourcesRaw
        .map((s): RandomWheelSource | null => {
          const obj = (s ?? {}) as { url?: unknown; title?: unknown };
          const url = typeof obj.url === "string" ? obj.url : "";
          if (!url) return null;
          return {
            url,
            title: typeof obj.title === "string" ? obj.title : undefined,
          };
        })
        .filter((s): s is RandomWheelSource => s !== null)
    : null;

  const imageRaw = raw.image as Record<string, unknown> | null | undefined;
  const image: RandomWheelImage | null =
    imageRaw && typeof imageRaw === "object" && typeof imageRaw.url === "string"
      ? {
          url: imageRaw.url,
          thumb:
            typeof imageRaw.thumb === "string" ? imageRaw.thumb : undefined,
          photographer_name:
            typeof imageRaw.photographer_name === "string"
              ? imageRaw.photographer_name
              : undefined,
          photographer_url:
            typeof imageRaw.photographer_url === "string"
              ? imageRaw.photographer_url
              : undefined,
          description:
            typeof imageRaw.description === "string"
              ? imageRaw.description
              : undefined,
        }
      : null;

  return {
    mode,
    title: typeof raw.title === "string" ? raw.title : "",
    chosen: {
      label: typeof chosenRaw?.label === "string" ? chosenRaw.label : "",
      value: chosenRaw?.value ?? null,
    },
    candidates,
    winner_index: clampIndex(Number(raw.winner_index), candidates.length),
    pool_size:
      typeof raw.pool_size === "number" ? raw.pool_size : candidates.length,
    display_count:
      typeof raw.display_count === "number"
        ? raw.display_count
        : candidates.length,
    spin_duration_ms:
      typeof raw.spin_duration_ms === "number" ? raw.spin_duration_ms : 0,
    seed: typeof raw.seed === "string" ? raw.seed : null,
    sources,
    image,
  };
}

/** Pull the spin parameters from the `spin` tool_step event. */
function parseSpinStep(
  events: ToolEventPayload[] | undefined,
): ResolvedWheel | null {
  const spin = filterStepEvents(events, "spin")[0];
  if (!spin) return null;
  const meta = spin.metadata as Record<string, unknown>;
  const candidates = asStringArray(meta.candidates);
  if (candidates.length === 0) return null;
  return {
    candidates,
    winnerIndex: clampIndex(Number(meta.winner_index), candidates.length),
    spinDurationMs:
      typeof meta.spin_duration_ms === "number" ? meta.spin_duration_ms : 0,
    title: typeof meta.title === "string" ? meta.title : "",
    mode: asMode(meta.mode),
    poolSize:
      typeof meta.pool_size === "number" ? meta.pool_size : candidates.length,
  };
}

/**
 * Resolve the wheel geometry from whatever is available, preferring the live
 * spin step event (it arrives first) and falling back to the persisted result.
 */
function resolveWheel(
  spin: ResolvedWheel | null,
  result: RandomWheelResult | null,
): ResolvedWheel | null {
  if (spin) return spin;
  if (result && result.candidates.length > 0) {
    return {
      candidates: result.candidates,
      winnerIndex: result.winner_index,
      spinDurationMs: result.spin_duration_ms,
      title: result.title,
      mode: result.mode,
      poolSize: result.pool_size,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry
// ─────────────────────────────────────────────────────────────────────────────

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  // Round to 3 decimals: cleaner SVG and avoids any float-precision drift between
  // environments (e.g. a stray SSR hydration mismatch on trig output).
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { x: round(cx + r * Math.cos(a)), y: round(cy + r * Math.sin(a)) };
}

/** SVG path for one pie segment spanning [startDeg, endDeg]. */
function segmentPath(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
): string {
  const start = polar(cx, cy, r, endDeg);
  const end = polar(cx, cy, r, startDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function truncateLabel(label: string, max: number): string {
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Radial label layout: anchor on the outer rim, baseline aimed at the hub.
 * When that baseline would render upside-down, flip 180° and use `end` anchor
 * so the string still starts at the rim and reads inward.
 */
function radialLabelLayout(
  cx: number,
  cy: number,
  outerR: number,
  midDeg: number,
): {
  x: number;
  y: number;
  rotation: number;
  anchor: "start" | "end";
} {
  const pos = polar(cx, cy, outerR, midDeg);
  const inwardDeg = (Math.atan2(cy - pos.y, cx - pos.x) * 180) / Math.PI;
  let rotation = inwardDeg;
  let anchor: "start" | "end" = "start";
  const norm = ((rotation % 360) + 360) % 360;
  if (norm > 90 && norm < 270) {
    rotation += 180;
    anchor = "end";
  }
  return { x: pos.x, y: pos.y, rotation, anchor };
}

/**
 * The wheel is drawn with segment i centered at angle `(i + 0.5) * seg` measured
 * clockwise from the top (pointer position). To bring the winner under the fixed
 * top pointer we rotate the wheel by the NEGATIVE of the winner's center angle,
 * plus a whole number of full turns for drama. Deterministic ⇒ always correct.
 */
function finalRotationDeg(
  winnerIndex: number,
  count: number,
  fullTurns: number,
): number {
  // A single segment is a full, rotationally-symmetric disc — the winner is always
  // under the pointer, so don't rotate (a −180° snap would flip its label upside-down).
  if (count <= 1) return 0;
  const seg = 360 / count;
  const winnerCenter = (winnerIndex + 0.5) * seg;
  return fullTurns * 360 - winnerCenter;
}

/** Which segment sits under the fixed top pointer at this wheel rotation. */
function indexAtPointer(rotationDeg: number, count: number): number {
  if (count <= 1) return 0;
  const seg = 360 / count;
  const r = ((rotationDeg % 360) + 360) % 360;
  const i = Math.round(-r / seg - 0.5);
  return ((i % count) + count) % count;
}

/** Snap rotation so segment `index` is centered under the pointer. */
function rotationForIndex(
  index: number,
  count: number,
  baseRotation: number,
): number {
  if (count <= 1) return baseRotation;
  const seg = 360 / count;
  const targetMod = ((-((index + 0.5) * seg) % 360) + 360) % 360;
  const currentMod = ((baseRotation % 360) + 360) % 360;
  let delta = targetMod - currentMod;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return baseRotation + delta;
}

function pointerAngleDeg(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): number {
  const x = clientX - (rect.left + rect.width / 2);
  const y = clientY - (rect.top + rect.height / 2);
  return (Math.atan2(y, x) * 180) / Math.PI + 90;
}

const WHEEL_CONTEXT_PREFIX = "wheel_";

function slugifyKeySuffix(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Every wheel context key MUST start with `wheel_` to avoid colliding with generic slots. */
function ensureWheelContextKey(raw: string, fallbackSuffix = "pick"): string {
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.startsWith(WHEEL_CONTEXT_PREFIX)
    ? trimmed.slice(WHEEL_CONTEXT_PREFIX.length)
    : trimmed;
  const suffix = slugifyKeySuffix(withoutPrefix) || fallbackSuffix;
  return `${WHEEL_CONTEXT_PREFIX}${suffix}`;
}

function resolveWheelContextKey(
  entry: ToolLifecycleEntry,
  title: string,
): string {
  const args = (entry.arguments ?? {}) as Record<string, unknown>;
  if (typeof args.context_key === "string" && args.context_key.trim()) {
    return ensureWheelContextKey(args.context_key);
  }
  return ensureWheelContextKey(title || "pick");
}

function resolveWheelContextValue(
  result: RandomWheelResult | null,
  label: string,
): unknown {
  if (result?.chosen.label === label && result.chosen.value != null) {
    return result.chosen.value;
  }
  return label;
}

// ─────────────────────────────────────────────────────────────────────────────
// Wheel SVG
// ─────────────────────────────────────────────────────────────────────────────

interface WheelProps {
  wheel: ResolvedWheel;
  /** Target rotation in degrees (settled position). */
  rotation: number;
  /** When true, animate from 0 to `rotation`; when false, snap instantly. */
  animate: boolean;
  durationMs: number;
  settled: boolean;
  /** Called when the spin animation finishes (only while animating). */
  onSettled?: () => void;
  /** Allow the user to drag/spin after the initial animation lands. */
  interactive?: boolean;
  /** Segment to highlight (defaults to server winner when settled). */
  highlightIndex?: number;
  /** Fired when the user finishes a manual spin. */
  onUserPick?: (index: number, label: string) => void;
}

const Wheel: React.FC<WheelProps> = ({
  wheel,
  rotation,
  animate,
  durationMs,
  settled,
  onSettled,
  interactive = false,
  highlightIndex,
  onUserPick,
}) => {
  const { candidates, winnerIndex } = wheel;
  const count = candidates.length;
  const size = WHEEL_SIZE;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const seg = 360 / count;
  const hubR = Math.max(14, size * 0.055);
  const innerR = hubR + 8;
  const outerR = r - 8;
  const fontSize = count <= 10 ? 13 : count <= 18 ? 11 : 9;
  // How many chars fit along the radial spoke at this font size.
  const charBudget = Math.max(
    8,
    Math.floor((outerR - innerR) / (fontSize * 0.6)),
  );

  const canInteract = interactive && settled && count > 1;
  const [liveRotation, setLiveRotation] = useState(rotation);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const lastPointerAngle = useRef<number | null>(null);
  const wheelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDragging && !isSnapping) {
      setLiveRotation(rotation);
    }
  }, [rotation, isDragging, isSnapping]);

  const activeIndex =
    highlightIndex ??
    (settled ? winnerIndex : indexAtPointer(liveRotation, count));

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canInteract) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    const rect = event.currentTarget.getBoundingClientRect();
    lastPointerAngle.current = pointerAngleDeg(
      event.clientX,
      event.clientY,
      rect,
    );
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || lastPointerAngle.current == null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const angle = pointerAngleDeg(event.clientX, event.clientY, rect);
    let delta = angle - lastPointerAngle.current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    lastPointerAngle.current = angle;
    setLiveRotation((prev) => prev + delta);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDragging(false);
    lastPointerAngle.current = null;
    setLiveRotation((current) => {
      const index = indexAtPointer(current, count);
      const snapped = rotationForIndex(index, count, current);
      setIsSnapping(true);
      window.setTimeout(() => {
        setIsSnapping(false);
        onUserPick?.(index, candidates[index] ?? "");
      }, 280);
      return snapped;
    });
  };

  const displayRotation = canInteract ? liveRotation : rotation;
  const useMotionTransition =
    animate || isSnapping || (canInteract && !isDragging);

  return (
    <div
      ref={wheelRef}
      className={cn(
        "relative flex-shrink-0 touch-none",
        canInteract && "cursor-grab active:cursor-grabbing",
      )}
      style={{ width: size, height: size }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role={canInteract ? "slider" : undefined}
      aria-valuemin={canInteract ? 0 : undefined}
      aria-valuemax={canInteract ? count - 1 : undefined}
      aria-valuenow={canInteract ? activeIndex : undefined}
      aria-label={
        canInteract
          ? `Spin the wheel — currently on ${candidates[activeIndex]}`
          : undefined
      }
    >
      {/* Fixed pointer at the top */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-10"
        style={{ top: -2 }}
        aria-hidden
      >
        <div
          className="w-0 h-0"
          style={{
            borderLeft: "9px solid transparent",
            borderRight: "9px solid transparent",
            borderTop:
              "16px solid var(--color-foreground, hsl(var(--foreground)))",
            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.25))",
          }}
        />
      </div>

      <motion.svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-hidden={canInteract}
        aria-label={
          canInteract
            ? undefined
            : `Wheel of ${count} options${
                settled ? `, landed on ${candidates[winnerIndex]}` : ""
              }`
        }
        initial={animate ? { rotate: 0 } : false}
        animate={{ rotate: displayRotation }}
        transition={
          useMotionTransition
            ? {
                duration: animate ? durationMs / 1000 : isSnapping ? 0.28 : 0,
                ease: [0.16, 1, 0.3, 1],
              }
            : { duration: 0 }
        }
        onAnimationComplete={animate ? onSettled : undefined}
        style={{ transformOrigin: "50% 50%", display: "block" }}
      >
        {/* outer ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--color-border, hsl(var(--border)))"
          strokeWidth={2}
        />
        {candidates.map((label, i) => {
          const single = count === 1;
          const start = i * seg;
          const end = (i + 1) * seg;
          const mid = (start + end) / 2;
          const isWinner = settled && i === activeIndex;
          const fill = isWinner
            ? "var(--color-primary, hsl(var(--primary)))"
            : SEGMENT_FILLS[i % SEGMENT_FILLS.length];
          const textFill = isWinner
            ? "var(--color-primary-foreground, hsl(var(--primary-foreground)))"
            : SEGMENT_TEXT_FILLS[i % SEGMENT_TEXT_FILLS.length];
          const dimOpacity = settled && !isWinner ? 0.55 : 1;
          let labelPos = { x: cx, y: cy - r * 0.4 };
          let labelRot = 0;
          let labelAnchor: "start" | "middle" | "end" = "middle";
          if (!single) {
            const radial = radialLabelLayout(cx, cy, outerR, mid);
            labelPos = { x: radial.x, y: radial.y };
            labelRot = radial.rotation;
            labelAnchor = radial.anchor;
          }
          return (
            <g key={i}>
              <title>{label}</title>
              {single ? (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={fill}
                  stroke="var(--color-background, hsl(var(--background)))"
                  strokeWidth={1}
                  opacity={dimOpacity}
                  style={{ transition: "opacity 200ms ease" }}
                />
              ) : (
                <path
                  d={segmentPath(cx, cy, r, start, end)}
                  fill={fill}
                  stroke="var(--color-background, hsl(var(--background)))"
                  strokeWidth={1}
                  opacity={dimOpacity}
                  style={{ transition: "opacity 200ms ease" }}
                />
              )}
              <text
                x={labelPos.x}
                y={labelPos.y}
                fill={textFill}
                fontSize={fontSize}
                fontWeight={isWinner ? 700 : 500}
                textAnchor={labelAnchor}
                dominantBaseline="middle"
                transform={
                  single
                    ? undefined
                    : `rotate(${labelRot} ${labelPos.x} ${labelPos.y})`
                }
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {truncateLabel(label, charBudget)}
              </text>
            </g>
          );
        })}
        {/* hub */}
        <circle
          cx={cx}
          cy={cy}
          r={hubR}
          fill="var(--color-card, hsl(var(--card)))"
          stroke="var(--color-border, hsl(var(--border)))"
          strokeWidth={2}
        />
      </motion.svg>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Result panels
// ─────────────────────────────────────────────────────────────────────────────

function valueToText(value: unknown): { text: string; isJson: boolean } {
  if (value == null) return { text: "", isJson: false };
  if (typeof value === "string") return { text: value, isJson: false };
  try {
    return { text: JSON.stringify(value, null, 2), isJson: true };
  } catch {
    return { text: String(value), isJson: false };
  }
}

const ListResult: React.FC<{ result: RandomWheelResult }> = ({ result }) => {
  const { text, isJson } = valueToText(result.chosen.value);
  const hasValue = text.trim().length > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-base font-semibold text-foreground break-words">
          {result.chosen.label || "(no label)"}
        </span>
      </div>
      {hasValue && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          {isJson ? (
            <pre className="text-xs text-foreground/90 whitespace-pre-wrap break-words font-mono overflow-x-auto">
              {text}
            </pre>
          ) : (
            <div className="text-sm text-foreground/90 break-words">
              <BasicMarkdownContent content={text} showCopyButton={false} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WebResult: React.FC<{ result: RandomWheelResult }> = ({ result }) => {
  const { text } = valueToText(result.chosen.value);
  const sources = result.sources ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-base font-semibold text-foreground break-words">
          {result.chosen.label || result.seed || "(no seed)"}
        </span>
      </div>
      {text.trim().length > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm text-foreground/90 break-words max-h-72 overflow-y-auto">
          <BasicMarkdownContent content={text} showCopyButton={false} />
        </div>
      )}
      {sources.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            {sources.length} {sources.length === 1 ? "source" : "sources"}
          </div>
          {sources.map((src, i) => (
            <a
              key={`${src.url}-${i}`}
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-2 p-2 rounded-md border border-border bg-card hover:border-primary/30 transition-colors group"
            >
              <Globe className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 min-w-0 text-xs text-foreground truncate group-hover:text-primary">
                {src.title || src.url}
              </span>
              <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const ImageResult: React.FC<{ result: RandomWheelResult }> = ({ result }) => {
  const image = result.image;
  const caption =
    typeof result.chosen.value === "string" ? result.chosen.value : "";
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ImageIcon className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-base font-semibold text-foreground break-words">
          {result.chosen.label || result.seed || "(no keyword)"}
        </span>
      </div>

      {image && !imgFailed ? (
        <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
          <img
            src={image.url}
            alt={image.description || result.chosen.label || "Stock image"}
            className="w-full max-h-80 object-cover"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <ImageIcon className="w-4 h-4" />
          <span>
            {imgFailed ? "Image failed to load." : "No image returned."}
          </span>
        </div>
      )}

      {caption && (
        <p className="text-sm text-foreground/80 break-words">{caption}</p>
      )}

      {/* Unsplash attribution — required by the Unsplash license. */}
      {image?.photographer_name && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Camera className="w-3 h-3 flex-shrink-0" />
          <span>
            Photo by{" "}
            {image.photographer_url ? (
              <a
                href={image.photographer_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline"
              >
                {image.photographer_name}
              </a>
            ) : (
              <span className="text-foreground/80">
                {image.photographer_name}
              </span>
            )}{" "}
            on{" "}
            <a
              href="https://unsplash.com"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary hover:underline"
            >
              Unsplash
            </a>
          </span>
        </p>
      )}
    </div>
  );
};

const ResultPanel: React.FC<{ result: RandomWheelResult }> = ({ result }) => {
  if (result.mode === "web") return <WebResult result={result} />;
  if (result.mode === "image") return <ImageResult result={result} />;
  return <ListResult result={result} />;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export const RandomWheelInline: React.FC<ToolRendererProps> = ({
  entry,
  events,
  isPersisted,
  conversationId,
}) => {
  const dispatch = useAppDispatch();
  const prefersReducedMotion = useReducedMotion();

  const result = useMemo(() => parseResult(entry), [entry]);
  const spin = useMemo(() => parseSpinStep(events), [events]);
  const wheel = useMemo(() => resolveWheel(spin, result), [spin, result]);

  const terminal = isTerminal(entry);
  const isError = entry.status === "error";
  const completed = entry.status === "completed";

  // Server-chosen spin length. 0 ⇒ "land instantly" (no dramatize).
  const wheelSpinMs = wheel?.spinDurationMs ?? 0;

  // Skip the spin animation for: a persisted snapshot, reduced motion, an entry
  // already terminal on first mount (a reload must NOT re-spin), or an explicit
  // no-dramatize. `wasTerminalOnMount` is captured once via a lazy initializer so
  // it's stable across renders and never read from a ref during render.
  const [wasTerminalOnMount] = useState(() => terminal);
  const skipAnimation =
    Boolean(isPersisted) ||
    Boolean(prefersReducedMotion) ||
    wasTerminalOnMount ||
    wheelSpinMs <= 0;

  const animateSpin = Boolean(wheel) && !skipAnimation;

  // The wheel "lands" when the spin animation completes (motion's onAnimationComplete),
  // NOT when the server's `completed` arrives. For web/image the fetch can outlast the
  // spin, so this is what highlights the winner and shows the "Fetching…" phase during
  // the gap. When not animating, the winner is only revealed once the call completes,
  // so a persisted-but-pending snapshot doesn't look decided.
  const [animationDone, setAnimationDone] = useState(false);
  const [userPickIndex, setUserPickIndex] = useState<number | null>(null);
  // Reveal when the spin animation lands, OR when the server completes (a safety
  // net so the result never hangs if onAnimationComplete is ever missed). A
  // persisted-but-pending snapshot (not animating, not completed) stays unrevealed.
  const winnerRevealed = completed || (animateSpin && animationDone);
  const settled = winnerRevealed;

  const rotation = useMemo(() => {
    if (!wheel) return 0;
    return finalRotationDeg(
      wheel.winnerIndex,
      wheel.candidates.length,
      animateSpin ? SPIN_FULL_TURNS : 0,
    );
  }, [wheel, animateSpin]);

  const spinDurationMs = Math.max(MIN_VISIBLE_SPIN_MS, wheelSpinMs);

  const title = wheel?.title || result?.title || "Spin the wheel";
  const contextKey = useMemo(
    () => resolveWheelContextKey(entry, title),
    [entry, title],
  );

  const handleUserPick = useCallback(
    (index: number, label: string) => {
      setUserPickIndex(index);
      if (!conversationId || !label) return;
      dispatch(
        setContextEntry({
          conversationId,
          key: contextKey,
          value: resolveWheelContextValue(result, label),
          type: "text",
          label: title || "Wheel pick",
        }),
      );
    },
    [contextKey, conversationId, dispatch, result, title],
  );

  const highlightIndex =
    userPickIndex ?? (settled ? wheel?.winnerIndex : undefined);

  const userPickLabel =
    userPickIndex != null && wheel
      ? (wheel.candidates[userPickIndex] ?? "")
      : "";

  // ── Error state ──────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-destructive">
            Wheel spin failed
          </p>
          {entry.errorMessage && (
            <p className="text-xs text-muted-foreground break-words mt-0.5">
              {entry.errorMessage}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Empty / spinning-up: no spin event yet ────────────────────────────────
  if (!wheel) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
        <Dices className="w-5 h-5 text-primary animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            Spinning up…
          </div>
          <div className="mt-2 h-2 w-2/3 rounded-full bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  const mode: RandomWheelMode = wheel.mode;
  const { Icon: ModeIcon, label: modeLabel } = MODE_META[mode];

  // Whether we still need the downstream content fetch (web/image second phase).
  const awaitingFetch =
    (mode === "web" || mode === "image") && settled && !terminal; // landed but result not in yet
  const seedLabel = wheel.candidates[wheel.winnerIndex] ?? result?.seed ?? "";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <ModeIcon className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {modeLabel}
        </span>
      </div>

      {/* Wheel + status */}
      <div className="flex flex-col items-center gap-3">
        <Wheel
          wheel={wheel}
          rotation={rotation}
          animate={animateSpin}
          durationMs={spinDurationMs}
          settled={settled}
          onSettled={() => setAnimationDone(true)}
          interactive={!isPersisted}
          highlightIndex={highlightIndex}
          onUserPick={handleUserPick}
        />

        {settled && wheel.candidates.length > 1 && !isPersisted && (
          <p className="text-xs text-muted-foreground text-center">
            Drag the wheel to explore other options — your pick is sent to
            context.
          </p>
        )}

        {userPickLabel && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            <Trophy className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-foreground break-words">
              Your pick: <span className="font-semibold">{userPickLabel}</span>
            </span>
          </div>
        )}

        {/* Pool size / candidate count */}
        <div className="text-xs text-muted-foreground">
          {wheel.candidates.length}{" "}
          {wheel.candidates.length === 1 ? "option" : "options"}
          {wheel.poolSize > wheel.candidates.length && (
            <> · sampled from {wheel.poolSize}</>
          )}
        </div>

        {/* Spinning indicator (live, before landing) */}
        {!settled && (
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Spinning…</span>
          </div>
        )}
      </div>

      {/* Second-phase fetch state for web/image */}
      {awaitingFetch && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
          <span className="break-words">
            Fetching fresh {mode === "image" ? "image" : "content"} for{" "}
            <span className="font-medium text-foreground">“{seedLabel}”</span>…
          </span>
        </div>
      )}

      {/* Final result */}
      {settled && completed && result && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 animate-in fade-in slide-in-from-bottom">
          <ResultPanel result={result} />
        </div>
      )}
    </div>
  );
};
