// features/scheduling/service/schedulerClient.ts
//
// Typed HTTP client for the aidream /scheduler/* router (matrx-scheduler
// package). Replaces the legacy /scheduling/* surface (pythonClient.ts).
//
// Auth: forwards the user's Supabase JWT as Bearer; aidream resolves a
// per-request Supabase client; RLS enforces ownership. Admins do NOT
// see cross-user rows via /scheduler/tasks or /scheduler/runs — those
// remain on direct Supabase via lib/services/scheduling-admin-service.ts.

import { supabase } from "@/utils/supabase/client";
import type {
  ComputeNextDueRequest,
  ComputeNextDueResponse,
  DeletedResponse,
  ListRunsQuery,
  ListTasksQuery,
  PreviewFiresRequest,
  PreviewFiresResponse,
  RunListResponse,
  RunNowResponse,
  RunResponse,
  ScannerStatusResponse,
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

// ── Base URL + auth ────────────────────────────────────────────────────────

function baseUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL_PROD ||
    "";
  return base.replace(/\/$/, "");
}

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error(
      "Not authenticated — cannot reach aidream /scheduler endpoints",
    );
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function request<T>(
  path: string,
  init: RequestInit & { method: string },
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail = body.detail ? ` — ${JSON.stringify(body.detail)}` : "";
    } catch {
      // body not JSON; fall through
    }
    throw new Error(`${init.method} ${path} ${res.status}${detail}`);
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

export function patchTask(
  taskId: string,
  body: TaskPatchRequest,
): Promise<TaskResponse> {
  return request<TaskResponse>(
    `/scheduler/tasks/${encodeURIComponent(taskId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
  );
}

export function softDeleteTask(taskId: string): Promise<DeletedResponse> {
  return request<DeletedResponse>(
    `/scheduler/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
}

export function runNow(taskId: string): Promise<RunNowResponse> {
  return request<RunNowResponse>(
    `/scheduler/tasks/${encodeURIComponent(taskId)}/run-now`,
    { method: "POST" },
  );
}

// ── Triggers ───────────────────────────────────────────────────────────────

export function listTriggers(taskId: string): Promise<TriggerListResponse> {
  return request<TriggerListResponse>(
    `/scheduler/triggers${qs({ task_id: taskId })}`,
    { method: "GET" },
  );
}

export function createTrigger(
  body: TriggerCreateRequest,
): Promise<TriggerResponse> {
  return request<TriggerResponse>("/scheduler/triggers", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function patchTrigger(
  triggerId: string,
  body: TriggerPatchRequest,
): Promise<TriggerResponse> {
  return request<TriggerResponse>(
    `/scheduler/triggers/${encodeURIComponent(triggerId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    },
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

export function getStatus(): Promise<ScannerStatusResponse> {
  return request<ScannerStatusResponse>("/scheduler/status", { method: "GET" });
}
