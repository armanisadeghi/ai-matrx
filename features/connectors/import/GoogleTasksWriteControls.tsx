"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { BackendApiError, getUserMessage } from "@/lib/api/errors";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import type { TaskCandidatePending } from "./types";
import {
  applyGoogleTaskStatus,
  createGoogleTask,
  previewGoogleTaskStatus,
  type GoogleTaskCreateRequest,
  type GoogleTaskCreateResult,
  type GoogleTaskStatusApplyRequest,
  type GoogleTaskStatusPreview,
  type GoogleTaskStatusResult,
  type GoogleTaskStatusWriteRequest,
} from "./service";
import {
  clearGoogleTaskCreateRecovery,
  normalizeGoogleTaskCreateRequest,
  readGoogleTaskCreateRecovery,
  sameGoogleTaskCreateScope,
  writeGoogleTaskCreateRecovery,
  type GoogleTaskCreateRecoveryRecord,
  type StorageDoor,
} from "./googleTaskCreateRecovery";

export interface GoogleTasksWriteTransport {
  previewStatus(request: GoogleTaskStatusWriteRequest): Promise<GoogleTaskStatusPreview>;
  applyStatus(request: GoogleTaskStatusApplyRequest): Promise<GoogleTaskStatusResult>;
  create(request: GoogleTaskCreateRequest): Promise<GoogleTaskCreateResult>;
}

const defaultTransport: GoogleTasksWriteTransport = {
  previewStatus: previewGoogleTaskStatus,
  applyStatus: applyGoogleTaskStatus,
  create: createGoogleTask,
};

function stableKey(): string {
  return crypto.randomUUID().replaceAll("-", "_");
}

function statusLabel(status: "completed" | "needsAction"): string {
  return status === "completed" ? "Completed" : "Open";
}

function sessionStorageDoor(): StorageDoor {
  try {
    return window.sessionStorage;
  } catch {
    return {
      getItem() { throw new Error("session storage unavailable"); },
      setItem() { throw new Error("session storage unavailable"); },
      removeItem() { throw new Error("session storage unavailable"); },
    };
  }
}

