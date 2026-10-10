import { requestOrigin } from "@/utils/auth/request-origin";
import { BACKEND_URLS } from "@/lib/api/endpoints";

export const X_OAUTH_COOKIE = "matrx_x_oauth";
export const X_SETTINGS_RETURN = "/user-settings/integrations?connection=x";
export const X_CALLBACK_PATH = "/api/social-oauth/x/callback";
export const X_CALLBACK_ORIGINS = [
  "https://www.aimatrx.com",
  "http://x-customer.localhost:3001",
] as const;

export function xCallbackOrigin(
  headers: Pick<Headers, "get">,
  fallback: string,
): string | null {
  const candidate = requestOrigin(headers) ?? fallback;
  return X_CALLBACK_ORIGINS.some((origin) => origin === candidate)
    ? candidate
    : null;
}

export interface XBrowserSession {
  state: string;
  browserProof: string;
  organizationId: string;
  returnUrl: string;
  backendOrigin: string;
  createdAt: number;
}

export function safeXReturn(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  ) {
    return X_SETTINGS_RETURN;
  }
  // Only the two product mounts can receive an OAuth return.
  const path = value.split(/[?#]/, 1)[0];
  return path === "/user-settings/integrations" ||
    /^\/marketing\/[^/]+\/socials\/accounts$/.test(path)
    ? value
    : X_SETTINGS_RETURN;
}

/** Never send the customer's bearer token to an arbitrary query-string host. */
export function xBackendOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return null;
    return Object.values(BACKEND_URLS).some(
      (known) => known && new URL(known).origin === url.origin,
    )
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function parseXBrowserSession(raw: string): XBrowserSession | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (!("state" in value) || typeof value.state !== "string" || !value.state)
      return null;
    if (
      !("browserProof" in value) ||
      typeof value.browserProof !== "string" ||
      !value.browserProof
    )
      return null;
    if (
      !("organizationId" in value) ||
      typeof value.organizationId !== "string" ||
      !value.organizationId
    )
      return null;
    if (!("returnUrl" in value) || typeof value.returnUrl !== "string")
      return null;
    if (!("backendOrigin" in value) || typeof value.backendOrigin !== "string")
      return null;
    if (!("createdAt" in value) || typeof value.createdAt !== "number")
      return null;
    const age = Date.now() - value.createdAt;
    const backendOrigin = xBackendOrigin(value.backendOrigin);
    if (age < 0 || age > 600_000 || !backendOrigin) return null;
    return {
      state: value.state,
      browserProof: value.browserProof,
      organizationId: value.organizationId,
      returnUrl: safeXReturn(value.returnUrl),
      backendOrigin,
      createdAt: value.createdAt,
    };
  } catch {
    return null;
  }
}
