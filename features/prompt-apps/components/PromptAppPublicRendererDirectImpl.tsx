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
import type {
  ChunkPayload,
  ErrorPayload,
  EndPayload,
} from "@/types/python-generated/stream-events";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { ENDPOINTS, BACKEND_URLS } from "@/lib/api/endpoints";

interface PromptAppPublicRendererDirectProps {
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

export function PromptAppPublicRendererDirect({
  app,
  slug,
}: PromptAppPublicRendererDirectProps) {
  // Simple local state - NO Redux or Socket.IO!
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<any>(null);
  const [fingerprint, setFingerprint] = useState("");
  const [response, setResponse] = useState<string>("");
  const [isStreamComplete, setIsStreamComplete] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use guest limit hook for tracking and UI
  const guestLimit = useGuestLimit();

  // Generate fingerprint on mount using centralized service
  useEffect(() => {
    getFingerprint().then((fp) => setFingerprint(fp));
  }, []);

  // Check for authentication token on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const { createClient } = await import("@/utils/supabase/client");
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setAuthToken(session?.access_token || null);
      } catch (err) {
        setAuthToken(null);
      }
    }
    checkAuth();
  }, []);

  // OPTIMIZATION: Proactively check guest limit in background (after fingerprint ready)
  useEffect(() => {
    if (!fingerprint) return;
    // This caches the guest limit status for instant checking during execution
    guestLimit.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]); // Only run when fingerprint changes, not when guestLimit object changes

  // Cleanup timeout and abort controller on unmount
  useEffect(() => {
    return () => {
      if (executionTimeoutRef.current) {
        clearTimeout(executionTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
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
        ai_model_id: model_id,
        messages: resolvedMessages,
        stream: true,
        ...modelConfig,
      };
    },
    [app.prompt],
  );

  // Execute handler with direct API streaming
  const handleExecute = useCallback(
    async (variables: Record<string, any>) => {
      // ⏱️ PERFORMANCE TIMING START
      const perfStart = performance.now();
      let firstTextReceived = false;

      const logTiming = (milestone: string) => {
        const elapsed = performance.now() - perfStart;
        console.log(`⏱️ [${elapsed.toFixed(1)}ms] ${milestone}`);
      };

      logTiming("🚀 EXECUTION STARTED");

      setIsExecuting(true);
      setError(null);
      setResponse("");
      setIsStreamComplete(false);

      // Clear any existing timeout
      if (executionTimeoutRef.current) {
        clearTimeout(executionTimeoutRef.current);
        executionTimeoutRef.current = null;
      }

      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();

      try {
        // STEP 1: Validate variables CLIENT-SIDE
        const { validVariables, validationErrors } =
          validateVariables(variables);
        logTiming("✓ Client-side validation complete");

        if (validationErrors.length > 0) {
          setError({
            type: "execution_error",
            message: validationErrors.join("; "),
          });
          setIsExecuting(false);
          return;
        }

        // STEP 2: Check guest limit from CACHE
        if (!guestLimit.allowed) {
          logTiming("✗ Guest limit exceeded");
          setError({
            type: "execution_error",
            message:
              "You have reached the maximum number of free executions. Please sign up to continue.",
          });
          setIsExecuting(false);
          return;
        }
        logTiming("✓ Guest limit check passed");

        // STEP 3: Resolve variables CLIENT-SIDE
        if (!isPromptResolutionMessageArray(app.prompt?.messages)) {
          setError({
            type: "execution_error",
            message: "Prompt data not available",
          });
          setIsExecuting(false);
          return;
        }

        const resolvedMessages = resolveVariablesInMessages(
          app.prompt.messages,
          validVariables,
        );
        logTiming("✓ Variables resolved in messages");

        // STEP 4: Build chat config CLIENT-SIDE
        const chatConfig = buildChatConfig(resolvedMessages);
        logTiming("✓ Chat config built");

        // STEP 5: Prepare backend request
        const BACKEND_URL = BACKEND_URLS.production;

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (authToken) {
          headers["Authorization"] = `Bearer ${authToken}`;
        }

        logTiming("Initiating fetch to backend...");
        const fetchStartTime = performance.now();

        const fetchResponse = await fetch(
          `${BACKEND_URL}${ENDPOINTS.ai.chat}`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(chatConfig),
            signal: abortControllerRef.current.signal,
          },
        );

        logTiming(
          `✓ Response received (network: ${(performance.now() - fetchStartTime).toFixed(1)}ms)`,
        );

        if (!fetchResponse.ok) {
          throw new Error(
            `HTTP ${fetchResponse.status}: ${fetchResponse.statusText}`,
          );
        }

        if (!fetchResponse.body) {
          throw new Error("No response body");
        }

        // 🔥 BACKGROUND LOGGING: Fire-and-forget logging request (ZERO latency impact)
        // This happens in parallel with stream processing and doesn't block UI
        logTiming("🔥 Firing background logging request...");
        fetch(`/api/public/apps/${slug}/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            app_id: app.id,
            variables_provided: variables,
            variables_used: validVariables,
            fingerprint,
            chat_config: chatConfig,
            metadata: {
              timestamp: new Date().toISOString(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              model_id: chatConfig.ai_model_id,
              direct_api: true, // Flag to indicate this used direct API
            },
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            // Update guest limit in background when logging completes
            if (data.guest_limit) {
              guestLimit.refresh();
            }
          })
          .catch((err) => {
            // Silently handle logging errors - don't impact user experience
            console.debug("Background logging error (non-critical):", err);
          });

        // STEP 6: Process streaming NDJSON response using shared parser
        const { events } = parseNdjsonStream(
          fetchResponse,
          abortControllerRef.current.signal,
        );

        logTiming("Stream reader initialized, awaiting data...");

        for await (const event of events) {
          if (event.event === "chunk") {
            const chunkData = event.data as unknown as ChunkPayload;
            if (!firstTextReceived) {
              firstTextReceived = true;
              logTiming("FIRST TEXT CHUNK RECEIVED - TIME TO FIRST TOKEN");
            }
            setResponse((prev) => prev + chunkData.text);
          } else if (event.event === "end") {
            logTiming("Stream complete");
            setIsExecuting(false);
            setIsStreamComplete(true);
            if (executionTimeoutRef.current) {
              clearTimeout(executionTimeoutRef.current);
              executionTimeoutRef.current = null;
            }
          } else if (event.event === "error") {
            const errData = event.data as unknown as ErrorPayload;
            throw new Error(
              errData.user_message ||
                errData.message ||
                "Error during execution",
            );
          }
        }

        if (!isStreamComplete) {
          setIsStreamComplete(true);
        }
      } catch (err) {
        logTiming("❌ Error occurred");

        // Don't show error if request was aborted (user cancelled)
        if (err instanceof Error && err.name === "AbortError") {
          // Silently handle abort
        } else {
          setError({
            type: "execution_error",
            message:
              err instanceof Error ? err.message : "Unknown error occurred",
          });
        }
        setIsStreamComplete(true);
      } finally {
        setIsExecuting(false);
        // Clear timeout on completion
        if (executionTimeoutRef.current) {
          clearTimeout(executionTimeoutRef.current);
          executionTimeoutRef.current = null;
        }
      }
    },
    [
      app,
      authToken,
      guestLimit,
      validateVariables,
      resolveVariablesInMessages,
      buildChatConfig,
      isStreamComplete,
    ],
  );

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
            isStreaming={!isStreamComplete && isExecuting}
            isExecuting={isExecuting}
            error={error}
          />
        </PromptAppErrorBoundary>
      </div>
    </div>
  );
}
