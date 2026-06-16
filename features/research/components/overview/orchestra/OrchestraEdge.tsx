"use client";

/**
 * Edges that connect orchestra nodes.
 *
 *  - <OrchestraEdge state="active|complete|idle|dashed" /> : a thin horizontal
 *    line, animated when state="active". Used between adjacent spine nodes.
 *  - <OrchestraCurvedEdge ...> : an SVG cubic curve used to fork the Tags
 *    branch off the spine and to merge it back into the project report.
 *
 * Edge state is derived by the parent (PipelineOrchestra) from the source
 * stage's status; the edge component itself is dumb.
 */

import { cn } from "@/lib/utils";

export type EdgeState = "idle" | "active" | "complete" | "dashed";

interface OrchestraEdgeProps {
  state: EdgeState;
  className?: string;
  /** Show a traveling particle when state="active". */
  particle?: boolean;
  /**
   * Orientation of the connector. "horizontal" (default) is the thin line used
   * between spine nodes; "vertical" is the stacked variant used by the vertical
   * (medium / narrow) orchestra layout.
   */
  orientation?: "horizontal" | "vertical";
}

export function OrchestraEdge({
  state,
  className,
  particle = true,
  orientation = "horizontal",
}: OrchestraEdgeProps) {
  const vertical = orientation === "vertical";
  return (
    <div
      data-state={state}
      className={cn(
        "orchestra-edge-flow",
        vertical && "orchestra-edge-flow--v",
        className,
      )}
      aria-hidden
    >
      {state === "active" && particle && (
        <span
          className={
            vertical ? "orchestra-edge-particle-v" : "orchestra-edge-particle"
          }
        />
      )}
    </div>
  );
}

interface OrchestraCurvedEdgeProps {
  state: EdgeState;
  /** Width of the SVG viewport (px). The curve uses 0 → width along x. */
  width: number;
  /** Height of the SVG viewport (px). */
  height: number;
  /**
   * Direction of the curve: "down-right" forks the spine downward to a
   * branch node; "up-right" merges a branch node back into the spine.
   */
  direction: "down-right" | "up-right" | "down" | "up";
  className?: string;
}

export function OrchestraCurvedEdge({
  state,
  width,
  height,
  direction,
  className,
}: OrchestraCurvedEdgeProps) {
  // Cubic curves with control points placed for a smooth arc.
  const path = (() => {
    switch (direction) {
      case "down-right":
        return `M 0 0 C ${width * 0.5} 0, ${width * 0.5} ${height}, ${width} ${height}`;
      case "up-right":
        return `M 0 ${height} C ${width * 0.5} ${height}, ${width * 0.5} 0, ${width} 0`;
      case "down":
        return `M ${width / 2} 0 L ${width / 2} ${height}`;
      case "up":
        return `M ${width / 2} ${height} L ${width / 2} 0`;
    }
  })();

  return (
    <svg
      data-state={state}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("orchestra-edge-curve overflow-visible", className)}
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