export function GoogleTasksWriteControls({
  actorId,
  organizationId,
  connectionId,
  accountLabel,
  taskListId,
  taskListTitle,
  selectedTask,
  onRefresh,
  transport = defaultTransport,
  storage,
}: {
  actorId: string;
  organizationId: string;
  connectionId: string;
  accountLabel: string;
  taskListId: string;
  taskListTitle: string;
  selectedTask: TaskCandidatePending | null;
  onRefresh(): void;
  transport?: GoogleTasksWriteTransport;
  storage?: StorageDoor;
}) {
  const storageDoor = storage ?? sessionStorageDoor();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [initialRecovery] = useState(() => readGoogleTaskCreateRecovery(storageDoor, actorId));
  const [createRecovery, setCreateRecovery] = useState<GoogleTaskCreateRecoveryRecord | null>(initialRecovery.record);
  const [createWarning, setCreateWarning] = useState<string | null>(initialRecovery.warning);
  const [createResult, setCreateResult] = useState<GoogleTaskCreateResult | null>(null);
  const [statusPreview, setStatusPreview] = useState<GoogleTaskStatusPreview | null>(null);
  const [statusResult, setStatusResult] = useState<GoogleTaskStatusResult | null>(null);
  const [busy, setBusy] = useState<"create" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const epoch = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => () => {
    epoch.current += 1;
    busyRef.current = false;
  }, []);

  const scope = { actorId, organizationId, connectionId, taskListId };
  const recoveryMatches = createRecovery
    ? sameGoogleTaskCreateScope(createRecovery, scope)
    : false;

  const reviewCreate = () => {
    const request = normalizeGoogleTaskCreateRequest({
      organizationId,
      connectionId,
      taskListId,
      callerStableKey: stableKey(),
      title,
      notes,
      dueDate,
    });
    const record: GoogleTaskCreateRecoveryRecord = {
      version: 1,
      actor_id: actorId,
      request,
      phase: "reviewed_unattempted",
    };
    if (!writeGoogleTaskCreateRecovery(storageDoor, record)) {
      setError("This tab could not save task recovery. Nothing was sent.");
      return;
    }
    setCreateRecovery(record);
    setCreateWarning(null);
    setCreateResult(null);
    setError(null);
  };

  const submitCreate = async () => {
    if (!createRecovery || !recoveryMatches || busyRef.current) return;
    if (createRecovery.phase !== "reviewed_unattempted" && createRecovery.phase !== "known_unsent") return;
    const attempting = { ...createRecovery, phase: "attempting" as const };
    if (!writeGoogleTaskCreateRecovery(storageDoor, attempting)) {
      setError("This tab could not save the create attempt. Nothing was sent.");
      return;
    }
    setCreateRecovery(attempting);
    const callEpoch = ++epoch.current;
    busyRef.current = true;
    setBusy("create");
    setError(null);
    try {
      const result = await transport.create(attempting.request);
      if (callEpoch !== epoch.current) return;
      if (!clearGoogleTaskCreateRecovery(storageDoor)) {
        setCreateRecovery({ ...attempting, phase: "uncertain" });
        setError("Google confirmed the task, but this tab could not clear recovery. Do not create it again.");
        return;
      }
      setCreateRecovery(null);
      setCreateResult(result);
      setTitle("");
      setNotes("");
      setDueDate("");
    } catch (cause) {
      if (callEpoch !== epoch.current) return;
      const phase = cause instanceof BackendApiError &&
        cause.code === "google_task_create_storage_unavailable" && cause.status === 503
        ? "known_unsent" as const
        : "uncertain" as const;
      const failed = { ...attempting, phase };
      if (!writeGoogleTaskCreateRecovery(storageDoor, failed)) {
        setCreateWarning("The create result could not be saved in this tab. Do not try another create.");
      }
      setCreateRecovery(failed);
      setError(getUserMessage(cause));
    } finally {
      if (callEpoch === epoch.current) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  };

  const cancelCreate = () => {
    if (createRecovery?.phase !== "reviewed_unattempted") return;
    if (!clearGoogleTaskCreateRecovery(storageDoor)) {
      setError("This tab could not cancel the saved review.");
      return;
    }
    setCreateRecovery(null);
    setError(null);
  };

  const reviewStatus = async (desiredStatus: "completed" | "needsAction") => {
    if (!selectedTask || busyRef.current) return;
    const callEpoch = ++epoch.current;
    busyRef.current = true;
    setBusy("status");
    setError(null);
    setStatusPreview(null);
    setStatusResult(null);
    try {
      const preview = await transport.previewStatus({
        organization_id: organizationId,
        connection_id: connectionId,
        task_list_id: taskListId,
        task_id: selectedTask.task_id,
        desired_status: desiredStatus,
      });
      if (callEpoch === epoch.current) setStatusPreview(preview);
    } catch (cause) {
      if (callEpoch === epoch.current) setError(getUserMessage(cause));
    } finally {
      if (callEpoch === epoch.current) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  };

  const applyStatus = async () => {
    if (!statusPreview || busyRef.current) return;
    const reviewed = statusPreview;
    const callEpoch = ++epoch.current;
    busyRef.current = true;
    setStatusPreview(null);
    setBusy("status");
    setError(null);
    try {
      const result = await transport.applyStatus({
        organization_id: organizationId,
        connection_id: connectionId,
        task_list_id: reviewed.task_list_id,
        task_id: reviewed.task_id,
        desired_status: reviewed.desired_status,
        review_receipt: reviewed.receipt,
      });
      if (callEpoch === epoch.current) setStatusResult(result);
    } catch (cause) {
      if (callEpoch === epoch.current) setError(getUserMessage(cause));
    } finally {
      if (callEpoch === epoch.current) {
        busyRef.current = false;
        setBusy(null);
      }
    }
  };

  const refreshSource = () => {
    epoch.current += 1;
    busyRef.current = false;
    setBusy(null);
    setError(null);
    setStatusPreview(null);
    setStatusResult(null);
    setCreateResult(null);
    onRefresh();
  };

  const createBlocked = Boolean(createRecovery && createRecovery.phase !== "reviewed_unattempted");
  const selectedKnownStatus = selectedTask?.status === "completed" || selectedTask?.status === "needsAction";

  return (
    <section className="space-y-4 border-t border-border p-4" aria-label="Write to Google Tasks">
      <div>
        <p className="text-sm font-medium">Google Tasks changes</p>
        <p className="text-xs text-muted-foreground">{accountLabel} · {taskListTitle}</p>
      </div>

      {createWarning ? <p className="text-xs text-amber-700 dark:text-amber-300">{createWarning}</p> : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}<ErrorAlchemyMenu error={error} /></p> : null}

      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Create a task</p>
        {createRecovery ? (
          <div className="space-y-2 text-xs">
            <p>Title: {createRecovery.request.title}</p>
            {createRecovery.request.notes ? <p>Notes: {createRecovery.request.notes}</p> : null}
            {createRecovery.request.due ? <p>Due: {createRecovery.request.due.slice(0, 10)}</p> : null}
            {!recoveryMatches ? <p>This saved action belongs to its original account, organization, and list.</p> : null}
            {createRecovery.phase === "uncertain" || createRecovery.phase === "attempting" ? (
              <p>This create may have reached Google. Refresh the source list; do not create it again by title.</p>
            ) : null}
            {createRecovery.phase === "known_unsent" ? (
              <p>Nothing was sent. Retry uses the same reviewed request and key.</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {recoveryMatches && (createRecovery.phase === "reviewed_unattempted" || createRecovery.phase === "known_unsent") ? (
                <Button size="sm" disabled={busy !== null} onClick={() => void submitCreate()}>
                  {createRecovery.phase === "known_unsent" ? "Retry reviewed create" : "Create in Google"}
                </Button>
              ) : null}
              {createRecovery.phase === "reviewed_unattempted" ? (
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={cancelCreate}>Cancel review</Button>
              ) : null}
              <Button size="sm" variant="outline" onClick={refreshSource}>Refresh source</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs">Title<Input value={title} maxLength={1024} disabled={createBlocked || busy !== null} onChange={(event) => setTitle(event.target.value)} /></label>
            <label className="block text-xs">Notes<textarea className="mt-1 min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={notes} maxLength={8192} disabled={createBlocked || busy !== null} onChange={(event) => setNotes(event.target.value)} /></label>
            <label className="block text-xs">Due date<Input type="date" value={dueDate} disabled={createBlocked || busy !== null} onChange={(event) => setDueDate(event.target.value)} /></label>
            <Button size="sm" variant="outline" disabled={busy !== null || !title.trim()} onClick={reviewCreate}>Review create</Button>
          </div>
        )}
        {createResult ? (
          <div className="space-y-2 text-xs">
            <p>Google confirmed task ID: <code>{createResult.remote_task_id}</code></p>
            <Button size="sm" variant="outline" onClick={refreshSource}>Refresh source</Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-sm font-medium">Change selected task status</p>
        {!selectedTask ? <p className="text-xs text-muted-foreground">Select one task to review a status change.</p> : null}
        {selectedTask && !selectedKnownStatus ? (
          <div className="space-y-2 text-xs"><p>This task has an unknown Google status.</p><Button size="sm" variant="outline" onClick={refreshSource}>Refresh source</Button></div>
        ) : null}
        {selectedTask && selectedKnownStatus && !statusPreview && !statusResult ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span>{selectedTask.title} · {statusLabel(selectedTask.status as "completed" | "needsAction")}</span>
            <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void reviewStatus(selectedTask.status === "completed" ? "needsAction" : "completed")}>
              Preview {selectedTask.status === "completed" ? "reopen" : "complete"}
            </Button>
          </div>
        ) : null}
        {statusPreview ? (
          <div className="space-y-2 text-xs">
            <p>{statusPreview.title}: {statusLabel(statusPreview.current_status)} → {statusLabel(statusPreview.desired_status)}</p>
            <p>Fresh review receipt ready.</p>
            <Button size="sm" disabled={busy !== null} onClick={() => void applyStatus()}>Apply reviewed status</Button>
          </div>
        ) : null}
        {statusResult ? (
          <div className="space-y-2 text-xs">
            <p>Google verified {statusResult.title} as {statusLabel(statusResult.desired_status)}.</p>
            <Button size="sm" variant="outline" onClick={refreshSource}>Refresh source</Button>
          </div>
        ) : null}
      </div>
      <p className="text-[11px] text-muted-foreground">Create recovery lasts only while this tab stays open.</p>
    </section>
  );
}
