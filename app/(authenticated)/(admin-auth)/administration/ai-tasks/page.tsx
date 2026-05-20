"use client";

import React from "react";
import { useAiTasks } from "@/features/ai-runs/hooks/useAiTasks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LoadingSpinner } from "@/components/ui/spinner";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { RefreshCw } from "lucide-react";
import { format } from "date-fns";

const PAGE_LOCATION = "AI Matrx Admin — AI Tasks (/administration/ai-tasks)";

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

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="flex-shrink-0 p-4 border-b bg-card">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI Tasks</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {total} total tasks
            </p>
          </div>
          <div className="flex items-center gap-2">
            {tasks.length > 0 && (
              <CopyButtons
                size="sm"
                label="All AI tasks"
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
                  description: "The AI tasks currently listed.",
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
            <div className="border rounded-lg overflow-hidden bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created At</TableHead>
                    <TableHead>Updated At</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-mono text-xs">
                        {task.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell className="font-medium">
                        {task.task_name || "-"}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="truncate text-sm text-muted-foreground">
                          {task.response_text
                            ? task.response_text.slice(0, 100) + "..."
                            : "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(task.status)}>
                          {task.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(task.created_at)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(task.updated_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <CopyButtons
                          size="icon"
                          label={`Task ${task.id.slice(0, 8)}`}
                          human={() =>
                            [
                              `ID: ${task.id}`,
                              `Name: ${task.task_name || "—"}`,
                              `Status: ${task.status}`,
                              `Created: ${formatDate(task.created_at)}`,
                              `Updated: ${formatDate(task.updated_at)}`,
                            ].join("\n")
                          }
                          agent={() => ({
                            kind: "ai-task",
                            location: PAGE_LOCATION,
                            description: "A single AI task row.",
                            data: task,
                            attributes: {
                              id: task.id,
                              status: task.status,
                            },
                          })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
