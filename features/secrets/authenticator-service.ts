/**
 * Matrx Authenticator — client for the GA manage surface (aidream
 * `/api/authenticator/*`).
 *
 * This client never receives a seed. The signed-in Vault owner may request the
 * current short-lived code for display; enrollment responses remain metadata.
 *
 * Spec: common-docs/systems/clients/matrx-authenticator/FEATURE.md
 */

import { createClient } from "@/utils/supabase/client";
import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";
import type {
  AuthenticatorCode,
  AuthenticatorEntry,
} from "./authenticator-types";

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function authHeaders(json: boolean): Promise<Record<string, string>> {
  const organizationId = requireSelectedOrgId();
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    "X-Organization-Id": organizationId,
  };
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers = await authHeaders(!isForm);
  let resp: Response;
  try {
    resp = await fetch(`${backendBase()}/api/authenticator${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
  } catch {
    throw new Error(
      "Authenticator service unreachable — enrollment needs the backend online",
    );
  }
  if (!resp.ok) {
    let detail: string | undefined;
    try {
      const body = (await resp.json()) as { detail?: unknown };
      detail =
        typeof body.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await resp.text().catch(() => undefined);
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

/** Every account the signed-in user holds an authenticator for. Metadata only. */
export async function fetchAuthenticators(): Promise<AuthenticatorEntry[]> {
  const resp = await authFetch<{ entries: AuthenticatorEntry[] }>("");
  return resp.entries ?? [];
}

/** Fetch the code the signed-in Vault owner needs to finish a provider login. */
export function fetchAuthenticatorCode(
  credentialItemId: string,
): Promise<AuthenticatorCode> {
  return authFetch<AuthenticatorCode>(
    `/${encodeURIComponent(credentialItemId)}/code`,
  );
}

/** Enroll from a setup key or a full otpauth:// URI.
 *
 *  Every route lands here: pasted key, pasted/dropped QR screenshot, and camera
 *  scan all decode to an otpauth URI **in the browser** (`lib/qr/decode.ts`), so
 *  a QR image never travels anywhere. The server's multipart `/enroll/qr` route
 *  still exists for clients without a local decoder; this one does not use it. */
export function enrollAuthenticator(
  credentialItemId: string,
  enrollmentInput: string,
): Promise<AuthenticatorEntry> {
  return authFetch<AuthenticatorEntry>("/enroll", {
    method: "POST",
    body: JSON.stringify({
      credential_item_id: credentialItemId,
      enrollment_input: enrollmentInput,
    }),
  });
}

/** Per-account consent toggle — effective on the next code generation. */
export function setAuthenticatorEnabled(
  credentialItemId: string,
  enabled: boolean,
): Promise<AuthenticatorEntry> {
  return authFetch<AuthenticatorEntry>(
    `/${encodeURIComponent(credentialItemId)}/enabled`,
    { method: "PUT", body: JSON.stringify({ enabled }) },
  );
}

/** Delete the seed. Generation stops immediately. Does NOT remove two-factor at
 *  the provider — the user's phone app / backup codes still work. */
export function deleteAuthenticator(credentialItemId: string): Promise<void> {
  return authFetch<void>(`/${encodeURIComponent(credentialItemId)}`, {
    method: "DELETE",
  });
}
