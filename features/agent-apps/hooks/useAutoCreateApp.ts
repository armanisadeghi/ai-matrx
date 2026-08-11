/**
 * Hook for Auto Creating Agent Apps
 *
 * Handles AI-driven generation of app metadata + component code, plus the
 * insert into `aga_apps`. Ported from `features/prompt-apps/hooks/useAutoCreateApp.ts`
 * with the data layer retargeted; the underlying generation step still uses
 * `executeBuiltinWith*Extraction` thunks (agent execution system under the hood).
 *
 * 🚨 THE INVARIANT: a paid generation is persisted BEFORE any step that can
 * fail. The metadata run lands in an `app.definition` draft row immediately;
 * the generated TSX is written to that same row as the first statement after
 * the code run resolves; only then does the attempt finalize. Slug throws, RLS
 * rejections, network blips, and closed tabs can no longer destroy a run the
 * user paid for. See `../services/auto-create-draft.ts`.
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
import {
  executeBuiltinWithCodeExtraction,
  executeBuiltinWithJsonExtraction,
} from "@/features/agents/redux/execution-system/thunks/execute-builtin-with-extraction.thunks";
import {
  validateSlugsInBatch,
  generateSlugCandidates,
} from "../services/slug-service";
import {
  createGenerationDraft,
  draftRecoveryHref,
  finalizeDraft,
  recordDraftFailure,
  saveDraftCode,
  type DraftHandle,
} from "../services/auto-create-draft";
import { getDefaultImportsForNewApps } from "../utils/allowed-imports";
import type { AppMetadata } from "../types";

export type AutoCreateMode = "standard" | "lightning";

interface UseAutoCreateAppOptions {
  onSuccess?: (appId: string) => void;
  onError?: (error: string, fullResponse?: string) => void;
}

function parseAppMetadata(data: unknown): AppMetadata {
  if (!data || typeof data !== "object") {
    throw new Error("Metadata generation returned invalid data");
  }
  const row = data as Record<string, unknown>;
  const slugOptions = row.slug_options;
  if (
    typeof row.name !== "string" ||
    typeof row.tagline !== "string" ||
    typeof row.description !== "string" ||
    !Array.isArray(slugOptions) ||
    !slugOptions.every((entry) => typeof entry === "string")
  ) {
    throw new Error("Metadata generation returned incomplete data");
  }
  return {
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    slug_options: slugOptions,
    category: typeof row.category === "string" ? row.category : null,
    tags: Array.isArray(row.tags)
      ? row.tags.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
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
 * Is this JSON snapshot genuinely carrying an agent, or is it the empty shell
 * `generateBuiltinVariables` emits when the agent hasn't loaded yet?
 *
 * Exported so callers (the auto-create form) can refuse to *start* a run for
 * the same reason the hook would refuse to run one.
 */
export function isEmptyJsonSnapshot(value: string | undefined | null): boolean {
  const trimmed = (value ?? "").trim();
  return (
    trimmed === "" ||
    trimmed === "{}" ||
    trimmed === "[]" ||
    trimmed === "null" ||
    trimmed === "undefined"
  );
}

/** True when `agent` is a real, loaded agent row we can safely generate from. */
export function isAgentPayloadReady(agent: unknown): boolean {
  if (!agent || typeof agent !== "object") return false;
  if (typeof (agent as { id?: unknown }).id !== "string") return false;
  if (!(agent as { id: string }).id) return false;
  try {
    return !isEmptyJsonSnapshot(JSON.stringify(agent));
  } catch {
    return false;
  }
}

/**
 * Thrown before a single token is spent when the generation payload is not
 * genuinely loaded. Message is user-facing — it lands in the form's ErrorCard.
 */
export const EMPTY_PAYLOAD_ERROR =
  "The agent hasn't finished loading, so there is nothing to build an app from. " +
  "Wait for the agent to load and try again.";

