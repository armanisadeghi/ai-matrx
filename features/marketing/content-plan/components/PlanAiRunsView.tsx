"use client";

/**
 * features/marketing/content-plan/components/PlanAiRunsView.tsx
 *
 * EVERY PAID AI RUN THIS SITE HAS EVER HAD — and the full result of any one.
 *
 * The failure this closes: the platform ran a model, showed the answer once,
 * saved a fraction of it into a column, and left the owner with no way to see
 * what they had paid for. Every content-plan AI action now records a
 * `chat.agent_run` row with its COMPLETE request and result; this view is the
 * door to them (THE DOOR LAW — if the UI names a thing that has an identity,
 * the UI must let the user reach it).
 *
 * A per-page run also links to its page, so opening one offers the page it was
 * run for.
 */
import { useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { usePlanAiRun, usePlanAiRuns } from "../hooks/usePlanAiRuns";
import { usePlanWorkspaceParams } from "../hooks/usePlanWorkspaceParams";

const STATUS_TONE: Record<string, string> = {
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  processing: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function when(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function money(cost: number): string {
  if (!cost) return "";
  return cost < 0.01 ? "<$0.01" : `$${cost.toFixed(2)}`;
}

export function PlanAiRunsView({ siteId }: { siteId: string | null }) {
  const runs = usePlanAiRuns(siteId);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const detail = usePlanAiRun(siteId, openRunId);
  const { setSiteId, setView } = usePlanWorkspaceParams();

  if (!siteId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Pick a site to see its AI runs.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">AI runs</h2>
          <p className="text-sm text-muted-foreground">
            Every AI run this site has paid for — page briefs, deepens, plan
            generation, keyword strategy, entity attachment and reviews. Open
            one to read exactly what the model was asked and what it answered.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void runs.refetch()}
          disabled={runs.isFetching}
        >
          {runs.isFetching ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {/* An unreachable history is NOT an empty history — saying "no runs yet"
          when the call failed tells the user their paid runs are gone. */}
      {runs.error ? (
        <div className="flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <span>
            Could not load this site&apos;s AI runs:{" "}
            {runs.error instanceof Error ? runs.error.message : "unknown error"}
          </span>
        </div>
      ) : null}

      {runs.isLoading ? (
        <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading runs…
        </div>
      ) : null}

      {!runs.isLoading && !runs.error && (runs.data ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No AI runs recorded for this site yet. Generate a plan, draft a page
          brief, or run one of the Setup passes — each one is recorded here in
          full.
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {(runs.data ?? []).map((run) => {
          const open = openRunId === run.runId;
          return (
            <div key={run.runId} className="rounded-md border">
              <button
                type="button"
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50"
                onClick={() => setOpenRunId(open ? null : run.runId)}
              >
                <ChevronRight
                  className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                />
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    STATUS_TONE[run.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {run.status || "unknown"}
                </span>
                <span className="font-medium">{run.kindLabel}</span>
                {run.nodeRoute ? (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {run.nodeRoute}
                  </span>
                ) : null}
                <span className="truncate text-sm text-muted-foreground">
                  {run.error || run.headline}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {money(run.totalCost)} {when(run.createdAt)}
                </span>
              </button>

              {open ? (
                <div className="border-t p-3 text-sm">
                  {detail.isLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading this
                      run…
                    </div>
                  ) : detail.error ? (
                    <span className="text-red-600">
                      Could not open this run:{" "}
                      {detail.error instanceof Error
                        ? detail.error.message
                        : "unknown error"}
                    </span>
                  ) : detail.data ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Model: {run.modelId ?? "unrecorded"}</span>
                        <span>Run id: {run.runId}</span>
                        {detail.data.nodeId ? (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0"
                            onClick={() => {
                              setSiteId(siteId);
                              setView("tree");
                            }}
                          >
                            Open the page this ran for
                          </Button>
                        ) : null}
                      </div>
                      {Object.keys(detail.data.error).length > 0 ? (
                        <Section title="Error">
                          {JSON.stringify(detail.data.error, null, 2)}
                        </Section>
                      ) : null}
                      <Section title="Result">
                        {JSON.stringify(detail.data.result, null, 2)}
                      </Section>
                      <Section title="What the model was asked">
                        {JSON.stringify(detail.data.request, null, 2)}
                      </Section>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
        {title}
      </div>
      <pre className="max-h-96 overflow-auto rounded bg-muted/50 p-2 text-xs">
        {children}
      </pre>
    </div>
  );
}
