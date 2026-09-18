"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { GOOGLE_IDENTITY_SCOPES } from "@/lib/googleScopes";
import { createClient } from "@/utils/supabase/client";
import type {
  GooglePickerNamespace,
  GooglePlatformApi,
} from "@/lib/googlePicker";
import {
  assertGoogleOAuthRedirectInitiator,
  buildGoogleOAuthRedirectPending,
  storeGoogleOAuthRedirectPending,
} from "./oauthRedirect";
import type { GoogleOAuthRedirectStartOptions } from "./oauthRedirect";
import {
  acquireOrJoinGoogleAuthorizationGate,
  type GoogleAuthorizationGateHandle,
} from "./googleAuthorizationGate";
import {
  GOOGLE_IDENTITY_POLL_INTERVAL_MS,
  GOOGLE_IDENTITY_READY_TIMEOUT_MS,
  GOOGLE_IDENTITY_SCRIPT_SRC,
  GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE,
} from "./googleIdentityReadiness";

export class GoogleAuthorizationCancelledError extends Error {
  constructor() {
    super("Google authorization was closed before it finished.");
    this.name = "GoogleAuthorizationCancelledError";
  }
}

export function isGoogleAuthorizationCancelled(error: unknown): boolean {
  return error instanceof GoogleAuthorizationCancelledError;
}

// ===== PERFORMANCE TIMING LOGS =====
const GOOGLE_PROVIDER_MODULE_LOAD =
  typeof window !== "undefined" ? performance.now() : 0;
if (typeof window !== "undefined") {
  console.log(
    `⚡GoogleAPIProvider module loaded at: ${GOOGLE_PROVIDER_MODULE_LOAD.toFixed(2)}ms`,
  );
}

// Type definitions for Google Identity Services
declare global {
  interface Window {
    google: {
      accounts: {
        oauth2: {
          initCodeClient: (config: CodeClientConfig) => CodeClient;
          initTokenClient: (config: TokenClientConfig) => TokenClient;
          revoke: (token: string, callback: () => void) => void;
        };
      };
      picker?: GooglePickerNamespace;
    };
    gapi?: GooglePlatformApi;
    googleOneTapPrompt?: boolean;
  }
}

// Google API types
interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: ErrorResponse) => void;
  include_granted_scopes?: boolean;
  prompt?: "" | "consent" | "select_account";
  login_hint?: string;
}

interface PopupCodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: "popup";
  select_account: boolean;
  callback: (response: CodeResponse) => void;
  error_callback?: (error: ErrorResponse) => void;
  include_granted_scopes?: boolean;
  enable_granular_consent?: boolean;
  prompt?: "consent" | "select_account";
  login_hint?: string;
}

interface RedirectCodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: "redirect";
  redirect_uri: string;
  state: string;
  select_account: boolean;
  include_granted_scopes?: boolean;
  prompt?: "consent" | "select_account";
  login_hint?: string;
}

type CodeClientConfig = PopupCodeClientConfig | RedirectCodeClientConfig;

export interface GoogleAuthorizationCodeOptions {
  /** Re-display consent for a user-facing verification walkthrough. */
  forceConsent?: boolean;
}

interface CodeClient {
  requestCode: () => void;
}

interface CodeResponse {
  code?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: () => void;
}

