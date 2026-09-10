const REDIRECT_PENDING_PREFIX = "mx-google-oauth-redirect:";
export const GOOGLE_OAUTH_REDIRECT_STATE_COOKIE =
  "mx_google_oauth_redirect_state";
export const GOOGLE_OAUTH_REDIRECT_TTL_MS = 10 * 60 * 1_000;

export type GoogleRedirectOwner =
  { type: "user" } | { type: "organization"; organizationId: string };

export type GoogleRedirectConnectionPurpose =
  | "general"
  | "google_ads_isolated"
  | "read_only_sweep"
  | "contacts_import";

export interface GoogleOAuthRedirectPending {
  state: string;
  initiatingUserId: string;
  createdAt: number;
  returnTo: string;
  owner: GoogleRedirectOwner;
  organizationContextId: string;
  connectionPurpose: GoogleRedirectConnectionPurpose;
}

export interface GoogleOAuthRedirectStartOptions {
  /** Filled from the validated Matrx session immediately before redirect. */
  initiatingUserId?: string;
  returnTo?: string;
  owner: GoogleRedirectOwner;
  organizationContextId: string;
  connectionPurpose?: GoogleRedirectConnectionPurpose;
  loginHint?: string;
  forceConsent?: boolean;
}

function pendingKey(state: string): string {
  return `${REDIRECT_PENDING_PREFIX}${state}`;
}

function safeReturnPath(value: string, origin: string): string {
  const url = new URL(value, origin);
  if (url.origin !== origin) {
    throw new Error("Google authorization can return only to AI Matrx.");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildGoogleOAuthRedirectPending(
  state: string,
  options: GoogleOAuthRedirectStartOptions,
  origin: string,
  now = Date.now(),
): GoogleOAuthRedirectPending {
  if (!state.trim()) throw new Error("Google authorization state is missing.");
  const initiatingUserId = options.initiatingUserId?.trim();
  if (!initiatingUserId) {
    throw new Error("Sign in before connecting Google.");
  }
  if (!options.organizationContextId.trim()) {
    throw new Error("Choose an organization before connecting Google.");
  }
  return {
    state,
    initiatingUserId,
    createdAt: now,
    returnTo: safeReturnPath(options.returnTo ?? "/", origin),
    owner: options.owner,
    organizationContextId: options.organizationContextId,
    connectionPurpose: options.connectionPurpose ?? "general",
  };
}

export function storeGoogleOAuthRedirectPending(
  storage: Storage,
  pending: GoogleOAuthRedirectPending,
): void {
  storage.setItem(pendingKey(pending.state), JSON.stringify(pending));
}

export function consumeGoogleOAuthRedirectPending(
  storage: Storage,
  state: string,
  origin: string,
  now = Date.now(),
): GoogleOAuthRedirectPending | null {
  const key = pendingKey(state);
  const raw = storage.getItem(key);
  storage.removeItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<GoogleOAuthRedirectPending>;
    if (
      value.state !== state ||
      typeof value.initiatingUserId !== "string" ||
      !value.initiatingUserId ||
      typeof value.createdAt !== "number" ||
      now - value.createdAt > GOOGLE_OAUTH_REDIRECT_TTL_MS ||
      typeof value.returnTo !== "string" ||
      typeof value.organizationContextId !== "string" ||
      !value.organizationContextId ||
      (value.connectionPurpose !== "general" &&
        value.connectionPurpose !== "google_ads_isolated" &&
        value.connectionPurpose !== "read_only_sweep" &&
        value.connectionPurpose !== "contacts_import") ||
      !value.owner ||
      (value.owner.type !== "user" && value.owner.type !== "organization")
    ) {
      return null;
    }
    const owner = value.owner;
    if (
      owner.type === "organization" &&
      (!("organizationId" in owner) ||
        typeof owner.organizationId !== "string" ||
        !owner.organizationId)
    ) {
      return null;
    }
    return {
      state,
      initiatingUserId: value.initiatingUserId,
      createdAt: value.createdAt,
      returnTo: safeReturnPath(value.returnTo, origin),
      owner,
      organizationContextId: value.organizationContextId,
      connectionPurpose: value.connectionPurpose,
    };
  } catch {
    return null;
  }
}

/** Refuse a consent result when the Matrx session changed mid-redirect. */
export function assertGoogleOAuthRedirectInitiator(
  pending: GoogleOAuthRedirectPending,
  currentUserId: string | null | undefined,
): void {
  if (!currentUserId || currentUserId !== pending.initiatingUserId) {
    throw new Error(
      "Your AI Matrx session changed while Google authorization was open. No Google access was saved; sign in as the original user and try again.",
    );
  }
}

export function returnPathWithGoogleOAuthResult(
  returnTo: string,
  origin: string,
  status: "connected" | "failed",
  message?: string,
): string {
  const url = new URL(safeReturnPath(returnTo, origin), origin);
  url.searchParams.set("google_oauth", status);
  if (status === "failed" && message) {
    url.searchParams.set("google_oauth_message", message.slice(0, 240));
  } else {
    url.searchParams.delete("google_oauth_message");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
