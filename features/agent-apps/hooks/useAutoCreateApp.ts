/**
 * Hook for Auto Creating Agent Apps
 *
 * Handles AI-driven generation of app metadata + component code, plus the
 * insert into `aga_apps`. Ported from `features/prompt-apps/hooks/useAutoCreateApp.ts`
 * with the data layer retargeted; the underlying generation step still uses
 * `executeBuiltinWith*Extraction` thunks (agent execution system under the hood).
 *
 * IMPORTANT: This hook includes protection against background tab failures.
 * Browser tabs that go to background can suspend network connections, causing
 * streaming to fail silently. This hook uses:
 * - Web Locks API to prevent tab suspension during long-running operations
 * - Visibility change detection to catch connection drops early
 * - Automatic retry logic for recoverable failures
 * - Clear error surfacing so failures are never silent
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { requireUserId } from "@/utils/auth/getUserId";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import {
  executeBuiltinWithCodeExtraction,
  executeBuiltinWithJsonExtraction,
} from "@/features/agents/redux/execution-system/thunks/execute-builtin-with-extraction.thunks";
import {
  validateSlugsInBatch,
  generateSlugCandidates,
} from "../services/slug-service";
import { getDefaultImportsForNewApps } from "../utils/allowed-imports";
import type { AppMetadata } from "../types";

export type AutoCreateMode = "standard" | "lightning";

interface UseAutoCreateAppOptions {
  onSuccess?: (appId: string) => void;
  onError?: (error: string, fullResponse?: string) => void;
}

interface AutoCreateAppData {
  /**
   * Source agent. Field is named `agent` to match the new domain language;
   * the underlying `prompt_object` builtin variable is still passed as a
   * JSON snapshot of the agent (which is what the AI generator expects).
   */
  agent: any;
  builtinVariables: {
    prompt_object: string;
    sample_response: string;
    input_fields_to_include: string;
    page_layout_format: string;
    response_display_component: string;
    response_display_mode: string;
    color_pallet_options: string;
    custom_instructions: string;
  };
  mode?: AutoCreateMode;
}

/**
 * Acquire a Web Lock to discourage the browser from freezing this tab.
 * Returns a release function. If Web Locks API is unavailable, returns a no-op.
 */
async function acquireWebLock(name: string): Promise<() => void> {
  if (typeof navigator === "undefined" || !navigator.locks) {
    return () => {};
  }

  let releaseLock: (() => void) | null = null;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // Request a lock and hold it until we call releaseLock()
  // This signals to the browser that this tab has important work in progress
  navigator.locks
    .request(name, { mode: "exclusive", ifAvailable: true }, async (lock) => {
      if (!lock) return; // Lock not available (another tab has it)
      await lockPromise;
    })
    .catch(() => {
      // Lock API not supported or failed - continue without it
    });

  return () => {
    releaseLock?.();
  };
}

