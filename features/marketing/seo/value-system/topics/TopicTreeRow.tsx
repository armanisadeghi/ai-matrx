"use client";

/**
 * One node of the tree, dense enough that a whole branch fits on a screen.
 *
 * Every row answers three questions without being opened:
 *   - what kind of thing is this, and does its ROOT let it become money;
 *   - what is it worth here, and is that its OWN ruling or an inherited one
 *     (and from which ancestor);
 *   - how many of this site's keywords resolve through it, and where they land.
 */

import { ChevronRight, CornerDownRight, MoreVertical, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/styles/themes/utils";
import { formatCount } from "@/features/marketing/search-console/types";
import { bandMetaFor, type BandMeta } from "../variants/c/lib";
import { rootTypeMeta } from "./types";
import { DEFAULT_TOPIC_WEIGHT, formatWeight, type TopicTreeNode } from "./lib";

export interface TopicRowActions {
  onPinParent: (node: TopicTreeNode) => void;
  onSetWorth: (node: TopicTreeNode) => void;
  onEdit: (node: TopicTreeNode) => void;
  onAddChild: (node: TopicTreeNode) => void;
  onMakeRoot: (node: TopicTreeNode) => void;
}

export function TopicTreeRow({
  node,
  metas,
  selected,
  collapsed,
  onToggle,
  onSelect,
  actions,
  busy,
}: {
  node: TopicTreeNode;
  metas: BandMeta[];
  selected: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onSelect: () => void;
  actions: TopicRowActions;
  busy: boolean;
}) {
  const root = rootTypeMeta(node.rootType);
  const hasChildren = node.children.length > 0;
  const bandEntries = Object.entries(node.subtree.bands).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div
      className={cn(
        "group flex items-start gap-1.5 border-b border-border px-2 py-1.5 text-sm last:border-b-0",
        selected ? "bg-primary/5" : "hover:bg-muted/40",
      )}
      style={{ paddingLeft: `${8 + node.depth * 14}px` }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand" : "Collapse"}
        className={cn(
          "mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted",
          !hasChildren && "invisible",
        )}
      >
        <ChevronRight
          className={cn("h-3.5 w-3.5 transition-transform", !collapsed && "rotate-90")}
        />
      </button>

      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate font-medium text-foreground">
            {node.topic.name}
          </span>
          <span
            className={cn(
              "shrink-0 rounded border px-1 py-px text-[10px] leading-tight",
              root.offering
                ? "border-success/40 bg-success/10 text-success"
                : "border-info/40 bg-info/10 text-info",
            )}
            title={root.meaning}
          >
            {node.depth === 0
              ? root.label
              : `under ${root.offering ? "a money root" : "an authority root"}`}
          </span>
          {node.negativeGuard ? (
            <span className="flex shrink-0 items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1 py-px text-[10px] leading-tight text-destructive">
              <TriangleAlert className="h-2.5 w-2.5" />
              never counts as a win
            </span>
          ) : null}
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <WorthBadge node={node} />
          {node.subtree.keywords > 0 ? (
            <span className="tabular-nums">
              {formatCount(node.subtree.keywords)} keyword
              {node.subtree.keywords === 1 ? "" : "s"}
              {node.own.keywords !== node.subtree.keywords
                ? ` (${formatCount(node.own.keywords)} here)`
                : ""}
              {node.subtree.clicks > 0
                ? ` · ${formatCount(node.subtree.clicks)} clicks`
                : ""}
            </span>
          ) : (
            <span>no keywords resolve through this yet</span>
          )}
          {bandEntries.map(([band, count]) => {
            const meta = bandMetaFor(metas, band);
            return (
              <span
                key={band}
                className={cn(
                  "rounded border px-1 py-px text-[10px] leading-tight",
                  meta.chip,
                )}
              >
                {meta.label} {count}
              </span>
            );
          })}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            className="h-6 w-6 shrink-0 opacity-60 group-hover:opacity-100"
            aria-label={`Actions for ${node.topic.name}`}
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => actions.onPinParent(node)}>
            Pin a parent…
          </DropdownMenuItem>
          {node.topic.parent_id ? (
            <DropdownMenuItem onSelect={() => actions.onMakeRoot(node)}>
              Make this the top of its own branch
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => actions.onAddChild(node)}>
            Add a topic under this…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => actions.onSetWorth(node)}>
            Set what it&apos;s worth here…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => actions.onEdit(node)}>
            Rename or change its type…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function WorthBadge({ node }: { node: TopicTreeNode }) {
  if (node.ownWorth) {
    return (
      <span className="rounded border border-primary/40 bg-primary/10 px-1 py-px text-[10px] leading-tight text-primary">
        worth {formatWeight(node.effectiveWeight)} · your ruling
      </span>
    );
  }
  if (node.inheritedFrom) {
    return (
      <span className="flex items-center gap-1 rounded border border-border bg-muted/50 px-1 py-px text-[10px] leading-tight text-muted-foreground">
        <CornerDownRight className="h-2.5 w-2.5" />
        worth {formatWeight(node.effectiveWeight)} · inherited from{" "}
        <span className="font-medium text-foreground">
          {node.inheritedFrom.name}
        </span>
      </span>
    );
  }
  return (
    <span className="rounded border border-warning/40 bg-warning/10 px-1 py-px text-[10px] leading-tight text-warning">
      no worth anywhere above it · falls back to {DEFAULT_TOPIC_WEIGHT}
    </span>
  );
}
