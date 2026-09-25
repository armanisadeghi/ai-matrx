// features/scheduling/service/schedulerClient.ts
//
// Typed HTTP client for the aidream /scheduler/* router (matrx-scheduler
// package). Replaces the legacy /scheduling/* surface (pythonClient.ts).
//
// Auth: forwards the user's Supabase JWT as Bearer; aidream resolves a
// per-request Supabase client; RLS enforces ownership. Admins do NOT
// see cross-user rows via /scheduler/tasks or /scheduler/runs — those
// remain on direct Supabase via lib/services/scheduling-admin-service.ts.

import { serverMessageFromBody, WriteRefusedError } from "@/lib/errors/writeFailure";
import { supabase } from "@/utils/supabase/client";
import type {
  ComputeNextDueRequest,
  ComputeNextDueResponse,
  DbJobListResponse,
  DbJobPatchRequest,
  DbJobResponse,
  DeletedResponse,
  ListRunsQuery,
  ListTasksQuery,
  DuplicateScheduleResponse,
  PreviewFiresRequest,
  PreviewFiresResponse,
  RunListResponse,
  RunNowResponse,
  RunResponse,
  ScannerStatusResponse,
  SystemTaskListResponse,
  SystemTaskPatchRequest,
  SystemTaskResponse,
  TaskCreateRequest,
  TaskDetailResponse,
  TaskListResponse,
  TaskPatchRequest,
  TaskResponse,
  TriggerCreateRequest,
  TriggerListResponse,
  TriggerPatchRequest,
  TriggerResponse,
  ValidateCronRequest,
  ValidateCronResponse,
} from "./schedulerApi.types";
import { resolveServiceBaseUrl } from "@/lib/api/resolve-service-url";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
// 🚨 THE GATE, NOT THE BARE KERNEL (SOURCE-KEY, 2026-09-24). This client used
// to read `requireOrganizationContext` directly — fail-closed and SYNCHRONOUS,
// so a signed-in person with no workspace selected got a bare toast
// ("Select an organization before sending this request.") from `/schedules/new`
// with no way to continue: the app-wide "ask, then continue" gate
// (`OrganizationGateDialog`, mounted once in `DeferredSingletonCore`) never
// opened, because nothing here ever asked it to. `ensureOrganizationContext`
// is the awaited half of the same guard `callApi` already uses at its own
// transport boundary — it resolves the EXPLICIT id if the caller already has
// one (unchanged), otherwise opens the picker, waits for the choice, commits
// it as the active organization, and returns it — so the request this
// function is building for continues with the answer instead of dying and
// making the person press Create again. See `lib/organization/organization-gate.ts`.
import { ensureOrganizationForRequest } from "@/lib/organization/organization-gate";

// ── Base URL + auth ────────────────────────────────────────────────────────

function baseUrl(): string {
  return resolveServiceBaseUrl("aidream");
}

async function authHeaders(
  method: string,
  explicitOrganizationId?: string,
): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error(
      "Not authenticated — cannot reach aidream /scheduler endpoints",
    );
  }
  // ORG-GATE-AUDIT: the method decides whether to ASK. A write the person
  // pressed (Create schedule) with no organization selected opens the picker
  // and continues; a GET (the /schedules list, status, duplicates — all
  // fetched on mount) keeps the fail-closed refusal and never raises a dialog
  // with nothing behind it (4821555e98).
  const organizationId = await ensureOrganizationForRequest({
    method,
    organizationId: explicitOrganizationId,
  });
  return applyOrganizationContextHeader(
    {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    organizationId,
  );
}

async function request<T>(
  path: string,
  init: RequestInit & { method: string },
  organizationId?: string,
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      ...(await authHeaders(init.method, organizationId)),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = "";
    let body: unknown = null;
    try {
      body = await res.json();
      const d = (body as { detail?: unknown } | null)?.detail;
      detail = d ? ` — ${JSON.stringify(d)}` : "";
    } catch {
      // body not JSON; fall through
    }
    // Words for the person, the method/path/status line for diagnostics (GATES-TAIL): a
    // caller that shows `err.message` never shows "PATCH /scheduler/tasks/<id> 500".
    throw new WriteRefusedError({
      status: res.status,
      serverMessage: serverMessageFromBody(body),
      technical: `${init.method} ${path} ${res.status}${detail}`,
    });
  }
  return (await res.json()) as T;
}

