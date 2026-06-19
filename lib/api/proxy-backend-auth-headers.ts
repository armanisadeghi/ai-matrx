import type { NextRequest } from "next/server";

/**
 * Build auth headers for Next.js API routes that proxy to the Python backend.
 * Mirrors client `useApiAuth`: Bearer token when signed in, fingerprint for guests.
 */
export function getBackendProxyAuthHeaders(
  request: NextRequest,
  baseHeaders: Record<string, string> = {},
): Record<string, string> {
  const headers = { ...baseHeaders };

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
