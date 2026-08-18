"use client";

/**
 * WorkflowRunPage — the `(core)` body behind BOTH run routes:
 *   /workflows/[id]          → set it up, run it, watch it (`?run=` on start)
 *   /workflows/runs/[runId]  → the permalink for a run that already exists
 *
 * One component because they are one experience seen from two doors: the only
 * difference is which end of the pair is known up front, and each resolves the
 * other (a run knows its definition; a definition mints a run). A mid-run
 * refresh therefore always lands back on the live run — never on a blank form.
 *
 * Route conformance: chrome lives in `RouteHeader` (shell header center), the
 * body wrapper is `h-full overflow-hidden` with ONE inner scroll area, and
 * content flows behind the glass header. No in-body title bar.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PenLine, Play, RotateCcw } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { useWorkflowRunControls } from "../../hooks/useWorkflowRunControls";
import {
  fetchRunDefinitionId,
  fetchWorkflowDefinition,
  getDefaultSurface,
} from "../../surface/service";
import type { RunSurfaceConfig } from "../../surface/config";
import { deriveRunForm } from "../../surface/run-form";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import { RunStartForm } from "../RunStartForm";
import { RunStage } from "./RunStage";

interface LoadedWorkflow {
  id: string;
  name: string;
  definition: WorkflowDefinitionLike;
  config: RunSurfaceConfig | null;
}

/** The calm, honest first paint — never a bare "Loading…" string. */
function LoadingBody() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 px-3 py-3 sm:px-5 sm:py-4">
      <div className="h-32 animate-pulse rounded-2xl bg-muted/60" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
      </div>
    </div>
  );
}

export function WorkflowRunPage({
  definitionId: definitionIdProp,
  runId: runIdProp,
}: {
  /** Known on /workflows/[id]; resolved from the run on the permalink. */
  definitionId?: string;
  /** Known on the permalink; carried in `?run=` on /workflows/[id]. */
  runId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = runIdProp ?? searchParams.get("run") ?? null;

  const [definitionId, setDefinitionId] = useState<string | null>(
    definitionIdProp ?? null,
  );
  const [workflow, setWorkflow] = useState<LoadedWorkflow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const { startRun, starting } = useWorkflowRunControls();

  // A run permalink knows its definition — that is how a `?run=` deep link and
  // a mid-run refresh restore the workflow they were started from.
  useEffect(() => {
    if (definitionId || !runId) return;
    let cancelled = false;
    void fetchRunDefinitionId(runId)
      .then((id) => {
        if (!cancelled) setDefinitionId(id);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(
            "This run could not be opened. It may have been removed.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId, runId]);

  useEffect(() => {
    if (!definitionId) return;
    let cancelled = false;
    void Promise.all([
      fetchWorkflowDefinition(definitionId),
      // A workflow with no authored surface is not a broken workflow — the
      // stage derives one from the definition, so this failing is never fatal.
      getDefaultSurface(definitionId, {
        audience: "consumer",
        profile: "full",
      }).catch(() => null),
    ])
      .then(([loaded, surface]) => {
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
          config: surface?.config ?? null,
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
      if (!definitionId) return;
      const started = await startRun({ definitionId, nodeInputs });
      if (!started) return;
      setShowForm(false);
      toast.success("Off it goes.");
      // The run id rides the URL so a refresh re-adopts and resumes.
      router.replace(`/workflows/${definitionId}?run=${started}`);
    },
    [definitionId, router, startRun],
  );

  const collectsInput =
    workflow !== null && deriveRunForm(workflow.definition).length > 0;

  const runAgain = useCallback(() => {
    if (!definitionId) return;
    if (collectsInput) {
      setShowForm(true);
      router.replace(`/workflows/${definitionId}`);
      return;
    }
    void begin({});
  }, [begin, collectsInput, definitionId, router]);

  const header = (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          <ChevronLeftTapButton href="/workflows/all" ariaLabel="All workflows" />
          <span className="ml-1 min-w-0 truncate text-sm font-medium text-foreground">
            {workflow?.name ?? "Workflow"}
          </span>
        </div>
      }
      right={
        <div className="flex items-center">
          {runId ? (
            <TapTargetButton
              icon={<RotateCcw />}
              ariaLabel="Run it again"
              onClick={runAgain}
            />
          ) : null}
          {definitionId ? (
            <TapTargetButton
              icon={<PenLine />}
              ariaLabel="Design this workflow"
              href={`/workflows/${definitionId}/design`}
            />
          ) : null}
        </div>
      }
    />
  );

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-5">
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
  } else if (runId && !showForm) {
    body = (
      <RunStage
        runId={runId}
        definition={workflow.definition}
        workflowName={workflow.name}
        config={workflow.config}
        onRetry={runAgain}
      />
    );
  } else {
    body = (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {workflow.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {collectsInput
            ? "Tell it what to work with, then press Run."
            : "Press Run and watch it work."}
        </p>
        <div className="mt-5">
          {collectsInput ? (
            <RunStartForm
              definition={workflow.definition}
              starting={starting}
              startLabel="Run it"
              onStart={(nodeInputs) => void begin(nodeInputs)}
              onCancel={() => {
                if (runId) setShowForm(false);
                else router.push("/workflows/all");
              }}
            />
          ) : (
            <button
              type="button"
              disabled={starting}
              onClick={() => void begin({})}
              className={cn(
                "inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity",
                starting ? "opacity-60" : "hover:opacity-90",
              )}
            >
              <Play className="h-4 w-4" />
              {starting ? "Starting…" : "Run it"}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {header}
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          {body}
        </div>
      </div>
    </>
  );
}