function qs(params: Record<string, unknown> | object): string {
  const obj = params as Record<string, unknown>;
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export function createTask(
  body: TaskCreateRequest,
): Promise<TaskDetailResponse> {
  return request<TaskDetailResponse>("/scheduler/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * The caller's schedules that duplicate each other — same agent, prompt,
 * variables, queue and enabled trigger, regardless of what they are named
 * (THE SCHEDULER DUPLICATE GUARD). Paused and trigger-less schedules are
 * excluded server-side: they cannot fire, so they cost nothing.
 */
export function listDuplicateSchedules(): Promise<DuplicateScheduleResponse> {
  return request<DuplicateScheduleResponse>("/scheduler/tasks/duplicates", {
    method: "GET",
  });
}

export function listTasks(
  query: ListTasksQuery = {},
): Promise<TaskListResponse> {
  return request<TaskListResponse>(`/scheduler/tasks${qs(query)}`, {
    method: "GET",
  });
}

export function getTask(
  taskId: string,
  runsLimit = 10,
): Promise<TaskDetailResponse> {
  return request<TaskDetailResponse>(
    `/scheduler/tasks/${encodeURIComponent(taskId)}${qs({ runs_limit: runsLimit })}`,
    { method: "GET" },
  );
}

/**
 * ORG-GATE-AUDIT (VERIFIER-20 #1): every write to ONE schedule takes the
 * SCHEDULE'S OWN organization (`sch_task.organization_id`) — the object names
 * it; the active selection and the picker are never consulted. Omitted only by
 * a caller that has no row yet.
 */
export function patchTask(
  taskId: string,
  body: TaskPatchRequest,
  organizationId?: string,
): Promise<TaskResponse> {
  return request<TaskResponse>(
    `/scheduler/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    organizationId,
  );
}

export function softDeleteTask(
  taskId: string,
  organizationId?: string,
): Promise<DeletedResponse> {
  return request<DeletedResponse>(
    `/scheduler/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
    organizationId,
  );
}

export function runNow(
  taskId: string,
  organizationId?: string,
): Promise<RunNowResponse> {
  return request<RunNowResponse>(
    `/scheduler/tasks/${encodeURIComponent(taskId)}/run-now`,
    { method: "POST" },
    organizationId,
  );
}

// ── Triggers ───────────────────────────────────────────────────────────────

export function listTriggers(
  taskId: string,
  organizationId?: string,
): Promise<TriggerListResponse> {
  return request<TriggerListResponse>(
    `/scheduler/triggers${qs({ task_id: taskId })}`,
    { method: "GET" },
    organizationId,
  );
}

export function createTrigger(
  body: TriggerCreateRequest,
  organizationId?: string,
): Promise<TriggerResponse> {
  return request<TriggerResponse>(
    "/scheduler/triggers",
    { method: "POST", body: JSON.stringify(body) },
    organizationId,
  );
}

export function patchTrigger(
  triggerId: string,
  body: TriggerPatchRequest,
  organizationId?: string,
): Promise<TriggerResponse> {
  return request<TriggerResponse>(
    `/scheduler/triggers/${encodeURIComponent(triggerId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
    organizationId,
  );
}

export function deleteTrigger(triggerId: string): Promise<DeletedResponse> {
  return request<DeletedResponse>(
    `/scheduler/triggers/${encodeURIComponent(triggerId)}`,
    { method: "DELETE" },
  );
}

// ── Runs ───────────────────────────────────────────────────────────────────

export function listRuns(query: ListRunsQuery = {}): Promise<RunListResponse> {
  return request<RunListResponse>(`/scheduler/runs${qs(query)}`, {
    method: "GET",
  });
}

export function getRun(runId: string): Promise<RunResponse> {
  return request<RunResponse>(`/scheduler/runs/${encodeURIComponent(runId)}`, {
    method: "GET",
  });
}

// ── Compute / cron ─────────────────────────────────────────────────────────

export function cronValidate(
  body: ValidateCronRequest,
): Promise<ValidateCronResponse> {
  return request<ValidateCronResponse>("/scheduler/cron/validate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function cronPreviewFires(
  body: PreviewFiresRequest,
): Promise<PreviewFiresResponse> {
  return request<PreviewFiresResponse>("/scheduler/cron/preview-fires", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function computeNextDueAt(
  body: ComputeNextDueRequest,
): Promise<ComputeNextDueResponse> {
  return request<ComputeNextDueResponse>("/scheduler/compute-next-due-at", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Admin ──────────────────────────────────────────────────────────────────

export function getStatus(
  organizationId?: string,
): Promise<ScannerStatusResponse> {
  return request<ScannerStatusResponse>(
    "/scheduler/status",
    { method: "GET" },
    organizationId,
  );
}

// ── System jobs (admin, /scheduling/* prefix) ──────────────────────────────
//
// Recurring SERVER jobs (kind=tool) — the aidream `/scheduling/admin/*`
// router, NOT `/scheduler/*`. Same base URL and Bearer auth; the server side
// additionally admin-gates these routes. Enabling/disabling flips the task
// AND its trigger together server-side, and the server REFUSES enabling a
// task whose handler is not registered — that refusal must reach the admin
// verbatim (the shared `request` helper already surfaces `detail`).

export function listSystemTasks(): Promise<SystemTaskListResponse> {
  return request<SystemTaskListResponse>("/scheduling/admin/system-tasks", {
    method: "GET",
  });
}

export function patchSystemTask(
  taskId: string,
  body: SystemTaskPatchRequest,
  organizationId?: string,
): Promise<SystemTaskResponse> {
  return request<SystemTaskResponse>(
    `/scheduling/admin/system-tasks/${encodeURIComponent(taskId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
    organizationId,
  );
}

/**
 * The System Jobs console's run-now. The ADMIN route (super-admin gated,
 * opens the admin lane server-side) — the plain `/scheduling/run-now` is the
 * member door and carries no admin power (utils/supabase/adminLane.ts).
 */
export function runSystemTaskNow(taskId: string): Promise<RunNowResponse> {
  return request<RunNowResponse>(
    `/scheduling/admin/run-now/${encodeURIComponent(taskId)}`,
    { method: "POST" },
  );
}

// ── DB jobs (admin, /scheduling/admin/db-jobs) ─────────────────────────────
//
// pg_cron — SQL scheduled inside Postgres itself, on the same console per
// Arman's 2026-08-29 ruling extension. Same admin gate as system tasks.
// There is deliberately NO run-now: pg_cron has no run-once primitive and
// several jobs are destructive purges.

export function listDbJobs(): Promise<DbJobListResponse> {
  return request<DbJobListResponse>("/scheduling/admin/db-jobs", {
    method: "GET",
  });
}

export function patchDbJob(
  jobid: number,
  body: DbJobPatchRequest,
): Promise<DbJobResponse> {
  return request<DbJobResponse>(`/scheduling/admin/db-jobs/${jobid}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}
