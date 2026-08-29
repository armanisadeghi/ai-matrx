"use client";

/**
 * The `(core)` body behind both runs lists — `/workflows/runs` (everything)
 * and `/workflows/[id]/runs` (one workflow's history).
 *
 * ONE page component, because the two differ only in chrome: the per-workflow
 * door carries the workflow's name and a way back to it. The list itself is
 * `RunsList`, shared verbatim.
 *
 * Route conformance: chrome in `RouteHeader`, body `h-full overflow-hidden`
 * with ONE inner scroll area, content flowing behind the glass header.
 */

import { useEffect, useState } from "react";
import { ListOrdered } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";

import { fetchWorkflowFacts } from "../service";
import { RunsList } from "./RunsList";
import { WaitingBadge } from "./WaitingBadge";

export function RunsListPage({ definitionId }: { definitionId?: string }) {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!definitionId) return undefined;
    let live = true;
    void fetchWorkflowFacts([definitionId])
      .then((facts) => {
        if (live) setName(facts.get(definitionId)?.name ?? null);
      })
      // The name is chrome; the runs below it are the record. A failed lookup
      // leaves the generic title rather than an error page over a working list.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [definitionId]);

  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton
              href={definitionId ? `/workflows/${definitionId}` : "/workflows/all"}
              ariaLabel={definitionId ? "Back to this workflow" : "Back to workflows"}
            />
            <ListOrdered className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="ml-1.5 min-w-0 truncate text-sm font-medium text-foreground">
              {definitionId ? `${name ?? "Workflow"} · Runs` : "Runs"}
            </span>
          </div>
        }
        right={<WaitingBadge />}
      />
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          <RunsList definitionId={definitionId} />
        </div>
      </div>
    </>
  );
}
