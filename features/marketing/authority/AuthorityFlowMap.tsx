"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import type { LinkGraphElement } from "@/features/marketing/components/inspection/link-graph/LinkGraphCytoscape";
import type { LinkGraphEdge } from "@/features/marketing/components/inspection/link-graph/model";
import type { AuthorityRouterResult } from "./types";

const LinkGraphCytoscape = dynamic(
  () =>
    import("@/features/marketing/components/inspection/link-graph/LinkGraphCytoscape"),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> },
);

export function AuthorityFlowMap({
  result,
}: {
  result: AuthorityRouterResult;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const model = useMemo(() => {
    const pageById = new Map(result.pages.map((page) => [page.page_id, page]));
    const involved = new Set<string>();
    for (const recommendation of result.recommendations) {
      involved.add(recommendation.source_page_id);
      involved.add(recommendation.target_page_id);
    }
    const sourceIds = new Set(
      result.recommendations.map((item) => item.source_page_id),
    );
    const targetIds = new Set(
      result.recommendations.map((item) => item.target_page_id),
    );
    const elements: LinkGraphElement[] = Array.from(involved).flatMap(
      (pageId) => {
        const page = pageById.get(pageId);
        if (!page) return [];
        const source = sourceIds.has(pageId);
        const target = targetIds.has(pageId);
        const both = source && target;
        return [
          {
            id: pageId,
            label: page.path || new URL(page.url).pathname || "/",
            color: both ? "#f59e0b" : source ? "#0d9488" : "#7c3aed",
            size:
              22 +
              Math.max(page.link_score ?? 0, page.active_backlinks * 2) * 0.34,
            external: false,
            isRoot: page.path === "/",
            isFolder: false,
            importance: Math.max(
              0.05,
              Math.min(1, (page.link_score ?? 5) / 100),
            ),
          },
        ];
      },
    );
    const edges: LinkGraphEdge[] = result.recommendations.map((item) => ({
      id: item.candidate_key,
      source: item.source_page_id,
      target: item.target_page_id,
      weight: Math.max(1, Math.round(item.score / 20)),
      anchors: [item.anchor_text],
      nofollow: false,
      broken: false,
    }));
    return { elements, edges, pageById };
  }, [result]);
  const selected = selectedId ? model.pageById.get(selectedId) : null;

  if (model.elements.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        No proposed routes are available for the map yet.
      </div>
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="h-[30rem] overflow-hidden rounded-xl border bg-card">
        <LinkGraphCytoscape
          elements={model.elements}
          edges={model.edges}
          rootId={null}
          layoutId="fcose"
          selectedId={selectedId}
          searchQuery=""
          labelMinSize={18}
          onNodeClick={setSelectedId}
          onBackgroundClick={() => setSelectedId(null)}
        />
      </div>
      <aside className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-teal-600" />
            passes authority
          </span>
          <span>
            <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-violet-600" />
            needs authority
          </span>
          <span>
            <i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
            both
          </span>
        </div>
        {selected ? (
          <div className="mt-5 space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Selected page
              </p>
              <p className="mt-1 break-all font-mono text-sm font-semibold">
                {selected.path || selected.url}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Metric
                label="Internal Link Score"
                value={selected.link_score?.toFixed(1) ?? "—"}
              />
              <Metric
                label="Active backlinks"
                value={selected.active_backlinks.toLocaleString()}
              />
              <Metric
                label="In / out"
                value={`${selected.inbound_links} / ${selected.outbound_links}`}
              />
              <Metric
                label="Avg. position"
                value={selected.average_position?.toFixed(1) ?? "—"}
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {selected.role} · {selected.target_keyword || "No mapped keyword"}
            </p>
          </div>
        ) : (
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Select a page to inspect why it is supplying or receiving authority.
            Arrow direction is the proposed link direction.
          </p>
        )}
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-semibold text-foreground">{value}</p>
    </div>
  );
}
