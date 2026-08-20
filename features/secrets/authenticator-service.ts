/**
 * Matrx Authenticator — client for the GA manage surface (aidream
 * `/api/authenticator/*`).
 *
 * 🚨 THE LOAD-BEARING INVARIANT (D-15): this client NEVER receives a seed and
 * NEVER receives a generated code — there is no such endpoint. Enrollment sends
 * the setup key / otpauth URI the USER supplies; every response is metadata only
 * (issuer / account / label / params / enabled). Generation-and-typing is the
 * trusted browser data-plane's server-side act, never reachable from here.
 *
 * Spec: common-docs/systems/matrx-authenticator/FEATURE.md
 */

import { createClient } from "@/utils/supabase/client";
import type { AuthenticatorEntry } from "./authenticator-types";

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function authHeaders(json: boolean): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
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
