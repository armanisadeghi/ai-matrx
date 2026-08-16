"use client";

/**
 * Workflow Runtime — Phase 1 exit-test page.
 *
 * Pick any workflow, run it, and watch every node live on the zero-config
 * board. The run id rides the URL (?run=), so a mid-run refresh re-adopts the
 * same run and resumes exactly where it was (replay + live follow) — that is
 * the acceptance bar for the plumbing (PLAN.md Phase 1).
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import { toast } from "@/lib/toast";
import { WorkflowRunBoard } from "@/features/workflow-runtime/components/WorkflowRunBoard";
import { useWorkflowRunControls } from "@/features/workflow-runtime/hooks/useWorkflowRunControls";

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

function WorkflowRuntimeDemo() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("run");

  const [workflows, setWorkflows] = useState<WorkflowListItem[] | null>(null);
  const [selected, setSelected] = useState<string>("");
  const { startRun, starting } = useWorkflowRunControls();

  useEffect(() => {
    let cancelled = false;
    void dispatch(
      callApi({ path: "/workflows", method: "GET" } as never),
    ).then((result: unknown) => {
      if (cancelled) return;
      const data =
        typeof result === "object" && result !== null && "data" in result
          ? (result as { data: unknown }).data
          : null;
      setWorkflows(extractWorkflowList(data));
    });
    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  const begin = async () => {
    if (!selected) return;
    const newRunId = await startRun({ definitionId: selected });
    if (!newRunId) return;
    toast.success("Workflow started.");
    router.replace(`/demos/workflow-runtime?run=${newRunId}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">Workflow Runtime — live run board</h1>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        {workflows === null ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading workflows…
          </span>
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
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
            <button
              type="button"
              disabled={!selected || starting}
              onClick={() => void begin()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {starting ? "Starting…" : "Run"}
            </button>
          </>
        )}
      </div>

      {runId ? (
        <WorkflowRunBoard runId={runId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Start a workflow (or open this page with ?run=&lt;run_id&gt;) to watch
          it live. Refreshing mid-run resumes from the durable log.
        </p>
      )}
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
