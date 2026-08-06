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
import type {
  GooglePickerNamespace,
  GooglePlatformApi,
} from "@/lib/googlePicker";

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

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: "popup";
  select_account: boolean;
  callback: (response: CodeResponse) => void;
  error_callback?: (error: ErrorResponse) => void;
  include_granted_scopes?: boolean;
  enable_granular_consent?: boolean;
  login_hint?: string;
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
  ) => Promise<string | null>;
  requestAuthorizationCode: (
    scopesToRequest: string[],
    loginHint?: string,
  ) => Promise<string>;
  signOut: () => Promise<void>;
  getGrantedScopes: () => string[];
  requestScopes: (scopes: string[]) => Promise<boolean>;
  resetError: () => void;
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

  const tokenClientRef = useRef<TokenClient | null>(null);

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

  // Load Google Identity Services
  useEffect(() => {
    // ===== PERFORMANCE TIMING LOGS =====
    console.log(
      `⚡GoogleAPIProvider useEffect started at: ${performance.now().toFixed(2)}ms`,
    );

    if (!clientId) {
      return;
    }

    const loadGoogleIdentityServices = () => {
      if (
        document.querySelector(
          'script[src="https://accounts.google.com/gsi/client"]',
        )
      ) {
        checkGoogleLoaded();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = checkGoogleLoaded;
      script.onerror = () => {
        setError("Failed to load Google Identity Services");
        setIsInitializing(false);
      };
      document.body.appendChild(script);
    };

    const checkGoogleLoaded = () => {
      if (window.google?.accounts) {
        setIsGoogleLoaded(true);
        setIsInitializing(false);
      } else {
        setTimeout(checkGoogleLoaded, 100);
      }
    };

    loadGoogleIdentityServices();
  }, [clientId]);

  const signIn = async (scopesToRequest: string[], loginHint?: string) => {
    if (!isGoogleLoaded || !window.google?.accounts) {
      setError("Google auth not initialized.");
      return null;
    }
    if (!clientId) {
      setError("Google client ID is not configured.");
      return null;
    }
    if (authInProgress) {
      console.log("Auth in progress, skipping...");
      return null;
    }

    resetError();
    setAuthInProgress(true);

    return new Promise<string | null>((resolve) => {
      const finalScopes =
        scopesToRequest.length > 0 ? scopesToRequest : allScopes;

      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: finalScopes.join(" "),
        // Picker receives a drive.file-only browser token even if this Google
        // account later grants gmail.send to the same Cloud project.
        include_granted_scopes: false,
        prompt: "",
        ...(loginHint ? { login_hint: loginHint } : {}),
        callback: (response: TokenResponse) => {
          const accessToken = handleCredentialResponse(response);
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
  ): Promise<string> => {
    if (!isGoogleLoaded || !window.google?.accounts?.oauth2) {
      throw new Error("Google authorization is still loading.");
    }
    if (!clientId) {
      throw new Error("Google client ID is not configured.");
    }
    if (authInProgress) {
      throw new Error("A Google authorization window is already open.");
    }

    resetError();
    setAuthInProgress(true);
    return new Promise<string>((resolve, reject) => {
      const client = window.google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: (scopesToRequest.length ? scopesToRequest : allScopes).join(" "),
        ux_mode: "popup",
        select_account: true,
        include_granted_scopes: true,
        enable_granular_consent: true,
        ...(loginHint ? { login_hint: loginHint } : {}),
        callback: (response: CodeResponse) => {
          setAuthInProgress(false);
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
          const message =
            response.type === "popup_closed"
              ? "Google authorization was closed before it finished."
              : response.message ||
                `Google authorization failed: ${response.type}`;
          if (response.type !== "popup_closed") setError(message);
          reject(new Error(message));
        },
      });
      client.requestCode();
    });
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
          resetError();
        });
      } else {
        setIsAuthenticated(false);
        setGrantedScopes([]);
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
        signOut,
        getGrantedScopes,
        requestScopes,
        resetError,
      }}
    >
      {children}
    </GoogleAPIContext.Provider>
  );
}
