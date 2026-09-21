"use client";

import React, { useMemo } from "react";
import { useAiTasks } from "@/features/ai-runs/hooks/useAiTasks";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import type { AiTask } from "@/features/ai-runs/types/aiRunTypes";

const PAGE_LOCATION = "AI Matrx Admin — AI Tasks (/administration/ai/ai-tasks)";

export default function AiTasksPage() {
  const { tasks, isLoading, error, total, refresh } = useAiTasks({
    limit: 50,
    order_by: "created_at",
    order_direction: "desc",
  });

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "MMM dd, yyyy HH:mm");
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "pending":
        return "secondary";
      case "streaming":
        return "outline";
      case "failed":
        return "destructive";
      case "cancelled":
        return "outline";
      default:
        return "secondary";
    }
  };

  const columns = useMemo<MatrxColumnDef<AiTask>[]>(() => [
    {
      id: "id",
      accessorKey: "id",
      header: "ID",
      filter: false,
      width: 110,
      cell: (task) => <EntityRef token="task" id={task.id} name={task.id} showIcon={false}>{task.id.slice(0, 8)}...</EntityRef>,
    },
    { id: "name", accessorKey: "task_name", header: "Name", width: 220, cell: (task) => <span className="font-medium">{task.task_name || "-"}</span> },
    { id: "description", accessorKey: "response_text", header: "Description", width: 360, mobileHidden: true, cell: (task) => <span className="block truncate text-sm text-muted-foreground">{task.response_text ? `${task.response_text.slice(0, 100)}...` : "-"}</span> },
    { id: "status", accessorKey: "status", header: "Status", filter: "select", width: 130, cell: (task) => <Badge variant={getStatusBadgeVariant(task.status)}>{task.status}</Badge> },
    { id: "created", accessorKey: "created_at", header: "Created at", filter: "date", width: 180, mobileHidden: true, cell: (task) => formatDate(task.created_at) },
    { id: "updated", accessorKey: "updated_at", header: "Updated at", filter: "date", width: 180, mobileHidden: true, cell: (task) => formatDate(task.updated_at) },
  ], []);

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 p-4 border-b bg-card">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} total tasks
          </p>
          <div className="flex items-center gap-2">
            {tasks.length > 0 && (
              <CopyButtons
                size="sm"
                label="Loaded AI tasks"
                human={() =>
                  tasks
                    .map(
                      (t) =>
                        `${t.id} · ${t.task_name || "—"} · ${t.status} · ${formatDate(t.created_at)}`,
                    )
                    .join("\n")
                }
                agent={() => ({
                  kind: "ai-tasks",
                  location: PAGE_LOCATION,
                  description: "The currently loaded first source window of AI tasks.",
                  data: tasks,
                  attributes: { count: tasks.length, total },
                })}
              />
            )}
            <Button
              onClick={() => refresh()}
              variant="outline"
              size="sm"
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-safe">
        <div className="p-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error.message || "Failed to load AI tasks"}
              </AlertDescription>
            </Alert>
          )}

          {isLoading && tasks.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : tasks.length === 0 ? (
            <Alert className="mb-4">
              <AlertTitle>No tasks found</AlertTitle>
              <AlertDescription>
                There are no AI tasks to display.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Intentional override — Arman, 2026-09-21 shared-table rollout:
                  this page historically exposes only its first 50-row source window.
                  Keep that behavior rather than adding a loader that the 10-second
                  poll would discard; the table labels this as a loaded local window. */}
              <MatrxDataTable
                data={tasks}
                columns={columns}
                getRowId={(task) => task.id}
                hidePagination
                viewTabs={false}
                copy={false}
                detail={{ enabled: false }}
                window={{ enabled: false }}
                coverage={{ total, cap: 50, answeredBy: "client", noun: "task" }}
                toolbar={{ title: `Loaded tasks (${tasks.length} of ${total})`, search: false }}
                rowActions={(task) => <CopyButtons size="icon" label={`Task ${task.id.slice(0, 8)}`} human={() => [`ID: ${task.id}`, `Name: ${task.task_name || "—"}`, `Status: ${task.status}`, `Created: ${formatDate(task.created_at)}`, `Updated: ${formatDate(task.updated_at)}`].join("\n")} agent={() => ({ kind: "ai-task", location: PAGE_LOCATION, description: "A single AI task row.", data: task, attributes: { id: task.id, status: task.status } })} />}
              />
            </>
          )}

          {isLoading && tasks.length > 0 && (
            <div className="flex items-center justify-center py-4">
              <LoadingSpinner size="sm" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
