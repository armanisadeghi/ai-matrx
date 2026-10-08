"use client";

// features/mandates/runs/RunFacts.tsx — the facts row of a run and the live
// output block shared by both sides of the Runs tab.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusToken } from "@/components/official/ConfigurationFields";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { conversationHref } from "@/features/hindsight/subject-doors";
import { absoluteWhen, costWords, durationWords } from "@/features/mandates/run-history/format";
import { LiveRunDisplay } from "@ai-matrx/chat/agents/components/live-run/LiveRunDisplay";
import type { StoredRun } from "./service";
import type { StreamedRunState } from "./useStreamedRun";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <span className="shrink-0 text-[12px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-[12px] text-foreground">{children}</span>
    </div>
  );
}

export function HolderRef({ run }: { run: StoredRun }) {
  const h = run.holder;
  if (!h.id) return <span className="text-muted-foreground">Not recorded</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <EntityRef token={h.type} id={h.id} name={h.name ?? (h.type === "workflow" ? "Workflow" : "Agent")} showIcon={false} />
      <span className="text-muted-foreground">{h.versionNumber != null ? `v${h.versionNumber}` : "Latest"}</span>
    </span>
  );
}

export function RunFacts({ run, audience }: { run: StoredRun; audience: "admin" | "product" }) {
  const { unit: costDisplay } = useCostDisplay();
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      <Fact label="Result">
        {run.success === null ? (
          <StatusToken status="unknown" label="Not recorded" />
        ) : run.success ? (
          <StatusToken status="ok" label="Succeeded" />
        ) : (
          <StatusToken status="error" label="Failed" />
        )}
      </Fact>
      <Fact label="Holder">
        <HolderRef run={run} />
      </Fact>
      <Fact label="Model">{run.modelId ?? "Not recorded"}</Fact>
      <Fact label="Ran by">{run.ranBy ?? "Not recorded"}</Fact>
      <Fact label="When">{run.createdAt ? absoluteWhen(run.createdAt) : "—"}</Fact>
      <Fact label="Cost">{costWords(run.cost, costDisplay)}</Fact>
      <Fact label="Time">{durationWords(run.durationMs)}</Fact>
      <Fact label="Conversation">
        <Link
          href={conversationHref(run.conversationId, audience)}
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
        >
          Open
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </Fact>
      {run.error ? <div className="col-span-2 text-[12px] text-destructive">{run.error}</div> : null}
    </div>
  );
}

/** A streamed run's live output, then its cost and time beside the original's. */
export function StreamedRunBlock({
  label,
  state,
  original,
  audience,
}: {
  label: string;
  state: StreamedRunState;
  original: StoredRun | null;
  audience: "admin" | "product";
}) {
  const { unit: costDisplay } = useCostDisplay();
  if (!state.requestId && !state.result) return null;
  const stored = state.stored;
  return (
    <div className="space-y-2">
      {state.requestId ? (
        <LiveRunDisplay
          requestId={state.requestId}
          label={label}
          pending={state.running}
          failure={state.result && !state.result.ok ? state.result.error : null}
          bodyClassName="max-h-[60dvh] overflow-y-auto px-3 py-2 text-sm"
        />
      ) : state.result?.error ? (
        <p className="text-[12px] text-destructive">{state.result.error}</p>
      ) : null}
      {state.result ? (
        <div className="grid grid-cols-[auto_1fr_1fr] gap-x-4 gap-y-0.5 text-[12px]">
          <span />
          <span className="text-muted-foreground">This run</span>
          <span className="text-muted-foreground">Original</span>
          <span className="text-muted-foreground">Cost</span>
          <span className="tabular-nums">{stored ? costWords(stored.cost, costDisplay) : "Reading"}</span>
          <span className="tabular-nums">{original ? costWords(original.cost, costDisplay) : "—"}</span>
          <span className="text-muted-foreground">Time</span>
          <span className="tabular-nums">{durationWords(stored?.durationMs ?? state.result.durationMs)}</span>
          <span className="tabular-nums">{original ? durationWords(original.durationMs) : "—"}</span>
          {state.result.conversationId ? (
            <>
              <span className="text-muted-foreground">Conversation</span>
              <Link
                href={conversationHref(state.result.conversationId, audience)}
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                Open
                <ArrowUpRight className="h-3 w-3" />
              </Link>
              <span />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
