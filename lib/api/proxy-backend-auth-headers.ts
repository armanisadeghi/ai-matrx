import type { NextRequest } from "next/server";

/**
 * Build auth headers for Next.js API routes that proxy to the Python backend.
 * Mirrors client `useApiAuth`: Bearer token when signed in, fingerprint for guests.
 *
 * Organization admission (matrx-connect AuthMiddleware, 2026-08-30): a
 * Bearer-JWT request without `X-Organization-Id` is refused with a 400
 * `organization_required`. This proxy is a pass-through, not a resolver — it
 * forwards the caller's own `X-Organization-Id` alongside the JWT and NEVER
 * picks an organization itself. The fingerprint-guest lane is admitted
 * org-less by the server, so no organization header rides it.
 */
export function getBackendProxyAuthHeaders(
  request: NextRequest,
  baseHeaders: Record<string, string> = {},
): Record<string, string> {
  const headers = { ...baseHeaders };

  const organizationId =
    request.headers.get("X-Organization-Id") ??
    request.headers.get("x-organization-id");

  // A caller that resolved an organization keeps it across the proxy hop on
  // BOTH lanes — a guest that explicitly named an organization is the one
  // guest case that sends the header.
  if (organizationId) headers["X-Organization-Id"] = organizationId;

  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    headers.Authorization = authHeader;
    return headers;
  }

  const fingerprint =
    request.headers.get("X-Fingerprint-ID") ??
    request.headers.get("x-fingerprint-id") ??
    request.headers.get("X-Guest-Fingerprint") ??
    request.headers.get("x-guest-fingerprint");

  if (fingerprint) {
    headers["X-Fingerprint-ID"] = fingerprint;
  }

  return headers;
}