interface TokenResponse {
  access_token: string;
  scope: string;
  expires_in: number;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface ErrorResponse {
  type: string;
  message?: string;
}

interface GoogleAPIContextType {
  isGoogleLoaded: boolean;
  isAuthenticated: boolean;
  isInitializing: boolean;
  error: string | null;
  token: string | null;
  signIn: (
    scopesToRequest: string[],
    loginHint?: string,
    options?: GoogleTokenRequestOptions,
  ) => Promise<string | null>;
  requestAuthorizationCode: (
    scopesToRequest: string[],
    loginHint?: string,
    options?: GoogleAuthorizationCodeOptions,
    /**
     * The one-window gate, when the caller already took it (the consent runner
     * holds it across its organization wait). Omitted, the primitive takes the
     * gate itself, so no call site can bypass it.
     */
    gate?: GoogleAuthorizationGateHandle | null,
  ) => Promise<string>;
  startAuthorizationCodeRedirect: (
    scopesToRequest: string[],
    options: GoogleOAuthRedirectStartOptions,
    gate?: GoogleAuthorizationGateHandle | null,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  getGrantedScopes: () => string[];
  requestScopes: (scopes: string[]) => Promise<boolean>;
  resetError: () => void;
  /**
   * Re-inserts the Google Identity Services script and restarts the bounded
   * readiness wait. This is the remedy the failed state offers; it is safe to
   * call at any time (a wait already in flight is abandoned, and a late
   * arrival from the abandoned attempt cannot resurrect it).
   */
  retryGoogleIdentityLoad: () => void;
}

export interface GoogleTokenRequestOptions {
  /**
   * The caller is handling an explicit user gesture and needs a fresh browser
   * token now (for example, opening Google Picker).  A durable server-side
   * connection does not imply that GIS can silently mint a browser token in a
   * new session, so this opts into the consent prompt instead of failing with
   * an opaque null token.
   */
  interactive?: boolean;
}

export function googleTokenPrompt(
  options?: GoogleTokenRequestOptions,
): "" | "consent" {
  return options?.interactive ? "consent" : "";
}

const GoogleAPIContext = createContext<GoogleAPIContextType | null>(null);

export const useGoogleAPI = () => {
  const context = useContext(GoogleAPIContext);
  if (!context) {
    throw new Error("useGoogleAPI must be used within a GoogleAPIProvider");
  }
  return context;
};

/**
 * Non-throwing variant of {@link useGoogleAPI}. Returns `null` when no
 * `GoogleAPIProvider` is present in the tree instead of throwing.
 *
 * Use this in components that may render OUTSIDE the provider (e.g. a
 * presentation Slideshow shown on the admin markdown-tester, in chat, or
 * anywhere a `presentation` JSON block is rendered) so the absence of the
 * Google integration degrades the relevant feature (Google Slides export)
 * rather than crashing the whole subtree.
 */
export const useGoogleAPIOptional = (): GoogleAPIContextType | null =>
  useContext(GoogleAPIContext);

interface GoogleAPIProviderProps {
  children: React.ReactNode;
  scopes?: string[];
}

export default function GoogleAPIProvider({
  children,
  scopes,
}: GoogleAPIProviderProps) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  // Picker tokens are short-lived browser credentials. Keep them in memory
  // only; the durable refresh token belongs exclusively to aidream's vault.
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializing, setIsInitializing] = useState(Boolean(clientId));
  const [error, setError] = useState<string | null>(
    clientId ? null : "Missing Google API Client ID.",
  );
  const [grantedScopes, setGrantedScopes] = useState<string[]>([]);
  const [authInProgress, setAuthInProgress] = useState(false);
  /**
   * Bumped by {@link retryGoogleIdentityLoad}. It is the effect's generation
   * token: a new attempt re-runs the effect, whose cleanup marks the previous
   * attempt abandoned, so nothing the old script does later can write state.
   */
  const [loadAttempt, setLoadAttempt] = useState(0);

  const tokenClientRef = useRef<TokenClient | null>(null);
  const tokenExpiresAtRef = useRef(0);
  const tokenAccountHintRef = useRef<string | null>(null);

  const resetError = useCallback(() => setError(null), []);

  const allScopes = scopes ?? [...GOOGLE_IDENTITY_SCOPES];

  const handleCredentialResponse = useCallback((response: TokenResponse) => {
    if (response.access_token) {
      setToken(response.access_token);
      setIsAuthenticated(true);
      const newScopes = response.scope ? response.scope.split(" ") : [];
      setGrantedScopes((prevScopes) => {
        const updatedScopes = [...new Set([...prevScopes, ...newScopes])];
        return updatedScopes;
      });
      return response.access_token;
    } else {
      console.log("No token in response.");
      if (response.error) {
        setError(
          `Google Auth Error: ${response.error_description || response.error}`,
        );
      }
      return null;
    }
  }, []);

