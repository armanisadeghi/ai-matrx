// features/scheduling/components/detail/RunHistoryCard.tsx

"use client";

import { History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import { useTaskRuns } from "../../hooks/useTaskRuns";
import { useRunStream } from "../../hooks/useRunStream";
import { buildRunListPayload, runCsvRows, runListHuman } from "../../lib/copy";
import type { AgendaTask } from "../../types";
import { RunRow } from "./RunRow";

interface Props {
  taskId: string;
  /** The open schedule — rides in every run payload's envelope. */
  task?: AgendaTask | null;
}

export function RunHistoryCard({ taskId, task = null }: Props) {
  const { runs, status, error } = useTaskRuns(taskId);
  useRunStream(taskId);

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <History className="h-3 w-3" /> Run history
            {runs.length > 0 ? (
              <span className="ml-1 tabular-nums font-medium normal-case tracking-normal">
                {runs.length}
              </span>
            ) : null}
          </div>
          {runs.length > 0 ? (
            <div className="flex items-center gap-1">
              <CopyButtons
                size="icon"
                label="Run history"
                human={() => runListHuman(runs, task ?? undefined)}
                json={() => runs}
                agent={() =>
                  buildRunListPayload({
                    task,
                    runs,
                    runsStatus: status,
                    runsError: error,
                  })
                }
              />
              <ExportMenu
                label={task ? `${task.title} runs` : "Schedule runs"}
                items={[
                  jsonExportItem(() => runs),
                  csvExportItem(() => runCsvRows(runs), "CSV (all runs)"),
                ]}
                sheetRows={() => runCsvRows(runs)}
              />
            </div>
          ) : null}
        </div>

        {status === "loading" || status === "idle" ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : status === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>{error ?? "Couldn't load runs"}</AlertDescription>
          </Alert>
        ) : runs.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4">
            No runs yet — the next scheduled fire will appear here.
          </div>
        ) : (
          <div className="space-y-1.5">
            {runs.map((run) => (
              <RunRow key={run.id} run={run} task={task} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
