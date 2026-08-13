"use client";

import { AlertTriangle, CheckCircle2, Circle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { isJsonObject } from "@/types/json";

export type LiveRunProgressStatus =
  "waiting" | "running" | "completed" | "failed";

export interface LiveRunProgressItem {
  id: string;
  label: string;
  status: LiveRunProgressStatus;
  detail?: string;
  preview?: string;
}

export interface LiveRunProgressState {
  title: string;
  description?: string;
  items: LiveRunProgressItem[];
}

const STATUSES = new Set<LiveRunProgressStatus>([
  "waiting",
  "running",
  "completed",
  "failed",
]);

/** Validate overlay data at the lazy-render boundary. */
export function parseLiveRunProgressState(
  value: unknown,
): LiveRunProgressState | null {
  if (!isJsonObject(value) || typeof value.title !== "string") return null;
  if (!Array.isArray(value.items)) return null;

  const items: LiveRunProgressItem[] = [];
  for (const candidate of value.items) {
    if (
      !isJsonObject(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.status !== "string" ||
      !STATUSES.has(candidate.status as LiveRunProgressStatus)
    ) {
      return null;
    }
    items.push({
      id: candidate.id,
      label: candidate.label,
      status: candidate.status as LiveRunProgressStatus,
      ...(typeof candidate.detail === "string"
        ? { detail: candidate.detail }
        : {}),
      ...(typeof candidate.preview === "string"
        ? { preview: candidate.preview }
        : {}),
    });
  }

  return {
    title: value.title,
    ...(typeof value.description === "string"
      ? { description: value.description }
      : {}),
    items,
  };
}

function StatusIcon({ status }: { status: LiveRunProgressStatus }) {
  if (status === "running") {
    return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
  }
  if (status === "completed") {
    return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  }
  if (status === "failed") {
    return <AlertTriangle className="h-5 w-5 text-destructive" />;
  }
  return <Circle className="h-5 w-5 text-muted-foreground/35" />;
}

/** Stable rows for non-token work; updates replace state instead of appending narration. */
export function LiveRunProgress({
  progress,
}: {
  progress: LiveRunProgressState;
}) {
  const completed = progress.items.filter(
    (item) => item.status === "completed",
  ).length;
  const failed = progress.items.filter(
    (item) => item.status === "failed",
  ).length;
  const finished = completed + failed;

  return (
    <div className="h-full overflow-y-auto p-5 sm:p-6">
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight">
              {progress.title}
            </h2>
            <span className="shrink-0 text-sm font-medium tabular-nums text-muted-foreground">
              {finished} of {progress.items.length}
            </span>
          </div>
          {progress.description ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {progress.description}
            </p>
          ) : null}
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{
                width: `${progress.items.length ? (finished / progress.items.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card">
          {progress.items.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                "flex gap-3 p-4 transition-colors duration-300",
                index > 0 && "border-t",
                item.status === "running" && "bg-primary/[0.04]",
                item.status === "failed" && "bg-destructive/[0.04]",
              )}
            >
              <div className="mt-0.5 shrink-0">
                <StatusIcon status={item.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{item.label}</p>
                  <span
                    className={cn(
                      "text-xs font-medium capitalize",
                      item.status === "running" && "text-primary",
                      item.status === "completed" && "text-emerald-600",
                      item.status === "failed" && "text-destructive",
                      item.status === "waiting" && "text-muted-foreground",
                    )}
                  >
                    {item.status}
                  </span>
                </div>
                {item.detail ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {item.detail}
                  </p>
                ) : null}
                {item.preview ? (
                  <p className="mt-2 line-clamp-3 rounded-lg bg-muted/60 px-3 py-2 text-sm leading-relaxed text-foreground/80">
                    {item.preview}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
