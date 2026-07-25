"use client";

/**
 * Chat renderer for `output_directive:plan_node_patch` — a compact receipt
 * per patched node, resolved to its live route (the patch may have changed
 * the slug, so resolution retries by label). Applied server-side; this is
 * display + read-only resolution only.
 */
import Link from "next/link";
import { ExternalLink, PencilLine, Loader2 } from "lucide-react";

import type { EnvelopeRendererProps } from "@/features/matrx-envelope/registry";

import { parsePlanNodePatchItems } from "./parseDirectiveItems";
import { useResolvePatchedNode } from "./useResolvePlanTree";
import type { PlanNodePatchItem } from "./types";

function patchedFields(item: PlanNodePatchItem): string[] {
  const fields: string[] = [];
  if (item.label != null) fields.push("label");
  if (item.slug != null) fields.push("slug");
  if (item.status != null) fields.push("status");
  if (item.priority != null) fields.push("priority");
  if (item.brief != null) fields.push("brief");
  if (item.parent_id != null) fields.push("parent");
  if (item.primary_keyword_id != null) fields.push("keyword");
  return fields;
}

function PatchCard({ item }: { item: PlanNodePatchItem }) {
  const { status, data } = useResolvePatchedNode(item);
  const target = data?.label ?? item.label ?? item.route ?? item.node_id;
  return (
    <div className="my-1.5 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <PencilLine className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate font-medium">{target}</span>
      <span className="truncate text-muted-foreground">
        {patchedFields(item).join(", ") || "patched"}
      </span>
      {status === "polling" ? (
        <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      ) : data ? (
        <Link
          href={
            item.site_id
              ? `/content-plan?site=${item.site_id}`
              : "/content-plan"
          }
          className="ml-auto inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
        >
          {data.route ?? "open"} <ExternalLink className="h-3 w-3" />
        </Link>
      ) : status === "exhausted" ? (
        <span className="ml-auto shrink-0 text-destructive">not found</span>
      ) : null}
    </div>
  );
}

const PlanNodePatchRenderer = ({ envelope }: EnvelopeRendererProps) => {
  const items = parsePlanNodePatchItems(envelope);
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item, index) => (
        <PatchCard
          key={`${item.node_id ?? item.route ?? index}:${index}`}
          item={item}
        />
      ))}
    </>
  );
};

export default PlanNodePatchRenderer;
