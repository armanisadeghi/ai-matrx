"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { REGISTERED_GOOGLE_SCOPE_URLS } from "@/lib/googleScopes";

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
    };
    googleOneTapPrompt?: boolean;
  }
}

// Google API types
interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: ErrorResponse) => void;
}

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: "popup";
  select_account: boolean;
  callback: (response: CodeResponse) => void;
  error_callback?: (error: ErrorResponse) => void;
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
  signIn: (scopesToRequest: string[]) => Promise<boolean>;
  requestAuthorizationCode: (scopesToRequest: string[]) => Promise<string>;
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

const TOKEN_STORAGE_KEY = "google_auth_token";
const SCOPES_STORAGE_KEY = "google_auth_scopes";

export default function GoogleAPIProvider({
  children,
  scopes,
}: GoogleAPIProviderProps) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  });
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(token));
  const [isInitializing, setIsInitializing] = useState(Boolean(clientId));
  const [error, setError] = useState<string | null>(
    clientId ? null : "Missing Google API Client ID.",
  );
  const [grantedScopes, setGrantedScopes] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const savedScopes = localStorage.getItem(SCOPES_STORAGE_KEY);
      const parsed: unknown = savedScopes ? JSON.parse(savedScopes) : [];
      return Array.isArray(parsed) &&
        parsed.every((scope) => typeof scope === "string")
        ? parsed
        : [];
    } catch {
      return [];
    }
  });
  const [authInProgress, setAuthInProgress] = useState(false);

  const tokenClientRef = useRef<TokenClient | null>(null);

  const resetError = useCallback(() => setError(null), []);

  const allScopes = scopes ?? [...REGISTERED_GOOGLE_SCOPE_URLS];

  const saveAuthToStorage = useCallback(
    (newToken: string, newScopes: string[]) => {
      try {
        localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
        localStorage.setItem(SCOPES_STORAGE_KEY, JSON.stringify(newScopes));
      } catch (e) {
        console.error("Error saving to localStorage:", e);
      }
    },
    [],
  );

  const handleCredentialResponse = useCallback(
    (response: TokenResponse) => {
      if (response.access_token) {
        setToken(response.access_token);
        setIsAuthenticated(true);
        const newScopes = response.scope ? response.scope.split(" ") : [];
        setGrantedScopes((prevScopes) => {
          const updatedScopes = [...new Set([...prevScopes, ...newScopes])];
          saveAuthToStorage(response.access_token, updatedScopes);
          return updatedScopes;
        });
        return true;
      } else {
        console.log("No token in response.");
        if (response.error) {
          setError(
            `Google Auth Error: ${response.error_description || response.error}`,
          );
        }
        return false;
      }
    },
    [saveAuthToStorage],
  );

  const clearAuthFromStorage = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(SCOPES_STORAGE_KEY);
    } catch (e) {
      console.error("Error clearing localStorage:", e);
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

  const initTokenClient = useCallback(
    (scopesToRequest: string[]) => {
      if (!window.google?.accounts?.oauth2 || !clientId) return null;

      return window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: scopesToRequest.join(" "),
        callback: (response: TokenResponse) => {
          handleCredentialResponse(response);
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
        },
      });
    },
    [clientId, handleCredentialResponse],
  );

  const signIn = async (scopesToRequest: string[]) => {
    if (!isGoogleLoaded || !window.google?.accounts) {
      setError("Google auth not initialized.");
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
      const finalScopes =
        scopesToRequest.length > 0 ? scopesToRequest : allScopes;

      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: finalScopes.join(" "),
        callback: (response: TokenResponse) => {
          const success = handleCredentialResponse(response);
          resolve(success);
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
          resolve(false);
        },
      });
      tokenClientRef.current.requestAccessToken();
    });
  };

  const requestAuthorizationCode = async (
    scopesToRequest: string[],
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
          clearAuthFromStorage();
          resetError();
        });
      } else {
        setIsAuthenticated(false);
        setGrantedScopes([]);
        clearAuthFromStorage();
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
      const client = initTokenClient(scopes);
      if (client) {
        client.requestAccessToken();
        tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: scopes.join(" "),
          callback: (response: TokenResponse) => {
            const success = handleCredentialResponse(response);
            resolve(success);
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
        console.log("Requesting scopes:", scopes);
        tokenClientRef.current.requestAccessToken();
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