export function useAutoCreateApp(options: UseAutoCreateAppOptions = {}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [codeTaskId, setCodeTaskId] = useState<string | null>(null);
  const [metadataTaskId, setMetadataTaskId] = useState<string | null>(null);
  const [wasBackgrounded, setWasBackgrounded] = useState(false);
  const [lastAttemptData, setLastAttemptData] =
    useState<AutoCreateAppData | null>(null);
  /** Full raw model response when code extraction fails — shown to user for diagnosis */
  const [errorFullResponse, setErrorFullResponse] = useState<string | null>(
    null,
  );
  /** Which stage is currently active: 'metadata' | 'code' | null */
  const [activeStage, setActiveStage] = useState<"metadata" | "code" | null>(
    null,
  );
  // Ref so the catch block can read the latest value synchronously
  const errorFullResponseRef = useRef<string | null>(null);

  // Refs for tracking background state during async operations
  const isCreatingRef = useRef(false);
  const tabWasHiddenDuringCreation = useRef(false);
  const creationStartTime = useRef<number>(0);

  // Stable refs for callback options to avoid useCallback dependency churn.
  // The options object is created inline by the consumer on every render,
  // so we capture the latest callbacks in refs instead.
  const onSuccessRef = useRef(options.onSuccess);
  const onErrorRef = useRef(options.onError);
  onSuccessRef.current = options.onSuccess;
  onErrorRef.current = options.onError;

  // Monitor tab visibility during creation
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isCreatingRef.current) {
        tabWasHiddenDuringCreation.current = true;
        console.warn(
          "[AutoCreateApp] Tab went to background during app creation",
        );
      }

      if (document.visibilityState === "visible" && isCreatingRef.current) {
        if (tabWasHiddenDuringCreation.current) {
          setWasBackgrounded(true);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const createApp = useCallback(
    async (data: AutoCreateAppData) => {
      setIsCreating(true);
      isCreatingRef.current = true;
      tabWasHiddenDuringCreation.current = false;
      creationStartTime.current = Date.now();
      setWasBackgrounded(false);
      setLastAttemptData(data);
      setProgress("Initializing AI generation...");

      // Acquire a Web Lock to discourage browser from freezing this tab
      const releaseLock = await acquireWebLock("auto-create-prompt-app");

      // Track whether we're navigating away on success so we don't reset state prematurely
      let navigatingAway = false;

      try {
        setErrorFullResponse(null);
        errorFullResponseRef.current = null;
        setMetadataTaskId(null);
        setCodeTaskId(null);
        setActiveStage("metadata");

        // Generate metadata first (fast)
        setProgress("Generating app metadata with AI...");

        const metadataResult = await dispatch(
          executeBuiltinWithJsonExtraction({
            builtinKey: "prompt-app-metadata-generator",
            variables: {
              prompt_config: data.builtinVariables.prompt_object,
            },
            timeoutMs: 180000,
            onTaskId: (id) => setMetadataTaskId(id),
          }),
        ).unwrap();

        if (!metadataResult.success) {
          const failureContext = tabWasHiddenDuringCreation.current
            ? " This may have failed because the browser tab was in the background. Please keep this tab active during app creation."
            : "";
          throw new Error(
            `Metadata generation failed: ${metadataResult.error}${failureContext}`,
          );
        }

        const metadata: AppMetadata = metadataResult.data;

        // Generate code second (slow - this is the most vulnerable to background tab issues)
        setActiveStage("code");
        setProgress("Generating app code with AI (this takes 1-2 minutes)...");

        const codeBuiltinKey =
          data.mode === "lightning"
            ? "prompt-app-auto-create-lightning"
            : "prompt-app-auto-create";

        const codeResult = await dispatch(
          executeBuiltinWithCodeExtraction({
            builtinKey: codeBuiltinKey,
            variables: data.builtinVariables,
            timeoutMs: 300000,
            onTaskId: (id) => setCodeTaskId(id),
          }),
        ).unwrap();

        if (!codeResult.success) {
          // Capture the full response so the UI can show what the model actually said
          const rawResponse = codeResult.fullResponse ?? null;
          errorFullResponseRef.current = rawResponse;
          setErrorFullResponse(rawResponse);

          const failureContext = tabWasHiddenDuringCreation.current
            ? " This may have failed because the browser tab was in the background. Please keep this tab active during app creation."
            : "";
          throw new Error(
            `Code generation failed: ${codeResult.error}${failureContext}`,
          );
        }

        // Prepare variable schema. Agents store their input contract in
        // `variable_definitions` (an array of {name, defaultValue, ...}); the
        // legacy prompt-apps form fed off `prompt.variable_defaults` which had
        // an identical shape. Try both names so callers can pass either.
        let variableSchema: any[] = [];
        const sourceDefs = Array.isArray(data.agent?.variable_definitions)
          ? data.agent.variable_definitions
          : Array.isArray(data.agent?.variable_defaults)
            ? data.agent.variable_defaults
            : null;
        if (sourceDefs) {
          variableSchema = sourceDefs.map((v: any) => ({
            name: v.name,
            type: "string",
            label: v.name
              .split("_")
              .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
            default: v.defaultValue || "",
            required: false,
          }));
        }

        // Validate slugs
        setProgress("Validating slug availability...");

        let selectedSlug: string;

        // Get slug options from metadata, or generate fallbacks from prompt name
        const slugOptions =
          Array.isArray(metadata.slug_options) &&
          metadata.slug_options.length > 0
            ? metadata.slug_options
            : generateSlugCandidates(
                data.agent?.name || metadata.name || "app",
              );

        try {
          const slugValidation = await validateSlugsInBatch(
            slugOptions.slice(0, 5),
          );

          if (slugValidation.available && slugValidation.available.length > 0) {
            selectedSlug = slugValidation.available[0];
          } else {
            // All slugs taken, add random number to first option
            selectedSlug = `${slugOptions[0]}-${Math.floor(Math.random() * 900) + 100}`;
          }
        } catch (slugError: any) {
          // Fallback: use first slug option with random number
          selectedSlug = `${slugOptions[0]}-${Math.floor(Math.random() * 900) + 100}`;
        }

        // Save to database
        setProgress("Saving app to database...");

        const userId = requireUserId();

        const { data: appData, error: insertError } = await (
          supabase as unknown as any
        )
          .schema("app")
          .from("definition")
          .insert({
            user_id: userId,
            // Canonical RLS std_insert on app.definition requires created_by = auth.uid().
            created_by: userId,
            agent_id: data.agent.id,
            agent_version_id: null,
            use_latest: true,
            slug: selectedSlug,
            name: metadata.name,
            tagline: metadata.tagline,
            description: metadata.description,
            category: metadata.category,
            tags: metadata.tags,
            component_code: codeResult.code!,
            component_language: "tsx",
            variable_schema: variableSchema,
            allowed_imports: getDefaultImportsForNewApps(),
            // The AI generator produces a full custom UI; mark the row so the
            // public renderer dispatches to AgentAppFullyCustomShell instead
            // of a built-in shell (which would ignore the generated code).
            shell_kind: "fully_custom",
            rate_limit_per_ip: 10,
            rate_limit_window_hours: 24,
            status: "draft",
          })
          .select()
          .single();

        if (insertError) {
          throw new Error(insertError.message || "Failed to save app");
        }

        if (!appData) {
          throw new Error("No data returned from database");
        }

        // Generate favicon in background (non-blocking)
        setProgress("Generating app icon...");
        try {
          await fetch("/api/agent-apps/generate-favicon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              appId: appData.id,
              name: metadata.name,
            }),
          });
        } catch (faviconError) {
          // Non-fatal — app was created, favicon can be regenerated later
          console.warn("Favicon generation failed:", faviconError);
        }

        setProgress("App created successfully!");

        onSuccessRef.current?.(appData.id);

        // Mark that we're navigating — finally block will skip state reset so
        // the success UI stays visible during the brief redirect delay
        navigatingAway = true;

        // Redirect to the Run page — that's the only thing the user wants
        // to see after creating the app. They can flip back to Overview /
        // Code / Settings from the sub-route header tabs.
        setTimeout(() => {
          router.push(`/agent-apps/${appData.id}/run`);
        }, 500);

        return appData;
      } catch (error: any) {
        const rawMessage = error.message || "An unexpected error occurred";

        // Enhance error message if tab was backgrounded
        let errorMessage = rawMessage;
        if (
          tabWasHiddenDuringCreation.current &&
          !rawMessage.includes("background")
        ) {
          errorMessage = `${rawMessage}. The browser tab was in the background during creation, which likely caused this failure. Please keep this tab active and try again.`;
        }

        console.error("[AutoCreateApp] Creation failed:", errorMessage);
        // Pass the full response (if any) so the UI can show what the model actually returned
        const capturedFullResponse = errorFullResponseRef.current;
        onErrorRef.current?.(errorMessage, capturedFullResponse ?? undefined);
        return null;
      } finally {
        // Always release the web lock
        releaseLock();
        isCreatingRef.current = false;

        // Only reset UI state on failure — on success we keep the spinner visible
        // until the router redirect unmounts this component
        if (!navigatingAway) {
          setIsCreating(false);
          setProgress("");
          setActiveStage(null);
        }
      }
    },
    [dispatch, router],
  );

  const retry = useCallback(() => {
    if (lastAttemptData) {
      createApp(lastAttemptData);
    }
  }, [lastAttemptData, createApp]);

  return {
    createApp,
    retry,
    isCreating,
    progress,
    codeTaskId,
    metadataTaskId,
    wasBackgrounded,
    canRetry: !isCreating && lastAttemptData !== null,
    /** Raw model response when code extraction fails — display to user for diagnosis */
    errorFullResponse,
    /** Which generation stage is currently active */
    activeStage,
  };
}
