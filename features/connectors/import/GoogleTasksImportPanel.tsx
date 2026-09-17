"use client";

/**
 * features/connectors/import/GoogleTasksImportPanel.tsx
 *
 * "Import from Google Tasks" — the body the window wraps. Google-native PLAN
 * §4.7: task lists and tasks with checkboxes, already-imported badges, and an
 * honest count line ("12 tasks in My Tasks, 4 already here, import the other
 * 8"). Import creates real AI Matrx tasks; importing again updates title, due
 * date and notes only where Google changed them and nobody changed them here.
 *
 * The count line is worded from the payload's own NUMBERS (`total`,
 * `already_imported`) through `importTaskCountLine`, the one place that wording
 * lives — not from the server's prose. It was the server's sentence, rendered
 * verbatim, until that sentence could say "import the other -2" (R2 break K): a
 * screen that cannot check the arithmetic it prints cannot be accountable for it,
 * and the numbers it clamps are right here. The server keeps `count_line` for its
 * own callers; this panel does not read it.
 * Read-only toward Google.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  CheckSquare,
  CircleAlert,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { getUserMessage } from "@/lib/api/errors";
import { importGoogleTasks, listGoogleTasks } from "./service";
import {
  importDateText,
  importFieldList,
  importProvenanceSentence,
  importTaskCountLine,
} from "./field-labels";
import type {
  TaskImportResultPending,
  TaskListViewPending,
  TaskListingResultPending,
} from "./types";

/** What an outcome action means, in words a person reads (Law 10). */
const TASK_ACTION_COPY: Record<string, string> = {
  created: "created here",
  updated: "updated from Google",
  unchanged: "nothing to change",
  kept_local: "yours kept",
  unrecorded: "kept — source unknown",
  would_create: "would be created",
  would_update: "would be updated",
};

export interface GoogleTasksImportPanelProps {
  organizationId: string | null;
  /** The AI Matrx project imported tasks belong to, when the caller has one. */
  projectId?: string | null;
  onImported?: (taskIds: string[]) => void;
}

