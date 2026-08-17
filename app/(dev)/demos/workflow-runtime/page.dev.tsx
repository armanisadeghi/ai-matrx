"use client";

/**
 * Workflow Runtime — Phase 1 exit-test page, extended for Phase 2.
 *
 * Pick any workflow, run it, and watch it live — on the zero-config board
 * ("Board"), on the authored Run Surface ("Surface"), or edit the surface in
 * the simple builder ("Builder"). The run id rides the URL (?run=), so a
 * mid-run refresh re-adopts the same run and resumes exactly where it was
 * (replay + live follow). With ?run= and an existing surface, the Surface
 * view is the default.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { toast } from "@/lib/toast";
import { WorkflowRunBoard } from "@/features/workflow-runtime/components/WorkflowRunBoard";
import { RunStartForm } from "@/features/workflow-runtime/components/RunStartForm";
import { deriveRunForm } from "@/features/workflow-runtime/surface/run-form";
import { RunSurfaceView } from "@/features/workflow-runtime/components/RunSurfaceView";
import { SurfaceBuilder } from "@/features/workflow-runtime/components/SurfaceBuilder";
import { useWorkflowRunControls } from "@/features/workflow-runtime/hooks/useWorkflowRunControls";
import {
  fetchWorkflowDefinition,
  getDefaultSurface,
  type RuntimeSurfaceRow,
} from "@/features/workflow-runtime/surface/service";
import type { WorkflowDefinitionLike } from "@/features/workflow-runtime/trigger-points";

interface WorkflowListItem {
  id: string;
  name: string;
  description?: string | null;
  step_count?: number | null;
}

function extractWorkflowList(data: unknown): WorkflowListItem[] {
  const rows: unknown = Array.isArray(data)
    ? data
    : typeof data === "object" && data !== null && "items" in data
      ? (data as { items: unknown }).items
      : typeof data === "object" && data !== null && "workflows" in data
        ? (data as { workflows: unknown }).workflows
        : [];
  if (!Array.isArray(rows)) return [];
  const list: WorkflowListItem[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const record = row as Record<string, unknown>;
    if (typeof record.id !== "string") continue;
    list.push({
      id: record.id,
      name: typeof record.name === "string" ? record.name : record.id,
      description:
        typeof record.description === "string" ? record.description : null,
      step_count:
        typeof record.step_count === "number" ? record.step_count : null,
    });
  }
  return list;
}

type ViewMode = "board" | "surface" | "builder";

function WorkflowRuntimeDemo() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("run");

  const [workflows, setWorkflows] = useState<WorkflowListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listRequestNonce, setListRequestNonce] = useState(0);
  const [selected, setSelected] = useState<string>("");
  const [definition, setDefinition] = useState<WorkflowDefinitionLike | null>(
    null,
  );
  const [surface, setSurface] = useState<RuntimeSurfaceRow | null>(null);
  const [surfaceLoaded, setSurfaceLoaded] = useState(false);
  const [view, setView] = useState<ViewMode>("board");
  const [viewChosen, setViewChosen] = useState(false);
  const { startRun, startStepRun, starting } = useWorkflowRunControls();

  useEffect(() => {
    let cancelled = false;
    void dispatch(
      callApi({ path: "/workflows", method: "GET" } as never),
    ).then(
      (result: unknown) => {
        if (cancelled) return;
        const data =
          typeof result === "object" && result !== null && "data" in result
            ? (result as { data: unknown }).data
            : null;
        const error =
          typeof result === "object" && result !== null && "error" in result
            ? (result as { error: unknown }).error
            : null;
        const list = extractWorkflowList(data);
        // A failed list must never look like an empty catalog — say so.
        setListError(
          list.length === 0 && error
            ? "Your workflows could not be loaded. Please try again."
            : null,
        );
        setWorkflows(list);
      },
      (err: unknown) => {
        if (cancelled) return;
        setWorkflows([]);
        setListError(
          err instanceof Error
            ? err.message
            : "Your workflows could not be loaded. Please try again.",
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dispatch, listRequestNonce]);

  const retryWorkflowList = () => {
    setWorkflows(null);
    setListError(null);
    setListRequestNonce((nonce) => nonce + 1);
  };

  // The synchronous resets live in the select handler (an event handler may
  // set state; a sync set inside an effect cascades renders — compiler lint).
  const handleSelect = (value: string) => {
    setSelected(value);
    setDefinition(null);
    setSurface(null);
    setSurfaceLoaded(false);
    setPendingStart(null);
  };

  // Load the definition graph + default surface for the selected workflow.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void Promise.all([
      fetchWorkflowDefinition(selected),
      getDefaultSurface(selected),
    ])
      .then(([def, surf]) => {
        if (cancelled) return;
        setDefinition(def?.definition ?? null);
        setSurface(surf);
        setSurfaceLoaded(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSurfaceLoaded(true);
        toast.error(
          err instanceof Error
            ? err.message
            : "Loading the workflow definition failed.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Running with a surface available? Default to the Surface view — DERIVED,
  // not set in an effect: the user's explicit choice wins once made.
  const effectiveView: ViewMode =
    !viewChosen && surfaceLoaded && runId && surface ? "surface" : view;

  const [pendingStart, setPendingStart] = useState<{
    stepMode: boolean;
  } | null>(null);

  const launch = async (
    stepMode: boolean,
    nodeInputs?: Record<string, Record<string, unknown>>,
  ) => {
    if (!selected) return;
    setPendingStart(null);
    const args = {
      definitionId: selected,
      ...(nodeInputs && Object.keys(nodeInputs).length > 0
        ? { nodeInputs }
        : {}),
    };
    const newRunId = stepMode
      ? await startStepRun(args)
      : await startRun(args);
    if (!newRunId) return;
    toast.success(
      stepMode
        ? "Run prepared — use the action buttons to run each step."
        : "Workflow started.",
    );
    router.replace(`/demos/workflow-runtime?run=${newRunId}`);
  };

  const begin = async (stepMode: boolean) => {
    if (!selected) return;
    // No definition means we cannot know whether this workflow collects
    // inputs — starting anyway would silently skip the run form and launch
    // a guaranteed-to-fail run. Refuse loudly instead.
    if (!definition) {
      toast.error(
        "This workflow's details could not be loaded, so it can't be started from here.",
      );
      return;
    }
    // Workflows that collect inputs (io.user_input) get the generated form
    // first; everything else starts immediately.
    if (deriveRunForm(definition).length > 0) {
      setPendingStart({ stepMode });
      return;
    }
    await launch(stepMode);
  };

  const pickView = (mode: ViewMode) => {
    setView(mode);
    setViewChosen(true);
  };

  const viewButton = (mode: ViewMode, label: string) => (
    <button
      type="button"
      onClick={() => pickView(mode)}
      className={
        effectiveView === mode
          ? "rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground"
          : "rounded-md border border-border px-2.5 py-1 text-xs text-foreground"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="matrx-touch-targets mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">Workflow Runtime — live run board</h1>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        {workflows === null ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading workflows…
          </span>
        ) : listError ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-destructive">{listError}</span>
            <button
              type="button"
              onClick={retryWorkflowList}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
            >
              Try again
            </button>
          </div>
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => handleSelect(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-base"
            >
              <option value="">Choose a workflow…</option>
              {workflows.map((wf) => (
                <option key={wf.id} value={wf.id}>
                  {wf.name}
                  {wf.step_count ? ` (${wf.step_count} steps)` : ""}
                </option>
              ))}
            </select>
            {/* Disabled while the definition/surface fetch is in flight — a
                click in that window would misread "still loading" as "failed
                to load" (Bugbot, PR #157). */}
            <button
              type="button"
              disabled={!selected || starting || !surfaceLoaded}
              onClick={() => void begin(false)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {starting ? "Starting…" : "Run"}
            </button>
            <button
              type="button"
              disabled={!selected || starting || !surfaceLoaded}
              onClick={() => void begin(true)}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-50"
            >
              Run step-by-step
            </button>
          </>
        )}
      </div>

      {pendingStart && definition ? (
        <RunStartForm
          definition={definition}
          starting={starting}
          startLabel={pendingStart.stepMode ? "Run step-by-step" : "Run"}
          onStart={(nodeInputs) => void launch(pendingStart.stepMode, nodeInputs)}
          onCancel={() => setPendingStart(null)}
        />
      ) : null}

      {selected ? (
        <div className="flex items-center gap-1.5">
          {viewButton("board", "Board")}
          {viewButton("surface", "Surface")}
          {viewButton("builder", "Builder")}
          {!surfaceLoaded ? (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          ) : null}
        </div>
      ) : null}

      {selected && surfaceLoaded && effectiveView === "builder" ? (
        definition ? (
          <SurfaceBuilder
            definitionId={selected}
            definition={definition}
            surface={surface}
            onSaved={setSurface}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            The workflow definition could not be loaded, so the builder has
            nothing to edit.
          </p>
        )
      ) : null}

      {selected && surfaceLoaded && effectiveView === "surface" ? (
        surface && definition ? (
          runId ? (
            <RunSurfaceView
              runId={runId}
              definition={definition}
              config={surface.config}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Start a run to watch it on this surface.
            </p>
          )
        ) : (
          definition ? (
            // No surface yet: the builder's null-surface state IS the hint +
            // one-click create card — render it bare, no second wrapper.
            <SurfaceBuilder
              definitionId={selected}
              definition={definition}
              surface={null}
              onSaved={setSurface}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              This workflow has no run surface yet, and its definition could
              not be loaded to generate one.
            </p>
          )
        )
      ) : null}

      {effectiveView === "board" || !selected ? (
        runId ? (
          <WorkflowRunBoard runId={runId} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Start a workflow (or open this page with ?run=&lt;run_id&gt;) to
            watch it live. Refreshing mid-run resumes from the durable log.
          </p>
        )
      ) : null}
    </div>
  );
}

export default function WorkflowRuntimeDemoPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <WorkflowRuntimeDemo />
    </Suspense>
  );
}
