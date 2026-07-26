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

import { ApplyDirectiveButton } from "@/features/matrx-envelope/ApplyDirectiveButton";
import { EnvelopeFallbackCard } from "@/features/matrx-envelope/EnvelopeFallbackCard";
import type { EnvelopeRendererProps } from "@/features/matrx-envelope/registry";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { parsePlanTreeItems } from "./parseDirectiveItems";
import { useResolvePlanTree } from "./useResolvePlanTree";
import { countSpecNodes, type PlanTreeDirectiveItem } from "./types";

function PlanTreeItemCard({
  item,
  envelope,
}: {
  item: PlanTreeDirectiveItem;
  envelope: EnvelopeRendererProps["envelope"];
}) {
  const { status, data } = useResolvePlanTree(item);
  const specTotal = countSpecNodes(item.nodes);
  const resolvedSiteId = data?.siteId ?? item.site_id;
  // Unresolved = the server never applied this (e.g. the agent had no output
  // schema, so the structured-output dispatcher never fired). It is NOT inert:
  // the user applies it with one click. See ApplyDirectiveButton.
  const unapplied = status === "exhausted" || (!resolvedSiteId && !data);
  const contentPlanHref = resolvedSiteId
    ? `${marketingRoutes.contentPlan()}?site=${resolvedSiteId}`
    : marketingRoutes.contentPlan();

  return (
    <div className="my-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <ListTree className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-medium">
          Content plan tree · {specTotal} node{specTotal === 1 ? "" : "s"}
        </span>
        {item.site ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {item.site}
          </span>
        ) : null}
        {status === "polling" ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> applying…
          </span>
        ) : status === "resolved" && data ? (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.matchedCount}/{specTotal} live · site total {data.liveCount}
          </span>
        ) : null}
        {unapplied ? (
          <span className="ml-auto inline-flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              not applied yet
            </span>
            <ApplyDirectiveButton envelope={envelope} label="Apply plan" />
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
        href={contentPlanHref}
        className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Open in Content Plan <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

const PlanTreeRenderer = ({ envelope }: EnvelopeRendererProps) => {
  const items = parsePlanTreeItems(envelope);
  // NEVER return null — that deletes the whole message block (see
  // EnvelopeFallbackCard). Degrade visibly instead.
  if (items.length === 0) {
    return (
      <EnvelopeFallbackCard
        envelope={envelope}
        reason="no readable plan items"
      />
    );
  }
  return (
    <>
      {items.map((item, index) => (
        <PlanTreeItemCard
          key={`${item.site_id ?? item.site ?? "site"}:${index}`}
          item={item}
          envelope={envelope}
        />
      ))}
    </>
  );
};

export default PlanTreeRenderer;
