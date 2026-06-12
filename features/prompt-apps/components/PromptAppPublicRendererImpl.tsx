"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { transform } from "@babel/standalone";
import { AlertCircle } from "lucide-react";
import { getFingerprint } from "@/lib/services/fingerprint-service";
import { useGuestLimit } from "@/hooks/useGuestLimit";
import { GuestLimitWarning } from "@/components/guest/GuestLimitWarning";
import { SignupConversionModal } from "@/components/guest/SignupConversionModal";
import {
  buildComponentScope,
  getScopeFunctionParameters,
  patchScopeForMissingIdentifiers,
} from "../utils/allowed-imports";
import { PromptAppErrorBoundary } from "./PromptAppErrorBoundary";
import type { PromptApp } from "../types/promptAppTypes";
import { BACKEND_URLS } from "@/lib/api/endpoints";

interface ExecuteAppResponse {
  success: boolean;
  task_id?: string;
  socket_config?: {
    service: string;
    task_name: string;
    task_data: Record<string, any>;
  };
  error?: {
    type: string;
    message: string;
  };
  guest_limit?: {
    allowed: boolean;
    remaining: number;
    total_used: number;
    is_blocked: boolean;
  };
}

interface PromptAppPublicRendererProps {
  app: PromptApp;
  slug: string;
}

type PromptResolutionMessage = {
  role: string;
  content: string;
  metadata?: unknown;
};

function isPromptResolutionMessageArray(
  value: unknown,
): value is PromptResolutionMessage[] {
  if (!Array.isArray(value)) return false;
  return value.every((item) => {
    if (!item || typeof item !== "object") return false;
    const rec = item as Record<string, unknown>;
    return typeof rec.role === "string" && typeof rec.content === "string";
  });
}

