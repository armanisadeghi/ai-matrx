"use client";

/**
 * features/marketing/content-plan/components/pillar-map/PlanMapNode.tsx
 *
 * The custom React Flow node for the pillar map. Every plan dimension is
 * encoded on the mark (legend in MapLegend.tsx):
 *   · color  = plan_status (planStatusColor — the seeded data palette);
 *   · shape  = node_type   (home rounded square + primary ring, pillar
 *              hexagon, cluster circle, article square, index diamond);
 *   · size   = priority    (PRIORITY_SIZES; 1 biggest);
 *   · dashed violet outline = needs_reviewer;
 *   · foreground corner dot = has a primary keyword bound;
 *   · count badge = collapsed subtree (double-click to expand).
 * Labels are text-foreground, middle-truncated on canvas only (full label +
 * route in the native tooltip; click opens the node panel). Semantic zoom:
 * the map container carries `group` + data-zoom-band, and article/cluster
 * labels hide at far bands via group-data variants — far out you read the
 * pillar skeleton, zooming in reveals detail.
 */
import { cn } from "@/lib/utils";

import { planStatusColor, PRIORITY_SIZES } from "../../constants";

export interface PlanMapNodeData extends Record<string, unknown> {
  label: string;
  route: string | null;
  nodeType: string;
  statusSlug: string | undefined;
  priority: number | null;
  needsReviewer: boolean;
  hasKeyword: boolean;
  collapsedCount: number;
  dimmed: boolean;
  canvasLabel: string;
}

/** Silhouette per node_type — distinct shapes, home visually distinct. */
export const NODE_TYPE_SHAPE_CLASSES: Record<string, string> = {
  home: "rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background",
  pillar: "[clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]",
  cluster: "rounded-full",
  article: "rounded-[5px]",
  index: "[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)]",
};

export function nodeShapeClass(nodeType: string): string {
  return NODE_TYPE_SHAPE_CLASSES[nodeType] ?? NODE_TYPE_SHAPE_CLASSES.article;
}

export function nodeSize(nodeType: string, priority: number | null): number {
  if (nodeType === "home") return 56;
  return priority != null ? (PRIORITY_SIZES[priority] ?? 34) : 34;
}

/** Zoom-band label visibility (container owns `group` + data-zoom-band). */
function labelBandClass(nodeType: string): string {
  if (nodeType === "article" || nodeType === "index") {
    return "group-data-[zoom-band=far]:hidden group-data-[zoom-band=mid]:hidden";
  }
  if (nodeType === "cluster") return "group-data-[zoom-band=far]:hidden";
  return "";
}

export function PlanMapNodeView({
  data,
  selected,
}: {
  data: PlanMapNodeData;
  selected?: boolean;
}) {
  const size = nodeSize(data.nodeType, data.priority);
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1",
        data.dimmed && "opacity-40",
        selected && "rounded-md p-0.5 outline outline-2 outline-primary",
      )}
      title={`${data.label}${data.route ? `\n${data.route}` : ""}`}
    >
      <div
        className={cn(
          "relative",
          data.needsReviewer &&
            "rounded-md outline-dashed outline-2 outline-offset-2 outline-violet-500",
        )}
        style={{ width: size, height: size }}
      >
        <div
          className={cn(
            "h-full w-full shadow-sm",
            planStatusColor(data.statusSlug),
            nodeShapeClass(data.nodeType),
          )}
        />
        {data.hasKeyword ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-background bg-foreground" />
        ) : null}
        {data.collapsedCount > 0 ? (
          <span className="absolute -bottom-1.5 -right-1.5 rounded-full border border-background bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
            +{data.collapsedCount}
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          "max-w-40 text-center text-[10px] font-medium leading-tight text-foreground",
          labelBandClass(data.nodeType),
        )}
      >
        {data.canvasLabel}
      </span>
    </div>
  );
}
