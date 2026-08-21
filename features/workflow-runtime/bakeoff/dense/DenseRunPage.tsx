"use client";

/**
 * DenseRunPage — the ui-dense bake-off take on the auto-generated workflow
 * run page (`/workflows/bakeoff/dense/[id]`).
 *
 * Concept: an ops console / departure board. One fixed frame, three columns —
 * the plan ledger (every step, 4 or 40), the magnifier (the working step's
 * internals, live), and the activity log (what actually happened). Every
 * deliverable is named in a fixed strip from frame zero. The frame never
 * moves; only the content inside each region changes.
 *
 * Data plumbing is 100% canonical (adoptWorkflowRun / selectors / lanes /
 * InvocationBody / kind components); only the presentation is new.
 *
 * The run id rides `?run=` so a mid-run refresh re-adopts the same run and
 * resumes exactly where it was (durable replay + heartbeat tails).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { toast } from "@/lib/toast";

import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import { fetchWorkflowDefinition } from "../../surface/service";
import { deriveRunForm } from "../../surface/run-form";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import { DenseIntake } from "./DenseIntake";
import { DenseConsole } from "./DenseConsole";

interface LoadedWorkflow {
  id: string;
  name: string;
  definition: WorkflowDefinitionLike;
}

/** Skeleton in the exact geometry of the console — no layout jump on load. */
function LoadingBody() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-11 shrink-0 border-b border-border/60 px-3 py-2">
        <div className="h-6 w-64 animate-pulse rounded-md bg-muted/60" />
      </div>
      <div className="h-9 shrink-0 border-b border-border/60 px-3 py-2">
        <div className="h-5 w-96 max-w-full animate-pulse rounded-md bg-muted/40" />
      </div>
      <div className="grid min-h-0 flex-1 lg:grid-cols-[280px_minmax(0,1fr)_320px]">
        <div className="hidden border-r border-border/60 p-2 lg:block">
          <div className="h-full animate-pulse rounded-md bg-muted/30" />
        </div>
        <div className="p-3">
          <div className="h-56 animate-pulse rounded-lg bg-muted/40" />
        </div>
        <div className="hidden border-l border-border/60 p-2 lg:block">
          <div className="h-full animate-pulse rounded-md bg-muted/30" />
        </div>
      </div>
    </div>
  );
}

export function DenseRunPage({ definitionId }: { definitionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("run");

  const [workflow, setWorkflow] = useState<LoadedWorkflow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { startRun, starting } = useWorkflowRunControls();

  useEffect(() => {
    let cancelled = false;
    void fetchWorkflowDefinition(definitionId)
      .then((loaded) => {
        if (cancelled) return;
        if (!loaded) {
          setLoadError(
            "This workflow could not be opened. It may have been removed, or it belongs to another account.",
          );
          return;
        }
        setWorkflow({
          id: loaded.id,
          name: loaded.name,
          definition: loaded.definition,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("This workflow could not be opened. Please try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId]);

  const begin = useCallback(
    async (nodeInputs: Record<string, Record<string, unknown>>) => {
      const started = await startRun({ definitionId, nodeInputs });
      if (!started) return;
      toast.success("Off it goes.");
      // The run id rides the URL so a refresh re-adopts and resumes.
      router.replace(`/workflows/bakeoff/dense/${definitionId}?run=${started}`);
    },
    [definitionId, router, startRun],
  );

  const collectsInput =
    workflow !== null && deriveRunForm(workflow.definition).length > 0;

  const runAgain = useCallback(() => {
    if (collectsInput) {
      router.replace(`/workflows/bakeoff/dense/${definitionId}`);
      return;
    }
    void begin({});
  }, [begin, collectsInput, definitionId, router]);

  const header = (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          <ChevronLeftTapButton
            href="/workflows/all"
            ariaLabel="All workflows"
          />
          <span className="ml-1 min-w-0 truncate text-sm font-medium text-foreground">
            {workflow?.name ?? "Workflow"}
          </span>
        </div>
      }
      right={
        runId ? (
          <TapTargetButton
            icon={<RotateCcw />}
            ariaLabel="Run it again"
            onClick={runAgain}
          />
        ) : null
      }
    />
  );

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-xl border border-border bg-card p-5">
          <h1 className="text-base font-semibold text-foreground">
            We couldn&apos;t open this
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={() => router.push("/workflows/all")}
            className="mt-4 inline-flex min-h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Back to your workflows
          </button>
        </div>
      </div>
    );
  } else if (!workflow) {
    body = <LoadingBody />;
  } else if (runId) {
    body = (
      <DenseConsole
        runId={runId}
        definition={workflow.definition}
        workflowName={workflow.name}
        onRunAgain={runAgain}
      />
    );
  } else {
    body = (
      <DenseIntake
        workflowName={workflow.name}
        definition={workflow.definition}
        starting={starting}
        onStart={(nodeInputs) => void begin(nodeInputs)}
      />
    );
  }

  return (
    <>
      {header}
      <div className="h-full overflow-hidden">
        <div className="h-full pt-[var(--shell-header-h)]">{body}</div>
      </div>
    </>
  );
}
