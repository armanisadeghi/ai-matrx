"use client";

/**
 * /administration/agents/factory — every Agent Factory build on the platform
 * (platform scope: the admin seat never filters to its own builds).
 *
 * One row per build (root `runtime.global_execution` of type
 * `agent_factory_build`), its facts read from the build's latest checkpoint.
 * A row opens the build's step-by-step view. Auto-refreshes while any build
 * on screen is still running.
 */

import { mandateDisplayName } from "@/features/mandates/mandate-words";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Plus } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Button } from "@ai-matrx/design-system/controls";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { readOf } from "@ai-matrx/design-system";
import { outcomeChip, verdictChip } from "@/components/mardown-display/blocks/agent-factory-kinds/AgentFactoryKindBlocks";
import { FACTORY_BUILD_LIST_CAP, listFactoryBuilds } from "../service";
import { STEP_LABEL, spineIsOver, type FactoryBuildRow, type FactoryStepName } from "../types";
import { StartBuildDialog } from "./StartBuildDialog";
import { SpineStatusChip, formatDuration } from "./factory-shared";

export const FACTORY_BASE_PATH = "/administration/agents/factory";

export function factoryBuildHref(id: string): string {
  return `${FACTORY_BASE_PATH}/${id}`;
}

export function FactoryBuildsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<FactoryBuildRow[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const result = await listFactoryBuilds();
      setRows(result.rows);
      setTotal(result.total ?? undefined);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the builds");
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const anyRunning = rows.some((r) => !spineIsOver(r.spineStatus));
  useEffect(() => {
    if (!anyRunning) return undefined;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [anyRunning, load]);

  const columns = useMemo((): MatrxColumnDef<FactoryBuildRow>[] => [
    {
      id: "mandate",
      accessorFn: (r) => r.mandateKey ?? "",
      header: "Job",
      filter: "select",
      width: 230,
      cell: (r) =>
        r.mandateKey ? (
          <span className="truncate font-mono type-secondary font-medium" title={r.name ?? undefined}>
            {mandateDisplayName(storedMandateKey(r.mandateKey))}
          </span>
        ) : (
          <span className="type-secondary text-muted-foreground">New agent</span>
        ),
    },
    {
      id: "status",
      accessorKey: "spineStatus",
      header: "Status",
      filter: "select",
      width: 110,
      cell: (r) => <SpineStatusChip status={r.spineStatus} />,
    },
    {
      id: "current_step",
      accessorFn: (r) => (r.currentStep ? (STEP_LABEL[r.currentStep as FactoryStepName] ?? r.currentStep) : ""),
      header: "Step",
      filter: "select",
      width: 110,
      cell: (r) => (
        <span className="type-secondary">
          {r.currentStep ? (STEP_LABEL[r.currentStep as FactoryStepName] ?? r.currentStep) : "—"}
        </span>
      ),
    },
    {
      id: "outcome",
      accessorFn: (r) => r.outcome ?? "",
      header: "Outcome",
      filter: "select",
      width: 175,
      cell: (r) => outcomeChip(r.outcome) ?? <span className="type-secondary text-muted-foreground">—</span>,
    },
    {
      id: "send_backs",
      accessorKey: "sendBacks",
      header: "Send-backs",
      filter: "number",
      width: 100,
      cell: (r) => <span className="type-secondary tabular-nums">{r.sendBacks}</span>,
    },
    {
      id: "verdict",
      accessorFn: (r) => r.verdict ?? "",
      header: "Judge",
      filter: "select",
      width: 100,
      cell: (r) => verdictChip(r.verdict) ?? <span className="type-secondary text-muted-foreground">—</span>,
    },
    {
      id: "agent",
      accessorFn: (r) => r.agentId ?? "",
      header: "Agent",
      width: 130,
      cell: (r) =>
        r.agentId ? (
          <EntityRef token="agent" id={r.agentId} name={r.agentId.slice(0, 8)} showIcon={false} />
        ) : (
          <span className="type-secondary text-muted-foreground">—</span>
        ),
    },
    {
      id: "started",
      accessorKey: "createdAt",
      header: "Started",
      filter: "date",
      width: 130,
      cell: (r) => (
        <span className="whitespace-nowrap type-secondary text-muted-foreground" title={new Date(r.createdAt).toLocaleString()}>
          {formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}
        </span>
      ),
    },
    {
      id: "duration",
      accessorFn: (r) =>
        r.endedAt ? new Date(r.endedAt).getTime() - new Date(r.startedAt ?? r.createdAt).getTime() : 0,
      header: "Took",
      filter: "number",
      width: 90,
      cell: (r) => (
        <span className="type-secondary tabular-nums text-muted-foreground">
          {r.endedAt ? formatDuration(r.startedAt ?? r.createdAt, r.endedAt) : "—"}
        </span>
      ),
    },
    {
      id: "build_id",
      accessorKey: "id",
      header: "Build",
      cellKind: "uuid",
      width: 110,
    },
  ], []);

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <MatrxDataTable
        urlState={{ id: "agent-factory-builds" }}
        data={rows}
        columns={columns}
        getRowId={(r) => r.id}
        getRowHref={(r) => factoryBuildHref(r.id)}
        onRowOpen={(r) => router.push(factoryBuildHref(r.id))}
        isLoading={loading}
        isFetching={fetching}
        pageSize={50}
        coverage={{ cap: FACTORY_BUILD_LIST_CAP, total, answeredBy: "client", noun: "build" }}
        read={readOf({ loading, error }, { what: "builds", onRetry: () => void load() })}
        emptyState={{ title: "No builds yet", description: "Start a build to see its steps here." }}
        toolbar={{
          title: "Agent Factory",
          search: true,
          searchPlaceholder: "Search builds…",
          refresh: { onRefresh: load },
          actions: (
            <Button variant="primary" icon={<Plus />} onClick={() => setStartOpen(true)}>
              Start a build
            </Button>
          ),
        }}
        copy={{
          label: "Agent Factory build",
          listLabel: "Agent Factory builds (this view)",
          location: FACTORY_BASE_PATH,
          rowKind: "agent-factory-build",
          listKind: "agent-factory-builds",
          listDescription: "The newest builds; search and filters apply to this loaded window.",
          humanRow: (r) =>
            [
              `Build ${r.id} — ${r.mandateKey ?? "new agent"}`,
              `Status: ${r.spineStatus}; step: ${r.currentStep ?? "—"}; outcome: ${r.outcome ?? "—"}`,
              `Send-backs: ${r.sendBacks}; judge: ${r.verdict ?? "—"}; agent: ${r.agentId ?? "—"}`,
              r.error ? `Error: ${r.error}` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          rowAttributes: (r) => ({ id: r.id, status: r.spineStatus }),
        }}
      />
      <StartBuildDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        onStarted={(id) => router.push(factoryBuildHref(id))}
      />
    </div>
  );
}
