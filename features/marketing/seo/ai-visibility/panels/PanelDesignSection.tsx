"use client";

// features/marketing/seo/ai-visibility/panels/PanelDesignSection.tsx
//
// Per panel, the "Design" section: the design run's steps (who performs each —
// automatic, AI, or you), its notices, the files it wrote, every review's
// record, and the open review as a card. Polls while the run is working.
//
// A panel with no design run (its questions were typed in by hand) says so
// plainly — a 404 from the design door is "not designed", never an error.

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, FileText } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  InlineQueryError,
  JsonPreview,
  LoadingSurface,
  formatCompactDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database.types";

import { GateReviewCard } from "./GateReviewCard";
import {
  artifactName,
  gateStatusName,
  performerName,
  stepStatusName,
} from "./format";
import {
  fetchDesignArtifact,
  fetchDesignRun,
  panelQueryKeys,
} from "./panel-api";
import type { DesignArtifactRef, DesignRunView } from "./types";

/**
 * How often an open page re-reads a RUNNING design run. A screen-refresh
 * cadence, not a behaviour an organization chooses (the run's own timing —
 * gate waits, cadence — comes from the server's knobs), so it is a constant.
 * Polling stops the moment the run is waiting for a review, finished or failed.
 */
const POLL_MS = 4000;

/** The panel's design run — `null` when the panel was never designed. */
export function usePanelDesign(
  panelId: string,
  organizationId: string,
): UseQueryResult<DesignRunView | null, Error> {
  const dispatch = useAppDispatch();
  return useQuery({
    queryKey: panelQueryKeys.design(panelId),
    // The server answers `null` for a hand-typed (never designed) panel; a 404 now means the
    // panel itself is missing or not readable, and is shown as the error it is.
    queryFn: () => fetchDesignRun(dispatch, panelId, organizationId),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? POLL_MS : false,
  });
}

function stepTone(status: string): "success" | "warning" | "destructive" | "secondary" {
  if (status === "done") return "success";
  if (status === "running") return "warning";
  if (status === "failed") return "destructive";
  return "secondary";
}

function ArtifactRow({
  artifact,
  panelId,
  organizationId,
}: {
  artifact: DesignArtifactRef;
  panelId: string;
  organizationId: string;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const content = useQuery({
    queryKey: panelQueryKeys.artifact(panelId, `${artifact.name}@${artifact.version}`),
    queryFn: () => fetchDesignArtifact(dispatch, panelId, artifact.name, organizationId),
    enabled: open,
  });
  return (
    <li className="text-xs">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-muted/40"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{artifactName(artifact.name)}</span>
        <span className="text-muted-foreground">
          version {artifact.version} · {formatCompactDate(artifact.created_at)}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border/50 bg-muted/20">
          {content.isPending ? (
            <LoadingSurface label="Opening…" />
          ) : content.error ? (
            <div className="p-2">
              <InlineQueryError
                what={artifactName(artifact.name)}
                error={content.error}
                onRetry={() => void content.refetch()}
              />
            </div>
          ) : typeof content.data.content === "string" ? (
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 text-[11px] leading-5">
              {content.data.content}
            </pre>
          ) : (
            <JsonPreview value={content.data.content as Json} />
          )}
        </div>
      ) : null}
    </li>
  );
}

export function PanelDesignSection({
  design,
  panelId,
  organizationId,
}: {
  design: UseQueryResult<DesignRunView | null, Error>;
  panelId: string;
  organizationId: string;
}) {
  if (design.isPending) return <LoadingSurface label="Loading the design run…" />;
  if (design.error) {
    return (
      <div className="p-3">
        <InlineQueryError
          what="this panel's design run"
          error={design.error}
          onRetry={() => void design.refetch()}
        />
      </div>
    );
  }
  const run = design.data;
  if (!run) {
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground">
        This panel was not designed by the workflow — its questions were typed in
        by hand. Use &ldquo;Design a panel&rdquo; above to build a designed one
        for this site.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">
        {run.status === "running"
          ? "The design is working — this updates on its own."
          : run.status === "waiting_for_gate"
            ? "The design is paused for your review below."
            : run.status === "completed"
              ? "The design is finished."
              : "The design stopped with a failure — see the notices and steps below."}
      </p>

      {run.notices.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {run.notices.map((notice, index) => (
            <li
              key={`${notice.code}-${index}`}
              className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-[11px]"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span>
                {notice.message}
                {notice.remedy ? (
                  <span className="text-muted-foreground"> {notice.remedy}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {run.open_gate ? (
        <GateReviewCard
          key={`${run.run_id}-${run.open_gate.gate}`}
          card={run.open_gate}
          panelId={panelId}
          organizationId={organizationId}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/70 bg-card">
          <p className="border-b border-border/60 px-3 py-2 text-xs font-semibold">Steps</p>
          <ol className="flex flex-col divide-y divide-border/50">
            {run.steps.map((step) => (
              <li key={step.key} className="px-3 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    {step.label}
                    <span className="text-muted-foreground"> · {performerName(step.performer)}</span>
                  </span>
                  <Badge variant={stepTone(step.status)} className="whitespace-nowrap">
                    {stepStatusName(step.status)}
                  </Badge>
                </div>
                {step.detail ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{step.detail}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border/70 bg-card">
            <p className="border-b border-border/60 px-3 py-2 text-xs font-semibold">Your reviews</p>
            <ul className="flex flex-col divide-y divide-border/50">
              {run.gates.map((gate) => (
                <li key={gate.gate} className="px-3 py-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {gate.gate}. {gate.title}
                    </span>
                    <span
                      className={cn(
                        "text-[11px]",
                        gate.status === "open" && "font-medium text-amber-700 dark:text-amber-400",
                        gate.status === "continued_pending" && "text-amber-700 dark:text-amber-400",
                        (gate.status === "approved" || gate.status === "edited") &&
                          "text-emerald-700 dark:text-emerald-400",
                        gate.status === "not_reached" && "text-muted-foreground",
                      )}
                    >
                      {gateStatusName(gate.status)}
                    </span>
                  </div>
                  {gate.decided_at || gate.note ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {gate.decided_by ? `${gate.decided_by} · ` : ""}
                      {gate.decided_at ? formatCompactDate(gate.decided_at) : ""}
                      {gate.note ? ` — ${gate.note}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border/70 bg-card">
            <p className="border-b border-border/60 px-3 py-2 text-xs font-semibold">
              Files this design wrote
            </p>
            {run.artifacts.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">None yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/50">
                {run.artifacts.map((artifact) => (
                  <ArtifactRow
                    key={`${artifact.name}-${artifact.version}`}
                    artifact={artifact}
                    panelId={panelId}
                    organizationId={organizationId}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
