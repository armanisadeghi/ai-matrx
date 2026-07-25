"use client";

/**
 * Chat renderer for `output_directive:plan_tree` envelopes. Position decides
 * capability (MATRX_ENVELOPE.md): in content this card is a RECEIPT — the
 * aidream dispatcher already applied (or proposed) the tree server-side.
 * The card polls the plan schema (read-only) to turn optimistic spec rows
 * into live routes, and deep-links into the Content Plan workspace.
 */
import Link from "next/link";
import { ExternalLink, ListTree, Loader2 } from "lucide-react";

import type { EnvelopeRendererProps } from "@/features/matrx-envelope/registry";

import { parsePlanTreeItems } from "./parseDirectiveItems";
import { useResolvePlanTree } from "./useResolvePlanTree";
import { countSpecNodes, type PlanTreeDirectiveItem } from "./types";

function PlanTreeItemCard({ item }: { item: PlanTreeDirectiveItem }) {
  const { status, data } = useResolvePlanTree(item);
  const specTotal = countSpecNodes(item.nodes);

  return (
    <div className="my-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <ListTree className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-medium">
          Content plan tree · {specTotal} node{specTotal === 1 ? "" : "s"}
        </span>
        {status === "polling" ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> applying…
          </span>
        ) : status === "resolved" && data ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.matchedCount}/{specTotal} live · site total {data.liveCount}
          </span>
        ) : status === "exhausted" ? (
          <span className="ml-auto text-xs text-destructive">
            not visible yet — check the apply receipt above
          </span>
        ) : null}
      </div>
      <ul className="mt-2 space-y-0.5">
        {item.nodes.slice(0, 8).map((node, index) => {
          const resolved = data?.topLevel[index];
          return (
            <li
              key={`${node.slug ?? node.label}:${index}`}
              className="flex items-center gap-2 text-xs"
            >
              <span className="rounded bg-muted px-1 uppercase text-muted-foreground">
                {node.node_type}
              </span>
              <span className="truncate">{node.label}</span>
              {resolved?.route ? (
                <span className="truncate font-mono text-muted-foreground">
                  {resolved.route}
                </span>
              ) : null}
            </li>
          );
        })}
        {item.nodes.length > 8 ? (
          <li className="text-xs text-muted-foreground">
            +{item.nodes.length - 8} more top-level nodes
          </li>
        ) : null}
      </ul>
      <Link
        href={`/content-plan?site=${item.site_id}`}
        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Open in Content Plan <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

const PlanTreeRenderer = ({ envelope }: EnvelopeRendererProps) => {
  const items = parsePlanTreeItems(envelope);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item, index) => (
        <PlanTreeItemCard key={`${item.site_id}:${index}`} item={item} />
      ))}
    </>
  );
};

export default PlanTreeRenderer;
