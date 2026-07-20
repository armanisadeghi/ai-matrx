import { useState, useEffect, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { toast } from "@/lib/toast";
import {
  getStoredAdminToken,
  setStoredAdminToken,
} from "@/utils/api-test-auth";
import {
  selectActiveServer,
  selectResolvedBaseUrl,
  switchServer,
} from "@/lib/redux/slices/apiConfigSlice";
import { createClient } from "@/utils/supabase/client";
import { BACKEND_URLS, ENDPOINTS } from "@/lib/api/endpoints";
import type { AppDispatch } from "@/lib/redux/store";
import type { ContextScope } from "@/lib/api/types";

export type ServerType = "local" | "production";

export interface ApiTestConfig {
  serverType: ServerType;
  authToken: string;
  baseUrl: string;
}

export interface UseApiTestConfigReturn extends ApiTestConfig {
  setServerType: (type: ServerType) => void;
  setAuthToken: (token: string) => void;
  isCheckingLocalhost: boolean;
  isLocalhostAvailable: boolean;
  hasToken: boolean;
  /** True when the token was auto-loaded from the active Supabase session (not manually entered) */
  isSessionToken: boolean;
  /** Admin scope overrides for testing */
  scopeOverride: ContextScope;
  setScopeOverride: (scope: ContextScope) => void;
}

interface UseApiTestConfigOptions {
  defaultServerType?: ServerType;
  defaultAuthToken?: string;
  localUrl?: string;
  productionUrl?: string;
  requireToken?: boolean;
}

/**
 * Hook for managing API test configuration (server type and auth token).
 *
 * Now unified with the global admin override system:
 * - Server selection reads/writes from Redux adminPreferences (synced with AdminMenu)
 * - Localhost health check uses the shared useAdminOverride hook
 * - Auth tokens stored in cookies for persistence across sessions
 * - Adds scope override support for admin testing with org/project/task context
 */
export function useApiTestConfig(
  options: UseApiTestConfigOptions = {},
): UseApiTestConfigReturn {
  const { defaultAuthToken = "", requireToken = true } = options;

  const dispatch = useDispatch<AppDispatch>();
  const activeServer = useSelector(selectActiveServer);
  const resolvedUrl = useSelector(selectResolvedBaseUrl);

  const backendUrl = resolvedUrl ?? "";
  const isLocalhost = activeServer === "localhost";
  const serverOverride = activeServer === "production" ? null : activeServer;
  const [isCheckingLocalhost, setIsCheckingLocalhost] = useState(false);

  // Initialize with empty to avoid hydration mismatch (cookies only exist on client).
  const [authToken, setAuthTokenState] = useState<string>(defaultAuthToken);
  // True when the current token was pulled from the active Supabase session automatically.
  const [isSessionToken, setIsSessionToken] = useState(false);

  // Scope override for admin testing
  const [scopeOverride, setScopeOverride] = useState<ContextScope>({});

  const setAuthToken = (token: string) => {
    setAuthTokenState(token);
    setIsSessionToken(false);
    if (token) {
      setStoredAdminToken(token);
    }
  };

  // After mount: prefer cookie token, then fall back to the live Supabase session.
  // This means logged-in users never need to manually paste a token.
  useEffect(() => {
    const stored = getStoredAdminToken();
    if (stored) {
      setAuthTokenState(stored);
      setIsSessionToken(false);
      return;
    }

    // No cookie token — try the active session
    const loadSessionToken = async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.access_token) {
          setAuthTokenState(session.access_token);
          setIsSessionToken(true);
        }
      } catch {
        // Silently ignore — token remains empty, user can paste manually
      }
    };
    loadSessionToken();
  }, []);

  // Server type derived from unified admin override
  const serverType: ServerType = isLocalhost ? "local" : "production";

  // Localhost available if we're currently on localhost or override says so
  const isLocalhostAvailable = isLocalhost || serverOverride === "localhost";

  const handleSetServerType = useCallback(
    async (type: ServerType) => {
      if (type === "local") {
        const localhostUrl = BACKEND_URLS["localhost"];
        if (!localhostUrl) {
          toast.error("Localhost unavailable", {
            description: "NEXT_PUBLIC_BACKEND_URL_LOCAL is not configured.",
          });
          return;
        }
        setIsCheckingLocalhost(true);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(
            `${localhostUrl}${ENDPOINTS.health.check}`,
            {
              signal: controller.signal,
            },
          );
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          dispatch(switchServer({ env: "localhost" }));
        } catch {
          toast.error("Localhost unavailable", {
            description:
              "Cannot connect to localhost server. Please start the server and try again.",
          });
        } finally {
          setIsCheckingLocalhost(false);
        }
      } else {
        dispatch(switchServer({ env: "production" }));
      }
    },
    [dispatch],
  );

  return {
    serverType,
    authToken,
    baseUrl: backendUrl,
    setServerType: handleSetServerType,
    setAuthToken,
    isCheckingLocalhost,
    isLocalhostAvailable,
    hasToken: authToken.length > 0,
    isSessionToken,
    scopeOverride,
    setScopeOverride,
  };
}
