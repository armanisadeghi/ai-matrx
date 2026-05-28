/**
 * Thin client for the aidream /user-secrets REST surface.
 *
 * Per the project's data-flow doctrine ("React calls the Python backend
 * directly"), we hit aidream straight from the browser with the user's
 * Supabase JWT. No Next.js API hop, no Server Action. Same shape every
 * other Python-backed feature uses.
 */
import { createClient } from "@/utils/supabase/client";
import type {
  UserSecretBulkEnvRequest,
  UserSecretBulkEnvResponse,
  UserSecretCreateRequest,
  UserSecretListResponse,
  UserSecretSummary,
  UserSecretUpdateRequest,
} from "./types";

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not signed in");
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail: string | undefined;
    try {
      const body = await resp.json();
      detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await resp.text();
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export async function fetchSecrets(opts?: {
  includeInactive?: boolean;
}): Promise<UserSecretSummary[]> {
  const headers = await authHeaders();
  const qs = opts?.includeInactive ? "?include_inactive=true" : "";
  const resp = await fetch(`${backendBase()}/api/user-secrets/${qs}`, {
    headers,
  });
  const { secrets } = await handle<UserSecretListResponse>(resp);
  return secrets;
}

export async function createSecret(
  body: UserSecretCreateRequest,
): Promise<UserSecretSummary> {
  const headers = await authHeaders();
  const resp = await fetch(`${backendBase()}/api/user-secrets/`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return handle<UserSecretSummary>(resp);
}

export async function updateSecret(
  key: string,
  body: UserSecretUpdateRequest,
): Promise<UserSecretSummary> {
  const headers = await authHeaders();
  const resp = await fetch(
    `${backendBase()}/api/user-secrets/${encodeURIComponent(key)}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    },
  );
  return handle<UserSecretSummary>(resp);
}

export async function deleteSecret(
  key: string,
  opts?: { hard?: boolean },
): Promise<void> {
  const headers = await authHeaders();
  const qs = opts?.hard ? "?hard=true" : "";
  const resp = await fetch(
    `${backendBase()}/api/user-secrets/${encodeURIComponent(key)}${qs}`,
    { method: "DELETE", headers },
  );
  await handle<void>(resp);
}

export async function bulkImportEnv(
  body: UserSecretBulkEnvRequest,
): Promise<UserSecretBulkEnvResponse> {
  const headers = await authHeaders();
  const resp = await fetch(`${backendBase()}/api/user-secrets/bulk-env`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return handle<UserSecretBulkEnvResponse>(resp);
}