export function PromptAppPublicRenderer({
  app,
  slug,
}: PromptAppPublicRendererProps) {
  // Simple local state - NO Redux!
  const [taskId, setTaskId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<any>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [response, setResponse] = useState<string>("");
  const [isStreamComplete, setIsStreamComplete] = useState(false);
  const [isSocketReady, setIsSocketReady] = useState(false);
  const socketRef = useRef<any>(null);
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track last variables for retry
  const lastVariablesRef = useRef<Record<string, any> | null>(null);
  const retryCountRef = useRef(0);
  const handleExecuteRef = useRef<
    ((variables: Record<string, any>) => Promise<void>) | null
  >(null);

  // Use guest limit hook for tracking and UI
  const guestLimit = useGuestLimit();

  // Generate fingerprint on mount using centralized service
  useEffect(() => {
    getFingerprint().then((fp) => setFingerprint(fp));
  }, []);

  // OPTIMIZATION: Proactively check guest limit in background (after fingerprint ready)
  useEffect(() => {
    if (!fingerprint) return;
    // This caches the guest limit status for instant checking during execution
    guestLimit.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]); // Only run when fingerprint changes, not when guestLimit object changes

  // Pre-establish socket connection on mount (after fingerprint is ready)
  useEffect(() => {
    if (!fingerprint) return;

    async function setupSocket() {
      try {
        // Dynamically import socket.io-client (client-side only)
        const { io } = await import("socket.io-client");
        const { createClient } = await import("@/utils/supabase/client");
        const { v5: uuidv5 } = await import("uuid");

        const BACKEND_URL = BACKEND_URLS.production;
        const SOCKET_NAMESPACE = "/UserSession";
        const GUEST_NAMESPACE = "00000000-0000-0000-0000-000000000001"; // UUID namespace for guests

        // Create deterministic UUID from fingerprint for Python backend
        const fingerprintToUUID = (fp: string): string => {
          return uuidv5(fp, GUEST_NAMESPACE);
        };

        // Try to get auth token if user is logged in
        let authToken: string | null = null;
        let isAuthenticated = false;

        try {
          const supabase = createClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();
          authToken = session?.access_token || null;
          isAuthenticated = !!authToken;
          console.log("🔑 User authenticated:", isAuthenticated);
        } catch (err) {
          console.log("⚠️ No auth session, using public access");
        }

        const socketOptions: any = {
          transports: ["websocket", "polling"],
          reconnection: false,
          timeout: 10000,
          withCredentials: true,
        };

        if (isAuthenticated && authToken) {
          // Authenticated user: use their token
          socketOptions.auth = { token: authToken };
          console.log("✅ Using authenticated user token");
        } else {
          // Public/anonymous user: use unique UUID derived from fingerprint
          // This allows Python backend to distinguish between different guests
          const guestUserId = fingerprintToUUID(fingerprint);
          socketOptions.auth = {
            user_id: guestUserId, // Unique UUID per guest
            fingerprint: fingerprint, // Original fingerprint for reference
            public_access: true,
            is_guest: true,
          };
          console.log(
            "🌐 Using guest UUID:",
            guestUserId.substring(0, 8) + "...",
            "from fingerprint:",
            fingerprint.substring(0, 8) + "...",
          );
        }

        const newSocket = io(
          `${BACKEND_URL}${SOCKET_NAMESPACE}`,
          socketOptions,
        );
        socketRef.current = newSocket;

        newSocket.on("connect", () => {
          console.log("✅ Socket pre-connected and ready");
          setIsSocketReady(true);
        });

        newSocket.on("connect_error", (err) => {
          console.error("❌ Socket connection error:", err);
          console.error("❌ Backend URL was:", BACKEND_URL);
          console.error(
            "❌ Error details:",
            JSON.stringify(err, Object.getOwnPropertyNames(err)),
          );
          setIsSocketReady(false);
        });
      } catch (err) {
        console.error("Socket setup error:", err);
        setIsSocketReady(false);
      }
    }

    setupSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsSocketReady(false);
    };
  }, [fingerprint]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (executionTimeoutRef.current) {
        clearTimeout(executionTimeoutRef.current);
      }
    };
  }, []);

  // OPTIMIZATION: Client-side variable validation (instant, no API call)
  const validateVariables = useCallback(
    (variables: Record<string, any>) => {
      const errors: string[] = [];
      const valid: Record<string, any> = {};
      const schema = app.variable_schema;

      if (!Array.isArray(schema)) {
        return { validVariables: variables, validationErrors: [] };
      }

      for (const schemaItem of schema) {
        const { name, required, type, default: defaultValue } = schemaItem;

        if (required && !(name in variables)) {
          if (defaultValue !== undefined) {
            valid[name] = defaultValue;
          } else {
            errors.push(`Missing required variable: ${name}`);
          }
        } else if (name in variables) {
          const value = variables[name];
          const normalizedType = (type as any) === "text" ? "string" : type;

          if (normalizedType === "string" || !normalizedType) {
            valid[name] = String(value);
          } else if (normalizedType === "number") {
            const numValue = typeof value === "number" ? value : Number(value);
            valid[name] = isNaN(numValue) ? 0 : numValue;
          } else if (normalizedType === "boolean") {
            valid[name] = Boolean(value);
          } else if (normalizedType === "array") {
            valid[name] = Array.isArray(value) ? value : [value];
          } else {
            valid[name] = value;
          }
        } else if (defaultValue !== undefined) {
          valid[name] = defaultValue;
        } else {
          valid[name] = "";
        }
      }

      return { validVariables: valid, validationErrors: errors };
    },
    [app.variable_schema],
  );

  // OPTIMIZATION: Client-side variable resolution (instant, no API call)
  const resolveVariablesInMessages = useCallback(
    (
      messages: PromptResolutionMessage[],
      variables: Record<string, unknown>,
    ) => {
      return messages.map((msg) => {
        let content = msg.content;

        Object.entries(variables).forEach(([key, value]) => {
          const regex = new RegExp(`{{${key}}}`, "g");
          content = content.replace(regex, String(value));
        });

        return {
          role: msg.role,
          content,
          ...(msg.metadata && { metadata: msg.metadata }),
        };
      });
    },
    [],
  );

  // OPTIMIZATION: Client-side chat config building (instant, no API call)
  const buildChatConfig = useCallback(
    (resolvedMessages: PromptResolutionMessage[]) => {
      if (!app.prompt?.settings?.model_id) {
        throw new Error("No model specified in prompt settings");
      }

      const { model_id, ...modelConfig } = app.prompt.settings;

      return {
        model_id,
        messages: resolvedMessages,
        stream: true,
        ...modelConfig,
      };
    },
    [app.prompt],
  );

  // Execute handler
  const handleExecute = useCallback(
    async (variables: Record<string, any>) => {
      // Store variables for potential retry
      lastVariablesRef.current = variables;

      // Check if socket is ready
      if (!isSocketReady || !socketRef.current) {
        setError({
          type: "connection_error",
          message: "Connection not ready. Please wait a moment and try again.",
        });
        return;
      }

      setIsExecuting(true);
      setError(null);
      setResponse("");
      setIsStreamComplete(false);

      // Clear any existing timeout
      if (executionTimeoutRef.current) {
        clearTimeout(executionTimeoutRef.current);
        executionTimeoutRef.current = null;
      }

      try {
        // OPTIMIZATION 1: Validate variables CLIENT-SIDE (instant, no API call)
        const { validVariables, validationErrors } =
          validateVariables(variables);

        if (validationErrors.length > 0) {
          setError({
            type: "execution_error",
            message: validationErrors.join("; "),
          });
          setIsExecuting(false);
          return;
        }

        // OPTIMIZATION 2: Check guest limit from CACHE (instant, no API call)
        if (!guestLimit.allowed) {
          setError({
            type: "execution_error",
            message:
              "You have reached the maximum number of free executions. Please sign up to continue.",
          });
          setIsExecuting(false);
          return;
        }

        // OPTIMIZATION 3: Resolve variables CLIENT-SIDE (instant, no API call)
        if (!app.prompt?.messages) {
          setError({
            type: "execution_error",
            message: "Prompt data not available",
          });
          setIsExecuting(false);
          return;
        }

        if (!isPromptResolutionMessageArray(app.prompt.messages)) {
          setError({
            type: "execution_error",
            message: "Prompt messages are invalid",
          });
          setIsExecuting(false);
          return;
        }
        const resolvedMessages = resolveVariablesInMessages(
          app.prompt.messages,
          validVariables,
        );

        // OPTIMIZATION 4: Build chat config CLIENT-SIDE (instant, no API call)
        const chatConfig = buildChatConfig(resolvedMessages);

        // OPTIMIZATION 5: Minimal API call (just for logging + task_id) (~10-20ms)
        const res = await fetch(`/api/public/apps/${slug}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app_id: app.id,
            variables_provided: variables,
            variables_used: validVariables,
            fingerprint,
            chat_config: chatConfig, // Pre-built config
            metadata: {
              timestamp: new Date().toISOString(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              model_id: chatConfig.model_id,
            },
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          let errorMsg = `Request failed (${res.status})`;
          try {
            const err = text
              ? (JSON.parse(text) as {
                  error?: { message?: string };
                  message?: string;
                })
              : {};
            errorMsg = err.error?.message || err.message || errorMsg;
          } catch {
            /* use default errorMsg */
          }
          throw new Error(errorMsg);
        }

        const data: ExecuteAppResponse = await res.json();

        // Update guest limit state in background
        if (data.guest_limit) {
          guestLimit.refresh();
        }

        if (!data.success || !data.task_id) {
          setError(
            data.error || {
              type: "execution_error",
              message: "Execution failed",
            },
          );
          setIsExecuting(false);
          return;
        }

        setTaskId(data.task_id);

        // OPTIMIZATION 6: IMMEDIATELY emit task using pre-established socket
        const socket = socketRef.current;

        socket.emit(
          "chat_service",
          {
            taskName: "direct_chat",
            taskData: { chat_config: chatConfig },
          },
          (response: { response_listener_events?: string[] }) => {
            const eventNames = response?.response_listener_events || [];

            if (!eventNames.length) {
              setError({
                type: "execution_error",
                message: "No response received from server",
              });
              setIsExecuting(false);
              setIsStreamComplete(true);
              return;
            }

            console.log("📡 Listening to events:", eventNames);

            // Listen to all response events
            eventNames.forEach((eventName: string) => {
              socket.on(eventName, (data: any) => {
                if (typeof data === "string") {
                  // Stream text chunks
                  setResponse((prev) => prev + data);
                } else if (data?.end) {
                  // Stream ended
                  console.log("✅ Stream complete");
                  retryCountRef.current = 0;
                  setIsExecuting(false);
                  setIsStreamComplete(true);
                  // Clear timeout on completion
                  if (executionTimeoutRef.current) {
                    clearTimeout(executionTimeoutRef.current);
                    executionTimeoutRef.current = null;
                  }
                  socket.off(eventName);
                } else if (data?.error) {
                  // Error received — auto-retry once on transient stream errors
                  const errorType = data.error?.type || "execution_error";
                  const errorMsg =
                    data.error?.message || "Error during execution";
                  const isTransient = [
                    "stream_error",
                    "timeout",
                    "connection_error",
                  ].includes(errorType);

                  if (
                    isTransient &&
                    retryCountRef.current === 0 &&
                    lastVariablesRef.current
                  ) {
                    console.log(
                      "🔄 Transient stream error — auto-retrying once...",
                    );
                    retryCountRef.current = 1;
                    socket.off(eventName);
                    if (executionTimeoutRef.current) {
                      clearTimeout(executionTimeoutRef.current);
                      executionTimeoutRef.current = null;
                    }
                    // Brief pause then retry using ref to avoid stale closure
                    setTimeout(() => {
                      if (
                        handleExecuteRef.current &&
                        lastVariablesRef.current
                      ) {
                        handleExecuteRef.current(lastVariablesRef.current);
                      }
                    }, 1500);
                  } else {
                    retryCountRef.current = 0;
                    setError({
                      type: errorType,
                      message: errorMsg,
                    });
                    setIsExecuting(false);
                    setIsStreamComplete(true);
                    if (executionTimeoutRef.current) {
                      clearTimeout(executionTimeoutRef.current);
                      executionTimeoutRef.current = null;
                    }
                    socket.off(eventName);
                  }
                }
              });
            });
          },
        );

        // Set execution timeout (2 minutes)
        executionTimeoutRef.current = setTimeout(() => {
          console.error("⏱️ Execution timed out");
          setError({
            type: "timeout",
            message: "Request timed out. Please try again.",
          });
          setIsExecuting(false);
          setIsStreamComplete(true);
        }, 120000); // 2 minute timeout
      } catch (err) {
        console.error("Execution error:", err);
        setError({
          type: "execution_error",
          message:
            err instanceof Error ? err.message : "Unknown error occurred",
        });
        setIsExecuting(false);
      }
    },
    [
      slug,
      app,
      fingerprint,
      isSocketReady,
      guestLimit,
      validateVariables,
      resolveVariablesInMessages,
      buildChatConfig,
    ],
  );

  // Keep ref updated for use in retry timeouts (avoids stale closure)
  handleExecuteRef.current = handleExecute;

  // Dynamically load custom component
  const CustomComponent = useMemo(() => {
    try {
      let processedCode = app.component_code;
      processedCode = processedCode.replace(
        /^import\s+.*from\s+['"].*['"];?\s*$/gm,
        "",
      );
      processedCode = processedCode.replace(/^import\s+['"].*['"];?\s*$/gm, "");

      let { code } = transform(processedCode, {
        presets: ["react", "typescript"],
        filename: "custom-app.tsx",
      });

      // Remove export statements and prepend return for function declarations
      if (code) {
        code = code.replace(/^export\s+default\s+/m, "return ");
        code = code.replace(/^export\s+\{[^}]+\}\s*;?\s*$/gm, "");
      }

      // Build component scope using centralized import resolver
      const scope = buildComponentScope(app.allowed_imports);

      // Patch scope with fallbacks for any PascalCase identifiers in the code
      // that aren't already available (e.g., non-existent Lucide icons)
      if (code) {
        patchScopeForMissingIdentifiers(code, scope);
      }

      // Get valid parameter names (filter out invalid JS identifiers)
      const { paramNames, paramValues } = getScopeFunctionParameters(scope);

      // Code now starts with 'return function...' so it will return the component directly
      const componentFunction = new Function(...paramNames, code);

      return componentFunction(...paramValues);
    } catch (err) {
      console.error("Component render error:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      return () => (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <div className="w-full max-w-lg">
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="bg-destructive/5 border-b border-destructive/10 px-6 py-5">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      Failed to load app
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      The app component could not be compiled
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-5 space-y-3">
                <p className="text-sm text-muted-foreground">
                  There was an error building the app component. This usually
                  means the app code has a syntax or import issue.
                </p>
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-mono text-destructive break-all">
                    {errorMessage}
                  </p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }, [app.component_code, app.allowed_imports]);

  if (!CustomComponent) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-destructive">Failed to load app component</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Guest limit warning (shows after 3 executions) */}
      {guestLimit.showWarning && (
        <div className="flex-shrink-0 p-4">
          <GuestLimitWarning
            remaining={guestLimit.remaining}
            onDismiss={guestLimit.dismissWarning}
          />
        </div>
      )}

      {/* Signup conversion modal (shows at 5 executions) */}
      <SignupConversionModal
        isOpen={guestLimit.showSignupModal}
        onClose={guestLimit.dismissSignupModal}
        totalUsed={guestLimit.totalUsed}
      />

      {/* Main content with scroll */}
      <div className="flex-1 overflow-auto">
        <PromptAppErrorBoundary appName={app.name}>
          <CustomComponent
            onExecute={handleExecute}
            response={response}
            isStreaming={!isStreamComplete && !!taskId}
            isExecuting={isExecuting}
            error={error}
          />
        </PromptAppErrorBoundary>
      </div>
    </div>
  );
}