function assertGenerationPayloadReady(data: AutoCreateAppData): void {
  if (
    !isAgentPayloadReady(data.agent) ||
    isEmptyJsonSnapshot(data.builtinVariables?.prompt_object)
  ) {
    console.error(
      "[AutoCreateApp] Refused to launch a paid generation with an empty agent payload:",
      {
        agentId: (data.agent as { id?: unknown } | undefined)?.id ?? null,
        promptObjectLength: data.builtinVariables?.prompt_object?.length ?? 0,
      },
    );
    throw new Error(EMPTY_PAYLOAD_ERROR);
  }
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
  /** Draft row this attempt is writing to — the recovery door on any failure. */
  const [draftAppId, setDraftAppId] = useState<string | null>(null);
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
      // 🚨 Refuse to spend money on an empty payload. `generateBuiltinVariables`
      // stringifies whatever it is handed (`JSON.stringify(promptObject || {})`),
      // so a form that renders before its agent row has loaded produces a
      // perfectly well-formed run whose `prompt_object` is the string "{}" —
      // the model answers "the prompt object you pasted is empty" and the user
      // is billed for it (observed live 2026-08-11, D152). This guard sits
      // ABOVE every state write, dispatch, and draft insert so ANY caller is
      // protected, not just the auto-fire form.
      assertGenerationPayloadReady(data);

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
      // The durable row every paid generation is written to. Non-null from the
      // moment the metadata run is persisted.
      let draft: DraftHandle | null = null;

      try {
        setDraftAppId(null);
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

        const metadata = parseAppMetadata(metadataResult.data);

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

        // Validate slugs BEFORE the expensive code run — the draft row needs a
        // slug, and a slug throw must never be able to destroy a paid run.
        setProgress("Validating slug availability...");

        let selectedSlug: string;

        // Get slug options from metadata, or generate fallbacks from prompt name
        const slugOptions =
          Array.isArray(metadata.slug_options) &&
          metadata.slug_options.length > 0
            ? metadata.slug_options
            : generateSlugCandidates(data.agent?.name || metadata.name || "app");

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

        // Persist the paid metadata run NOW. Everything after this point
        // updates this row, so nothing that fails later can destroy a
        // generation the user paid for.
        setProgress("Saving draft...");

        const userId = requireUserId();

        draft = await createGenerationDraft({
          userId,
          agentId: data.agent.id,
          slug: selectedSlug,
          metadata,
          mode: data.mode ?? "standard",
          variableSchema,
          allowedImports: getDefaultImportsForNewApps(),
        });
        setDraftAppId(draft.appId);

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

        // FIRST thing after the paid code run resolves — nothing may run
        // between the generation and this write.
        setProgress("Saving generated code...");
        draft = await saveDraftCode(draft, codeResult.code!);

        // Everything that could still fail now runs against a row that already
        // holds the full generated component.
        setProgress("Finishing up...");
        await finalizeDraft(draft);

        // No favicon step: the app badge is computed at render time as a data:
        // URI from the app name (features/agent-apps/utils/favicon-metadata).
        setProgress("App created successfully!");

        const appId = draft.appId;
        onSuccessRef.current?.(appId);

        // Mark that we're navigating — finally block will skip state reset so
        // the success UI stays visible during the brief redirect delay
        navigatingAway = true;

        // Redirect to the Run page — that's the only thing the user wants
        // to see after creating the app. They can flip back to Overview /
        // Code / Settings from the sub-route header tabs.
        setTimeout(() => {
          router.push(`/agent-apps/${appId}/run`);
        }, 500);

        return appId;
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

        // A draft exists once the metadata run was persisted. Preserve whatever
        // was paid for on it and tell the user exactly where to find it —
        // "failed" alone would imply the generations are gone.
        if (draft) {
          await recordDraftFailure(draft, {
            error: rawMessage,
            rawResponse: errorFullResponseRef.current,
          });
          const hasCode = draft.progress.stage === "code";
          errorMessage =
            `${errorMessage} Your ${hasCode ? "generated app was" : "app details were"} saved as a draft — ` +
            `open it at ${draftRecoveryHref(draft.appId)} to recover it.`;
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
    if (!lastAttemptData) return;
    // createApp rejects (rather than reporting through onError) when the
    // payload guard fires — surface that instead of leaking an unhandled
    // rejection.
    void createApp(lastAttemptData).catch((error: unknown) => {
      onErrorRef.current?.(
        error instanceof Error ? error.message : String(error),
      );
    });
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
    /** Draft row holding this attempt's generations — set once metadata is persisted */
    draftAppId,
  };
}
