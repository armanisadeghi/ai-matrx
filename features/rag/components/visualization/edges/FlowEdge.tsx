"use client";

/**
 * FlowEdge — animated edge that visualizes data flowing between nodes.
 *
 * Three layered renders:
 *   1) idle base path — thin, low-opacity, always visible
 *   2) active overlay path — thicker, full-color, with flowing dashed stroke
 *   3) traveling particle — an SVG <circle> with <animateMotion> riding the path
 *
 * The edge label sits above the path mid-point and lights up alongside the
 * edge. `data.variant` selects the color theme; `data.active` toggles flow.
 */

import { memo } from "react";
// eslint-disable-next-line no-restricted-syntax -- inside the RagFlowVisualization/IngestFlowAnimation dynamic(ssr:false) front-door gate; React Flow stays STATIC in-gate per the code-splitting skill (rule 3).
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type FlowEdgeVariant = "read" | "write" | "store";

/**
 * Horizontal distance, in graph units, from the edge midpoint to the
 * inner edge of each side card. Picked so cards clear the widest node
 * in the pipeline (data store at 260 wide → half = 130) with a
 * comfortable visual gutter on both sides.
 */
const SIDE_CARD_OFFSET_X = 150;

export interface FlowEdgeLiveStats {
  /** Current count produced this stage (e.g. 240 pages cleaned). */
  current?: number;
  /** Total expected count (e.g. 586 total pages). */
  total?: number;
  /** Latest server-emitted message ("Cleaning page 240 of 586"). */
  message?: string;
  /** Unit name to render alongside the counter ("pages", "chunks", "embeddings", "vectors"). */
  units?: string;
  /** Display name of the stage currently flowing through the edge ("Extracting", "Cleaning", …). */
  stageName?: string;
}

export interface FlowEdgeData extends Record<string, unknown> {
  variant: FlowEdgeVariant;
  label?: string;
  /** Currently flowing — animated dashes + traveling particle. Beats `complete`. */
  active?: boolean;
  /** Already finished flowing — solid emerald, no animation, soft glow. */
  complete?: boolean;
  /** Speed of the moving particle in seconds (default 1.4). Higher = slower. */
  particleDuration?: number;
  /** Speed of the marching dashes in seconds (default 0.9). Higher = slower. */
  dashDuration?: number;
  /**
   * When provided AND the edge is active, render the left + right rich
   * cards (description on the left, counters/progress on the right)
   * instead of just the small pill on the edge.
   */
  liveStats?: FlowEdgeLiveStats;
}

const VARIANT_COLOR: Record<
  FlowEdgeVariant,
  { active: string; idle: string; particle: string }
> = {
  read: {
    active: "rgb(167 139 250)", // violet-400
    idle: "rgb(139 92 246 / 0.25)", // violet-500/25
    particle: "rgb(196 181 253)", // violet-300
  },
  write: {
    active: "rgb(34 211 238)", // cyan-400
    idle: "rgb(6 182 212 / 0.25)", // cyan-500/25
    particle: "rgb(103 232 249)", // cyan-300
  },
  store: {
    active: "rgb(52 211 153)", // emerald-400
    idle: "rgb(16 185 129 / 0.25)", // emerald-500/25
    particle: "rgb(110 231 183)", // emerald-300
  },
};

