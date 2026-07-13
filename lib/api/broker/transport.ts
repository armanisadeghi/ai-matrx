/**
 * lib/api/broker/transport.ts
 *
 * Mode dispatch — turn a CredentialRequest into a ready-to-use transport.
 *
 *   - `proxied`          → `brokeredFetch` / `createBrokeredFetch`: send
 *     provider-wire-shaped HTTP (streaming included) to `credential.endpoint`
 *     with `Authorization: Bearer <token>`. One automatic re-mint on 401,
 *     then fail loudly.
 *   - `native_ephemeral` → `resolveBrokeredTransport` hands back the
 *     endpoint/token/protocol so the caller can open the provider's own
 *     connection (WebRTC/WebSocket/HTTP per `protocol`).
 *
 * `endpoint` is DATA in the credential — nothing here (or anywhere client-
 * side) hardcodes a gateway or provider URL. That is what lets the data
 * plane move (e.g. to an edge worker) with zero client changes.
 */

import { BackendApiError } from "@/lib/api/errors";
import {
  getBrokeredCredential,
  reportCredentialRejected,
} from "@/lib/api/broker/cache";
import type {
  BrokeredCredential,
  CredentialRequest,
} from "@/lib/api/broker/types";

// ---------------------------------------------------------------------------
// Resolved transports (discriminated on credential_mode)
// ---------------------------------------------------------------------------

export interface NativeTransport {
  mode: "native_ephemeral";
  /** Connect directly here, per `protocol`. */
  endpoint: string;
  /** The provider's own ephemeral token. Never log, never persist. */
  token: string;
  protocol: string;
  model: string | null;
  credential: BrokeredCredential;
}

export interface ProxiedTransport {
  mode: "proxied";
  /** Gateway base URL — provider-shaped paths are appended to this. */
  endpoint: string;
  protocol: string;
  model: string | null;
  credential: BrokeredCredential;
  /** Provider-wire fetch bound to the gateway (401 → one re-mint → retry). */
  fetch: BrokeredFetch;
}

export type BrokeredTransport = NativeTransport | ProxiedTransport;

/** `(path, init)` — path is the PROVIDER's wire path, e.g. `/v1/messages`. */
export type BrokeredFetch = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

// ---------------------------------------------------------------------------
// Proxied fetch
// ---------------------------------------------------------------------------

function joinEndpoint(endpoint: string, path: string): string {
  const base = endpoint.replace(/\/$/, "");
  return path ? `${base}${path.startsWith("/") ? "" : "/"}${path}` : base;
}

async function fetchWithCredential(
  credential: BrokeredCredential,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${credential.token}`);
  if (init.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(joinEndpoint(credential.endpoint, path), { ...init, headers });
}

/**
 * One provider-wire HTTP call through a proxied credential. Resolves the
 * credential from the refresh-ahead cache, sends the request, and on a 401
 * (expired/rejected token) evicts it, re-mints ONCE, and retries. A second
 * 401 surfaces as a loud error. The raw `Response` is returned so callers
 * can stream the body (SSE / chunked provider streams).
 */
export async function brokeredFetch(
  req: CredentialRequest,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const credential = await getBrokeredCredential(req, { signal: toSignal(init) });
  assertProxied(credential, req);

  let response = await fetchWithCredential(credential, path, init);
  if (response.status === 401) {
    reportCredentialRejected(credential);
    const fresh = await getBrokeredCredential(req, { signal: toSignal(init) });
    response = await fetchWithCredential(fresh, path, init);
    if (response.status === 401) {
      throw new BackendApiError({
        code: "auth_required",
        detail: `Brokered credential for audience "${req.audience}" rejected twice (fresh mint still 401) at ${path}`,
        userMessage:
          "Secure access to this service was rejected. Please report this — it indicates a broker configuration problem.",
        status: 401,
      });
    }
  }
  return response;
}

function toSignal(init: RequestInit): AbortSignal | undefined {
  return init.signal ?? undefined;
}

/** Bind `brokeredFetch` to one CredentialRequest — the "provider SDK with a
 *  custom base URL" shape. */
export function createBrokeredFetch(req: CredentialRequest): BrokeredFetch {
  return (path, init) => brokeredFetch(req, path, init);
}

function assertProxied(
  credential: BrokeredCredential,
  req: CredentialRequest,
): void {
  if (credential.credential_mode !== "proxied") {
    throw new BackendApiError({
      code: "invalid_request",
      detail: `Audience "${req.audience}" minted a ${credential.credential_mode} credential — brokeredFetch is for proxied audiences only. Use resolveBrokeredTransport and connect natively per protocol "${credential.protocol}".`,
      userMessage: "This service uses a direct connection, not the gateway.",
      status: 400,
    });
  }
}

// ---------------------------------------------------------------------------
// Full mode dispatch
// ---------------------------------------------------------------------------

/**
 * Resolve a CredentialRequest into its ready-to-use transport. Callers switch
 * on `mode`; the discriminated union means TypeScript forces both branches to
 * be handled (or explicitly narrowed) — new audiences slot into one of the
 * two modes with no client changes.
 */
export async function resolveBrokeredTransport(
  req: CredentialRequest,
  opts: { signal?: AbortSignal } = {},
): Promise<BrokeredTransport> {
  const credential = await getBrokeredCredential(req, { signal: opts.signal });
  if (credential.credential_mode === "native_ephemeral") {
    return {
      mode: "native_ephemeral",
      endpoint: credential.endpoint,
      token: credential.token,
      protocol: credential.protocol,
      model: credential.model ?? null,
      credential,
    };
  }
  return {
    mode: "proxied",
    endpoint: credential.endpoint,
    protocol: credential.protocol,
    model: credential.model ?? null,
    credential,
    fetch: createBrokeredFetch(req),
  };
}