export function GoogleTasksImportPanel({
  organizationId,
  projectId = null,
  onImported,
}: GoogleTasksImportPanelProps) {
  const [listing, setListing] = useState<TaskListingResultPending | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<TaskImportResultPending | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!organizationId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await listGoogleTasks({
        organizationId,
        signal: controller.signal,
      });
      setListing(result);
      setActiveListId((current) => current ?? result.task_lists[0]?.task_list_id ?? null);
      result.warnings.forEach((warning) => toast.warning(warning));
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(getUserMessage(cause));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  const active: TaskListViewPending | null = useMemo(() => {
    if (!listing) return null;
    return (
      listing.task_lists.find((view) => view.task_list_id === activeListId) ??
      listing.task_lists[0] ??
      null
    );
  }, [listing, activeListId]);

  const chosen = active ? (selected[active.task_list_id] ?? []) : [];
  const chosenSet = useMemo(() => new Set(chosen), [chosen]);

  const toggle = (taskId: string) => {
    if (!active) return;
    setSelected((current) => {
      const forList = current[active.task_list_id] ?? [];
      return {
        ...current,
        [active.task_list_id]: forList.includes(taskId)
          ? forList.filter((value) => value !== taskId)
          : [...forList, taskId],
      };
    });
  };

  const selectNotHere = () => {
    if (!active) return;
    setSelected((current) => ({
      ...current,
      [active.task_list_id]: active.tasks
        .filter((task) => !task.already_imported)
        .map((task) => task.task_id),
    }));
  };

  const selectChanged = () => {
    if (!active) return;
    setSelected((current) => ({
      ...current,
      [active.task_list_id]: active.tasks
        .filter((task) => task.already_imported && task.changes.length > 0)
        .map((task) => task.task_id),
    }));
  };

  const run = async () => {
    if (!organizationId || !active || chosen.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importGoogleTasks({
        organizationId,
        taskListId: active.task_list_id,
        taskIds: chosen,
        projectId,
        dryRun: false,
      });
      setDone(result);
      result.warnings.forEach((warning) => toast.warning(warning));
      onImported?.(
        result.results
          .map((outcome) => outcome.matrx_task_id)
          .filter((value): value is string => Boolean(value)),
      );
      toast.success(
        `${result.created} created, ${result.updated} updated. Google Tasks was not changed.`,
      );
      setSelected((current) => ({ ...current, [active.task_list_id]: [] }));
      void load();
    } catch (cause) {
      setError(getUserMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!organizationId) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Choose the organization these tasks belong to first — the import writes
          them into it, and nothing here picks one for you.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          {done.created} created, {done.updated} updated, {done.unchanged} left as
          they are. Google Tasks was not changed.
        </div>
        <ul className="flex flex-col gap-2">
          {done.results.map((outcome) => (
            <li
              key={outcome.task_id}
              className="rounded-md border border-border bg-card p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                {outcome.matrx_task_id ? (
                  <Link
                    href={`/tasks/${outcome.matrx_task_id}`}
                    target="_blank"
                    className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                  >
                    {outcome.title}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-foreground">
                    {outcome.title}
                  </span>
                )}
                <Badge variant="secondary" className="text-[11px]">
                  {TASK_ACTION_COPY[outcome.action] ??
                    outcome.action.replace(/_/g, " ")}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{outcome.note}</p>
              {/* The SERVER's note is the sentence; these two name the FIELDS in
                  words, never as column keys (D9). */}
              {outcome.changed_fields.length > 0 ? (
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Updated {importFieldList(outcome.changed_fields).text}.
                </p>
              ) : null}
              {outcome.kept_local_fields.length > 0 ? (
                <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                  Kept your {importFieldList(outcome.kept_local_fields).text}.
                </p>
              ) : null}
              {outcome.unrecorded_fields && outcome.unrecorded_fields.length > 0 ? (
                <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                  {importFieldList(outcome.unrecorded_fields).text}{" "}
                  {importFieldList(outcome.unrecorded_fields).verb} left as{" "}
                  {outcome.unrecorded_fields.length === 1 ? "it is" : "they are"} —
                  there is no record of what the import last wrote.
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={() => setDone(null)}
        >
          Back to the list
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {listing?.google_account ?? "Your Google account"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>
        {listing && listing.task_lists.length > 1 ? (
          <div className="flex flex-wrap gap-1">
            {listing.task_lists.map((view) => (
              <Button
                key={view.task_list_id}
                size="sm"
                variant={
                  view.task_list_id === active?.task_list_id ? "secondary" : "ghost"
                }
                className="h-7 px-2 text-xs"
                onClick={() => setActiveListId(view.task_list_id)}
              >
                {view.title}
                <span className="ml-1 text-muted-foreground">{view.total}</span>
              </Button>
            ))}
          </div>
        ) : null}
        {loading ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Reading Google Tasks…
          </span>
        ) : active ? (
          <p className="text-xs text-foreground">
            {/* 🚨 THE PANEL WORDS ITS OWN COUNTS. It used to render the server's
                `count_line` verbatim, and that sentence could say "import the
                other -2" when the already-here count exceeded the tasks one read
                covers (R2 break K) — prose a screen cannot check is prose it
                cannot be accountable for. `importTaskCountLine` clamps the
                remainder and agrees with the noun, from the numbers this payload
                carries. */}
            {importTaskCountLine({
              title: active.title,
              total: active.total,
              alreadyHere: active.already_imported,
            })}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="flex items-start gap-2 border-b border-border bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {active?.has_more ? (
        <p className="border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          This list holds more tasks than one read covers; the counts above are
          true of the ones shown.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!loading && (!active || active.tasks.length === 0) ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {listing && listing.task_lists.length === 0
              ? "This Google account has no task lists we can read."
              : "This list has no tasks."}
          </p>
        ) : null}
        <ul className="flex flex-col divide-y divide-border">
          {(active?.tasks ?? []).map((task) => (
            <li key={task.task_id} className="flex items-start gap-3 px-4 py-2">
              <Checkbox
                className="mt-0.5"
                checked={chosenSet.has(task.task_id)}
                onCheckedChange={() => toggle(task.task_id)}
                aria-label={`Select ${task.title}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm text-foreground">
                    {task.title}
                  </span>
                  {task.already_imported ? (
                    <Badge variant="secondary" className="text-[11px]">
                      {/* The badge NAMES the import date when the server sent
                          one, and admits it when it did not (B3). */}
                      {importDateText(task.imported_at)
                        ? `Imported ${importDateText(task.imported_at)}`
                        : "Already here (import date not recorded)"}
                    </Badge>
                  ) : null}
                  {task.changes.length > 0 ? (
                    <Badge variant="outline" className="text-[11px]">
                      {/* Field KEYS become words through the one label map
                          shared with the Contacts panel — a person never reads
                          "due_date" (VERIFY-B1-B2 D9). */}
                      Google changed {importFieldList(task.changes).text}
                    </Badge>
                  ) : null}
                </div>
                {task.due_at || task.notes ? (
                  <p className="truncate text-xs text-muted-foreground">
                    {/* A date is never an ISO string at a person — the same
                        helper the badges use (R2 D9). */}
                    {[
                      importDateText(task.due_at)
                        ? `Due ${importDateText(task.due_at)}`
                        : null,
                      task.notes,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {task.kept_local.length > 0 ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {importFieldList(task.kept_local).text}{" "}
                    {importFieldList(task.kept_local).verb} edited here since the
                    import — a re-import leaves {task.kept_local.length === 1 ? "it" : "them"} alone.
                  </p>
                ) : null}
                {/* Differs with NO record of what the import wrote. It is NOT a
                    local edit and is never reported as one — the honest version
                    of the sentence the panel used to print about every field. */}
                {task.unrecorded && task.unrecorded.length > 0 ? (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    {importFieldList(task.unrecorded).text}{" "}
                    {importFieldList(task.unrecorded).verb} different here, and
                    there is no record of what the import last wrote, so a
                    re-import leaves {task.unrecorded.length === 1 ? "it" : "them"} alone.
                  </p>
                ) : null}
                {/* Where this task came from, when the server recorded it.
                    🚨 The task's `source_url` is the Google Tasks API RESOURCE,
                    a durable identity — Google publishes no web deep link to a
                    single task, so nothing here is rendered as "open in Google
                    Tasks". The link on this row is the AI MATRX task. */}
                {task.already_imported ? (
                  <p className="text-[11px] text-muted-foreground">
                    Linked to Google Tasks.{" "}
                    {importProvenanceSentence({
                      importedAt: task.imported_at,
                      source: "Google Tasks",
                    })
                      ? `This task is ${importProvenanceSentence({
                          importedAt: task.imported_at,
                          source: "Google Tasks",
                        })}.`
                      : "The import date was never recorded, so nothing here can say when."}
                  </p>
                ) : null}
              </div>
              {task.already_imported && task.matrx_task_id ? (
                <Link
                  href={`/tasks/${task.matrx_task_id}`}
                  target="_blank"
                  className="shrink-0 text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  Open
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={selectNotHere}
          disabled={!active || active.importable === 0}
        >
          Select the {active?.importable ?? 0} not here yet
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={selectChanged}
          disabled={
            !active || active.tasks.every((task) => task.changes.length === 0)
          }
        >
          Select the changed ones
        </Button>
        <Button
          size="sm"
          className="ml-auto"
          onClick={run}
          disabled={busy || chosen.length === 0}
        >
          {busy ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckSquare className="mr-1 h-3.5 w-3.5" />
          )}
          Import {chosen.length}
        </Button>
      </div>
    </div>
  );
}