function FlowEdgeImpl(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
  } = props;

  const d = (data ?? { variant: "write" }) as FlowEdgeData;
  const colors = VARIANT_COLOR[d.variant];
  const isActive = !!d.active;
  const isComplete = !isActive && !!d.complete;
  const completeColors = VARIANT_COLOR.store; // emerald for finished work

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 18,
  });

  const motionPathId = `flow-motion-${id}`;
  const particleDur = d.particleDuration ?? 1.4;
  const dashDur = d.dashDuration ?? 0.9;

  return (
    <>
      {/* Idle base path — always rendered */}
      <BaseEdge
        path={edgePath}
        style={{
          stroke: isComplete ? completeColors.active : colors.idle,
          strokeWidth: isComplete ? 2 : 1.5,
          fill: "none",
          filter: isComplete
            ? `drop-shadow(0 0 4px ${completeColors.active})`
            : undefined,
        }}
      />

      {/* Active overlay — flowing dashes */}
      {isActive && (
        <>
          <path
            id={motionPathId}
            d={edgePath}
            style={{
              stroke: colors.active,
              strokeWidth: 2,
              fill: "none",
              strokeDasharray: "6 6",
              strokeLinecap: "round",
              filter: `drop-shadow(0 0 6px ${colors.active})`,
              animation: `ragFlowDash ${dashDur}s linear infinite`,
            }}
          />

          {/* Traveling particle */}
          <circle
            r={3.5}
            fill={colors.particle}
            style={{
              filter: `drop-shadow(0 0 6px ${colors.active})`,
            }}
          >
            <animateMotion
              dur={`${particleDur}s`}
              repeatCount="indefinite"
              rotate="auto"
              keyPoints="0;1"
              keyTimes="0;1"
            >
              <mpath href={`#${motionPathId}`} />
            </animateMotion>
          </circle>

          {/* A second, slightly delayed particle for a richer flow */}
          <circle r={2.5} fill={colors.particle} opacity={0.7}>
            <animateMotion
              dur={`${particleDur}s`}
              begin={`${particleDur / 2}s`}
              repeatCount="indefinite"
              rotate="auto"
            >
              <mpath href={`#${motionPathId}`} />
            </animateMotion>
          </circle>
        </>
      )}

      {/* Edge label(s). Three render slots:
       *   - PillLabel:    small action verb, centered ON the edge.
       *   - LeftDescriptiveCard: "what we're doing" — stage name +
       *                          live message, pinned to the LEFT of
       *                          the edge midpoint.
       *   - RightProgressCard:   "the numbers" — counters, percent,
       *                          progress bar, pinned to the RIGHT.
       *
       *  Both side cards mount only while the edge is active AND has
       *  liveStats. Their inner edges sit `SIDE_CARD_OFFSET_X` graph
       *  units away from the edge midpoint, leaving the column itself
       *  uncluttered.
       */}
      {(d.label || d.liveStats) && (
        <EdgeLabelRenderer>
          {/* Always-rendered pill on the edge */}
          {d.label && (
            <div
              style={{
                position: "absolute",
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: "none",
              }}
            >
              <PillLabel
                label={d.label}
                variant={d.variant}
                isActive={isActive}
                isComplete={isComplete}
              />
            </div>
          )}
          {/* Left descriptive card */}
          {isActive && d.liveStats && (
            <div
              style={{
                position: "absolute",
                transform: `translate(-100%, -50%) translate(${labelX - SIDE_CARD_OFFSET_X}px, ${labelY}px)`,
                pointerEvents: "none",
              }}
            >
              <LeftDescriptiveCard
                label={d.label}
                stats={d.liveStats}
                variant={d.variant}
              />
            </div>
          )}
          {/* Right progress card */}
          {isActive && d.liveStats && (
            <div
              style={{
                position: "absolute",
                transform: `translate(0, -50%) translate(${labelX + SIDE_CARD_OFFSET_X}px, ${labelY}px)`,
                pointerEvents: "none",
              }}
            >
              <RightProgressCard stats={d.liveStats} variant={d.variant} />
            </div>
          )}
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeImpl);

// ---------------------------------------------------------------------------
// Sub-components for the edge label
// ---------------------------------------------------------------------------

function PillLabel({
  label,
  variant,
  isActive,
  isComplete,
}: {
  label: string;
  variant: FlowEdgeVariant;
  isActive: boolean;
  isComplete: boolean;
}) {
  if (!label) return null;
  return (
    <div
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
        "bg-background/85 backdrop-blur",
        "transition-[color,border-color,box-shadow] duration-300",
        isActive
          ? variant === "read"
            ? "text-violet-500 dark:text-violet-300 border-violet-400/60 shadow-[0_0_10px_-2px_rgb(167_139_250_/_0.6)]"
            : variant === "write"
              ? "text-cyan-500 dark:text-cyan-300 border-cyan-400/60 shadow-[0_0_10px_-2px_rgb(34_211_238_/_0.6)]"
              : "text-emerald-500 dark:text-emerald-300 border-emerald-400/60 shadow-[0_0_10px_-2px_rgb(52_211_153_/_0.6)]"
          : isComplete
            ? "text-emerald-500/90 dark:text-emerald-300/90 border-emerald-400/40"
            : "text-muted-foreground/80 border-border",
      )}
    >
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active-edge side cards
// ---------------------------------------------------------------------------

interface AccentClasses {
  ring: string;
  glow: string;
  text: string;
  bar: string;
  icon: string;
  barTrack: string;
}

function getAccent(variant: FlowEdgeVariant): AccentClasses {
  if (variant === "read") {
    return {
      ring: "border-violet-400/70",
      glow: "shadow-[0_0_24px_-6px_rgb(167_139_250_/_0.7)]",
      text: "text-violet-500 dark:text-violet-300",
      bar: "bg-violet-400",
      icon: "text-violet-500 dark:text-violet-300",
      barTrack: "bg-violet-500/10",
    };
  }
  if (variant === "write") {
    return {
      ring: "border-cyan-400/70",
      glow: "shadow-[0_0_24px_-6px_rgb(34_211_238_/_0.7)]",
      text: "text-cyan-500 dark:text-cyan-300",
      bar: "bg-cyan-400",
      icon: "text-cyan-500 dark:text-cyan-300",
      barTrack: "bg-cyan-500/10",
    };
  }
  return {
    ring: "border-emerald-400/70",
    glow: "shadow-[0_0_24px_-6px_rgb(52_211_153_/_0.7)]",
    text: "text-emerald-500 dark:text-emerald-300",
    bar: "bg-emerald-400",
    icon: "text-emerald-500 dark:text-emerald-300",
    barTrack: "bg-emerald-500/10",
  };
}

const CARD_BASE =
  "rounded-lg border-2 bg-background/95 backdrop-blur px-3 py-2.5 w-[220px]";

/**
 * LEFT card — "what we're doing".
 *
 *   ┌─────────────────────────┐
 *   │ ⟳  CLEANING             │
 *   │ ─────                   │
 *   │ LLM cleanup +           │
 *   │ section classification  │
 *   │ over 20 pages…          │
 *   └─────────────────────────┘
 */
function LeftDescriptiveCard({
  label,
  stats,
  variant,
}: {
  label?: string;
  stats: FlowEdgeLiveStats;
  variant: FlowEdgeVariant;
}) {
  const accent = getAccent(variant);
  const stageName = (stats.stageName ?? label ?? "running").toUpperCase();
  return (
    <div className={cn(CARD_BASE, accent.ring, accent.glow)}>
      <div className="flex items-center gap-1.5">
        <Loader2
          className={cn("h-3.5 w-3.5 shrink-0 animate-spin", accent.icon)}
        />
        <span
          className={cn(
            "text-sm font-bold uppercase tracking-wider truncate",
            accent.text,
          )}
        >
          {stageName}
        </span>
      </div>
      <div className={cn("mt-1.5 h-px w-8", accent.bar)} />
      {stats.message ? (
        <div className="mt-1.5 text-[12px] leading-snug text-muted-foreground line-clamp-4">
          {stats.message}
        </div>
      ) : (
        <div className="mt-1.5 text-[12px] italic leading-snug text-muted-foreground/70">
          waiting on the next update…
        </div>
      )}
    </div>
  );
}

/**
 * RIGHT card — "the numbers".
 *
 *   ┌─────────────────────────┐
 *   │ PAGES               41% │
 *   │ ─────                   │
 *   │  240                    │
 *   │  / 586                  │
 *   │ ▓▓▓▓▓░░░░░░░░░░░░░░░░  │
 *   └─────────────────────────┘
 */
function RightProgressCard({
  stats,
  variant,
}: {
  stats: FlowEdgeLiveStats;
  variant: FlowEdgeVariant;
}) {
  const accent = getAccent(variant);
  const { current, total, units } = stats;
  const hasCounter =
    typeof current === "number" && typeof total === "number" && total > 0;
  const percent = hasCounter
    ? Math.min(100, Math.round((current! / total!) * 100))
    : null;

  return (
    <div className={cn(CARD_BASE, accent.ring, accent.glow)}>
      {/* Header: units left, percent right */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-[11px] font-bold uppercase tracking-[0.12em] truncate",
            accent.text,
          )}
        >
          {units ?? "progress"}
        </span>
        {percent !== null && (
          <span
            className={cn(
              "text-base font-bold tabular-nums leading-none",
              accent.text,
            )}
          >
            {percent}%
          </span>
        )}
      </div>
      <div className={cn("mt-1.5 h-px w-8", accent.bar)} />

      {/* Counter — current line is large, total line is muted */}
      {hasCounter ? (
        <div className="mt-1.5">
          <div className="text-2xl font-bold tabular-nums leading-none">
            {current!.toLocaleString()}
          </div>
          <div className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
            / {total!.toLocaleString()}
          </div>
        </div>
      ) : (
        <div className="mt-1.5 text-[12px] italic text-muted-foreground/70">
          counters not yet reported
        </div>
      )}

      {/* Progress bar */}
      {percent !== null && (
        <div
          className={cn(
            "mt-2 h-[5px] overflow-hidden rounded-full",
            accent.barTrack,
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-300",
              accent.bar,
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