  /**
   * 🚨 THE READINESS WAIT IS BOUNDED (V-24 NEW-4, lane F-111).
   *
   * The old poll re-scheduled itself every 100 ms with no timeout and no
   * attempt bound, and `script.onerror` fires only when the REQUEST errors —
   * so a script that is served but never defines `window.google.accounts` (a
   * content blocker, a network filter, an outage) spun forever behind
   * "Loading Google API…". Now: one bound, then an honest failed state whose
   * sentence names what happened and offers Retry. The error path and the
   * timeout path land in the SAME state, and an arrival after the bound cannot
   * resurrect the abandoned attempt.
   */
  useEffect(() => {
    if (!clientId) {
      return;
    }

    /** Abandoned: this attempt may no longer write state. */
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + GOOGLE_IDENTITY_READY_TIMEOUT_MS;

    const succeed = () => {
      if (settled) return;
      settled = true;
      setIsGoogleLoaded(true);
      setIsInitializing(false);
      setError((current) =>
        current === GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE ? null : current,
      );
    };

    /** Both the timeout and `onerror` land here — one failed state, one sentence. */
    const fail = () => {
      if (settled) return;
      settled = true;
      setIsGoogleLoaded(false);
      setIsInitializing(false);
      setError(GOOGLE_IDENTITY_UNAVAILABLE_MESSAGE);
    };

    const checkGoogleLoaded = () => {
      if (settled) return;
      if (window.google?.accounts) {
        succeed();
        return;
      }
      if (Date.now() >= deadline) {
        fail();
        return;
      }
      pollTimer = setTimeout(
        checkGoogleLoaded,
        GOOGLE_IDENTITY_POLL_INTERVAL_MS,
      );
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_IDENTITY_SCRIPT_SRC}"]`,
    );
    if (existing && loadAttempt === 0) {
      // Someone else already inserted it on this page; just watch for the
      // namespace, under the same bound.
      checkGoogleLoaded();
    } else {
      // A retry re-INSERTS the script: a tag that already failed will never
      // fire another load event, so reusing it would wait out the bound again
      // for nothing.
      existing?.remove();
      const script = document.createElement("script");
      script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = checkGoogleLoaded;
      script.onerror = fail;
      document.body.appendChild(script);
      checkGoogleLoaded();
    }

    return () => {
      settled = true;
      if (pollTimer !== undefined) clearTimeout(pollTimer);
    };
  }, [clientId, loadAttempt]);

  const retryGoogleIdentityLoad = useCallback(() => {
    if (!clientId) return;
    setError(null);
    setIsGoogleLoaded(false);
    setIsInitializing(true);
    setLoadAttempt((attempt) => attempt + 1);
  }, [clientId]);

  const signIn = async (
    scopesToRequest: string[],
    loginHint?: string,
    options?: GoogleTokenRequestOptions,
  ) => {
    if (!isGoogleLoaded || !window.google?.accounts) {
      setError("Google auth not initialized.");
      return null;
    }
    if (!clientId) {
      setError("Google client ID is not configured.");
      return null;
    }
    const finalScopes =
      scopesToRequest.length > 0 ? scopesToRequest : allScopes;
    const cachedTokenIsUsable =
      Boolean(token) &&
      Date.now() < tokenExpiresAtRef.current - 60_000 &&
      finalScopes.every((scope) => grantedScopes.includes(scope)) &&
      (!loginHint || tokenAccountHintRef.current === loginHint);
    if (cachedTokenIsUsable) return token;
    if (authInProgress) {
      console.log("Auth in progress, skipping...");
      return null;
    }

    resetError();
    setAuthInProgress(true);

    return new Promise<string | null>((resolve) => {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: finalScopes.join(" "),
        // Picker receives a drive.file-only browser token even if this Google
        // account later grants gmail.send to the same Cloud project.
        include_granted_scopes: true,
        prompt: googleTokenPrompt(options),
        ...(loginHint ? { login_hint: loginHint } : {}),
        callback: (response: TokenResponse) => {
          const accessToken = handleCredentialResponse(response);
          if (accessToken) {
            tokenExpiresAtRef.current =
              Date.now() + Math.max(response.expires_in, 0) * 1_000;
            tokenAccountHintRef.current = loginHint ?? null;
          }
          resolve(accessToken);
          setAuthInProgress(false);
        },
        error_callback: (err: ErrorResponse) => {
          console.log("Token client error:", err);
          setAuthInProgress(false);
          if (
            err.type !== "popup_closed" &&
            err.type !== "popup_closed_by_user"
          ) {
            setError(`Auth failed: ${err.type}`);
          }
          resolve(null);
        },
      });
      tokenClientRef.current.requestAccessToken();
    });
  };

  const requestAuthorizationCode = async (
    scopesToRequest: string[],
    loginHint?: string,
    options?: GoogleAuthorizationCodeOptions,
    gate?: GoogleAuthorizationGateHandle | null,
  ): Promise<string> => {
    if (!isGoogleLoaded || !window.google?.accounts?.oauth2) {
      throw new Error("Google authorization is still loading.");
    }
    if (!clientId) {
      throw new Error("Google client ID is not configured.");
    }
    // 🚨 THE GATE, NOT `authInProgress`. The state flag is read from a rendered
    // closure, so two presses in one tick both saw the stale `false`. The gate
    // is module scope: one person, one window. Joining the caller's handle
    // keeps the consent runner's organization wait covered by ONE lock.
    const held = acquireOrJoinGoogleAuthorizationGate(gate);

    resetError();
    setAuthInProgress(true);
    try {
      return await new Promise<string>((resolve, reject) => {
        const client = window.google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: (scopesToRequest.length ? scopesToRequest : allScopes).join(
            " ",
          ),
          ux_mode: "popup",
          select_account: true,
          include_granted_scopes: false,
          enable_granular_consent: true,
          ...(options?.forceConsent ? { prompt: "consent" as const } : {}),
          ...(loginHint ? { login_hint: loginHint } : {}),
          callback: (response: CodeResponse) => {
            setAuthInProgress(false);
            held.release();
            if (response.code) {
              resolve(response.code);
              return;
            }
            const message =
              response.error_description ||
              response.error ||
              "Google did not return an authorization code.";
            setError(message);
            reject(new Error(message));
          },
          error_callback: (response: ErrorResponse) => {
            setAuthInProgress(false);
            held.release();
            if (
              response.type === "popup_closed" ||
              response.type === "popup_closed_by_user"
            ) {
              reject(new GoogleAuthorizationCancelledError());
              return;
            }
            const message =
              response.message ||
              `Google authorization failed: ${response.type}`;
            setError(message);
            reject(new Error(message));
          },
        });
        client.requestCode();
      });
    } catch (cause) {
      // Anything that threw before a callback could run — GIS refusing to build
      // the client, `requestCode` throwing — means the window never opened. The
      // gate must not stay held for the rest of the session. `release` is
      // idempotent, so a callback that already released is unaffected.
      setAuthInProgress(false);
      held.release();
      throw cause;
    }
  };

  const startAuthorizationCodeRedirect = async (
    scopesToRequest: string[],
    options: GoogleOAuthRedirectStartOptions,
    gate?: GoogleAuthorizationGateHandle | null,
  ): Promise<void> => {
    if (!isGoogleLoaded || !window.google?.accounts?.oauth2) {
      throw new Error("Google authorization is still loading.");
    }
    if (!clientId) {
      throw new Error("Google client ID is not configured.");
    }
    // The redirect path takes the SAME gate as the popup path — one person, one
    // authorization window, whichever shape it has. It is deliberately never
    // released on success: the page is leaving, and the next page load gets a
    // fresh module with a free gate.
    const held = acquireOrJoinGoogleAuthorizationGate(gate);

    resetError();
    setAuthInProgress(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in before connecting Google.");
      const response = await fetch("/api/google/oauth/redirect-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initiatingUserId: user.id }),
      });
      const body = (await response.json()) as {
        state?: unknown;
        redirectUri?: unknown;
        userId?: unknown;
        error?: unknown;
      };
      if (
        !response.ok ||
        typeof body.state !== "string" ||
        typeof body.redirectUri !== "string" ||
        typeof body.userId !== "string"
      ) {
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Google redirect authorization could not start.",
        );
      }
      assertGoogleOAuthRedirectInitiator(
        { initiatingUserId: user.id },
        body.userId,
      );
      const redirectUri = new URL(body.redirectUri);
      if (
        redirectUri.origin !== window.location.origin ||
        redirectUri.pathname !== "/"
      ) {
        throw new Error(
          "Google authorization returned an invalid callback origin.",
        );
      }
      const pending = buildGoogleOAuthRedirectPending(
        body.state,
        { ...options, initiatingUserId: body.userId },
        window.location.origin,
      );
      storeGoogleOAuthRedirectPending(window.sessionStorage, pending);
      const client = window.google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: (scopesToRequest.length ? scopesToRequest : allScopes).join(" "),
        ux_mode: "redirect",
        redirect_uri: body.redirectUri,
        state: body.state,
        select_account: true,
        include_granted_scopes: false,
        ...(options.forceConsent ? { prompt: "consent" as const } : {}),
        ...(options.loginHint ? { login_hint: options.loginHint } : {}),
      });
      client.requestCode();
    } catch (cause) {
      setAuthInProgress(false);
      held.release();
      throw cause;
    }
  };

  const signOut = async () => {
    if (!isGoogleLoaded || !window.google?.accounts) {
      setError("Google auth not initialized.");
      return;
    }
    try {
      if (token) {
        window.google.accounts.oauth2.revoke(token, () => {
          setToken(null);
          setIsAuthenticated(false);
          setGrantedScopes([]);
          tokenExpiresAtRef.current = 0;
          tokenAccountHintRef.current = null;
          resetError();
        });
      } else {
        setIsAuthenticated(false);
        setGrantedScopes([]);
        tokenExpiresAtRef.current = 0;
        tokenAccountHintRef.current = null;
        resetError();
      }
    } catch (err: unknown) {
      console.error("Sign-out error:", err);
      setError(
        `Sign-out failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  const getGrantedScopes = useCallback(() => grantedScopes, [grantedScopes]);

  const requestScopes = async (scopes: string[]): Promise<boolean> => {
    if (
      !isGoogleLoaded ||
      !window.google?.accounts ||
      !tokenClientRef.current
    ) {
      setError("Google auth not ready.");
      return false;
    }
    if (!clientId) {
      setError("Google client ID is not configured.");
      return false;
    }
    if (authInProgress) {
      console.log("Auth in progress, skipping...");
      return false;
    }

    resetError();
    setAuthInProgress(true);

    return new Promise<boolean>((resolve) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scopes.join(" "),
        include_granted_scopes: true,
        prompt: "consent",
        callback: (response: TokenResponse) => {
          const accessToken = handleCredentialResponse(response);
          resolve(Boolean(accessToken));
          setAuthInProgress(false);
        },
        error_callback: (err: ErrorResponse) => {
          console.log("Scope request error:", err);
          setAuthInProgress(false);
          if (
            err.type !== "popup_closed" &&
            err.type !== "popup_closed_by_user"
          ) {
            setError(`Scope request failed: ${err.type}`);
          }
          resolve(false);
        },
      });
      tokenClientRef.current = client;
      if (client) {
        client.requestAccessToken();
      } else {
        setError("Failed to initialize Google token client for scope request.");
        setAuthInProgress(false);
        resolve(false);
      }
    });
  };
  return (
    <GoogleAPIContext.Provider
      value={{
        isGoogleLoaded,
        isAuthenticated,
        isInitializing,
        error,
        token,
        signIn,
        requestAuthorizationCode,
        startAuthorizationCodeRedirect,
        signOut,
        getGrantedScopes,
        requestScopes,
        resetError,
        retryGoogleIdentityLoad,
      }}
    >
      {children}
    </GoogleAPIContext.Provider>
  );
}
