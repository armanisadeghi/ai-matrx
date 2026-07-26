"use client";

/**
 * The approval surface for a `plan_tree` directive.
 *
 * THE RULE: a user asked to approve a large write gets to SEE the thing they
 * are approving. Not three lines and a shrug. The whole tree is here —
 * summarised at the top, drillable level by level, and dumpable as raw JSON —
 * because an informed yes is the only yes worth collecting.
 *
 * What it must never do (all three were real defects):
 *  - hide the payload behind a truncated teaser,
 *  - claim "applying…" while nothing is being applied,
 *  - go silent through a multi-second write.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  ListTree,
  Check,
} from "lucide-react";

import { ApplyDirectiveButton } from "@/features/matrx-envelope/ApplyDirectiveButton";
import type { MatrxEnvelope } from "@/features/matrx-envelope/envelope";

import type { PlanTreeDirectiveItem, PlanTreeNodeSpec } from "./types";

const TYPE_STYLES: Record<string, string> = {
  home: "bg-primary/10 text-primary",
  pillar: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  cluster: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  article: "bg-muted text-muted-foreground",
  index: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

function countByType(nodes: PlanTreeNodeSpec[], acc: Map<string, number> = new Map()) {
  for (const node of nodes) {
    acc.set(node.node_type, (acc.get(node.node_type) ?? 0) + 1);
    if (node.children?.length) countByType(node.children, acc);
  }
  return acc;
}

function totalNodes(nodes: PlanTreeNodeSpec[]): number {
  return nodes.reduce(
    (sum, n) => sum + 1 + (n.children?.length ? totalNodes(n.children) : 0),
    0,
  );
}

function NodeRow({
  node,
  depth,
  forceOpen,
}: {
  node: PlanTreeNodeSpec;
  depth: number;
  forceOpen: boolean;
}) {
  // Top two levels open by default — enough to judge the shape without a wall.
  const [open, setOpen] = useState(depth < 1);
  const expanded = forceOpen || open;
  const kids = node.children ?? [];
  const hasKids = kids.length > 0;

  return (
    <li>
      <div
        className="group flex items-start gap-1.5 rounded py-0.5 hover:bg-accent/50"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {hasKids ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <span
          className={`mt-0.5 shrink-0 rounded px-1 text-[10px] font-medium uppercase leading-4 ${
            TYPE_STYLES[node.node_type] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {node.node_type}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-medium text-foreground">{node.label}</span>
            {node.slug ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                /{node.slug}
              </span>
            ) : null}
            {node.priority === 1 ? (
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                priority 1
              </span>
            ) : null}
            {hasKids && !expanded ? (
              <span className="text-[10px] text-muted-foreground">
                {kids.length} child{kids.length === 1 ? "" : "ren"}
              </span>
            ) : null}
          </div>
          {node.primary_keyword_phrase || node.page_type ? (
            <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
              {node.primary_keyword_phrase ? (
                <span>🔑 {node.primary_keyword_phrase}</span>
              ) : null}
              {node.page_type ? <span>· {node.page_type}</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      {hasKids && expanded ? (
        <ul>
          {kids.map((child, i) => (
            <NodeRow
              key={`${child.slug ?? child.label}:${i}`}
              node={child}
              depth={depth + 1}
              forceOpen={forceOpen}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PlanTreePreview({
  item,
  envelope,
  applied,
}: {
  item: PlanTreeDirectiveItem;
  envelope: MatrxEnvelope;
  applied: boolean;
}) {
  const [expandAll, setExpandAll] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [copied, setCopied] = useState(false);

  const total = useMemo(() => totalNodes(item.nodes), [item.nodes]);
  const breakdown = useMemo(() => countByType(item.nodes), [item.nodes]);
  const json = useMemo(() => JSON.stringify(envelope, null, 2), [envelope]);

  async function copyJson() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-2 rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <ListTree className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-medium">
          Content plan · {total} page{total === 1 ? "" : "s"}
        </span>
        {item.site ? (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {item.site}
          </span>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {[...breakdown.entries()]
            .map(([type, n]) => `${n} ${type}${n === 1 ? "" : "s"}`)
            .join(" · ")}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {!applied ? (
            <ApplyDirectiveButton
              envelope={envelope}
              label={`Apply ${total} pages`}
              itemCount={total}
            />
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-primary">
              <Check className="h-3.5 w-3.5" /> applied
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-3 px-3 py-1 text-[11px]">
        <button
          type="button"
          onClick={() => setExpandAll((v) => !v)}
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          {expandAll ? "Collapse all" : "Expand all"}
        </button>
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
        >
          <Code2 className="h-3 w-3" />
          {showJson ? "Hide JSON" : "View full JSON"}
        </button>
        {showJson ? (
          <button
            type="button"
            onClick={copyJson}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>

      {showJson ? (
        <pre className="mx-3 mb-2 max-h-96 overflow-auto rounded border border-border bg-muted p-2 text-[11px] leading-relaxed">
          {json}
        </pre>
      ) : (
        <ul className="max-h-[28rem] overflow-auto px-2 pb-2">
          {item.nodes.map((node, i) => (
            <NodeRow
              key={`${node.slug ?? node.label}:${i}`}
              node={node}
              depth={0}
              forceOpen={expandAll}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default PlanTreePreview;
