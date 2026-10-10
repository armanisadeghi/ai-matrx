import { BACKEND_URLS } from "@/lib/api/endpoints";

export const SOCIAL_PROVIDERS = ["linkedin", "discord", "twitch", "snapchat", "mastodon", "bluesky"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
export const SOCIAL_SETTINGS_RETURN = "/user-settings/integrations";

/** Production and agent-owned localhost previews are the only OAuth callback mounts. */
export function isSocialCallbackOrigin(origin: string, provider?: SocialProvider): boolean {
  try {
    const url = new URL(origin);
    return url.origin === "https://www.aimatrx.com" ||
      url.origin === "http://localhost:3000" ||
      (url.protocol === "http:" && url.hostname.endsWith(".localhost") && url.port === "3001");
  } catch {
    return false;
  }
}

export function isSocialProvider(value: string): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value);
}

export function socialCookieName(provider: SocialProvider): string {
  return `matrx_social_oauth_${provider}`;
}

export function socialCallbackPath(provider: SocialProvider): string {
  return `/api/social-oauth/${provider}/callback`;
}

export interface SocialBrowserSession {
  state: string;
  browserProof: string;
  organizationId: string;
  returnUrl: string;
  backendOrigin: string;
  createdAt: number;
}

export function safeSocialReturn(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) {
    return SOCIAL_SETTINGS_RETURN;
  }
  return value.split(/[?#]/, 1)[0] === SOCIAL_SETTINGS_RETURN
    ? value
    : SOCIAL_SETTINGS_RETURN;
}

export function socialBackendOrigin(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) return null;
    return Object.values(BACKEND_URLS).some((known) => known && new URL(known).origin === url.origin)
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function parseSocialBrowserSession(raw: string): SocialBrowserSession | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    if (!("state" in value) || typeof value.state !== "string" || !value.state) return null;
    if (!("browserProof" in value) || typeof value.browserProof !== "string" || !value.browserProof) return null;
    if (!("organizationId" in value) || typeof value.organizationId !== "string" || !value.organizationId) return null;
    if (!("returnUrl" in value) || typeof value.returnUrl !== "string") return null;
    if (!("backendOrigin" in value) || typeof value.backendOrigin !== "string") return null;
    if (!("createdAt" in value) || typeof value.createdAt !== "number") return null;
    const backendOrigin = socialBackendOrigin(value.backendOrigin);
    const age = Date.now() - value.createdAt;
    if (age < 0 || age > 600_000 || !backendOrigin) return null;
    return { state: value.state, browserProof: value.browserProof, organizationId: value.organizationId, returnUrl: safeSocialReturn(value.returnUrl), backendOrigin, createdAt: value.createdAt };
  } catch {
    return null;
  }
}
