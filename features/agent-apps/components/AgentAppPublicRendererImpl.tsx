"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import dynamic from "next/dynamic";
import { transform } from "@babel/standalone";
import { AlertCircle, Copy, Check, MoreHorizontal } from "lucide-react";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useGuestLimit } from "@/hooks/useGuestLimit";
import { GuestLimitWarning } from "@/components/guest/GuestLimitWarning";
import { SignupConversionModal } from "@/components/guest/SignupConversionModal";
import {
  buildComponentScope,
  getScopeFunctionParameters,
  patchScopeForMissingIdentifiers,
} from "../utils/allowed-imports";
import { AgentAppErrorBoundary } from "./AgentAppErrorBoundary";
import MarkdownStream from "@/components/MarkdownStream";
import PublicMessageOptionsMenu from "@/features/public-chat/components/PublicMessageOptionsMenu";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type { PublicAgentApp } from "../types";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  selectAccumulatedText,
  selectRequest,
  selectPrimaryRequest,
} from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useWarmAgent } from "@/features/agents/hooks/useWarmAgent";
import { SHELL_REGISTRY } from "./shells";
import { useAgentAppTracker } from "../tracking/useAgentAppTracker";

const HtmlPreviewModal = dynamic(
  () => import("@/features/html-pages/components/HtmlPreviewModal"),
  { ssr: false },
);

interface AgentAppPublicRendererProps {
  app: PublicAgentApp;
  slug: string;
  TestComponent?: React.ComponentType<{
    onExecute: (
      variables: Record<string, unknown>,
      userInput?: string,
    ) => Promise<void>;
    response: string;
    streamEvents: TypedStreamEvent[];
    isStreaming: boolean;
    isExecuting: boolean;
    error: unknown;
    rateLimitInfo: { remaining: number; total: number } | null;
    conversationId: string | null;
    onResetConversation: () => void;
  }>;
}

export function AgentAppPublicRenderer({
  app,
  slug,
  TestComponent,
}: AgentAppPublicRendererProps) {
  // Phase 1c dispatch: if the app row declares a shell, look it up in the
  // registry and render that — bypasses the legacy custom-component path
  // entirely. Falls through to the original renderer for fully_custom or
  // when TestComponent is provided (code-preview adapter).
  const shellKind = (app as { shell_kind?: string }).shell_kind;
  if (
    !TestComponent &&
    shellKind &&
    shellKind !== "fully_custom" &&
    SHELL_REGISTRY[shellKind as keyof typeof SHELL_REGISTRY]
  ) {
    const Shell =
      SHELL_REGISTRY[shellKind as keyof typeof SHELL_REGISTRY]!;
    return <Shell app={app} />;
  }

  return <CustomComponentRenderer app={app} slug={slug} TestComponent={TestComponent} />;
}

function CustomComponentRenderer({
  app,
  slug,
  TestComponent,
}: AgentAppPublicRendererProps) {
  const dispatch = useAppDispatch();

  const [isExecuting, setIsExecuting] = useState(false);
  const [localError, setLocalError] = useState<
    { type: string; message: string } | null
  >(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const { isAuthenticated, fingerprintId } = useApiAuth();

  // Streaming state is owned by Redux (active-requests slice). We capture
  // `conversationId` synchronously via the launcher's `onConversationCreated`
  // callback (fires immediately after instance creation, well before the
  // stream starts), then derive the active requestId from
  // `selectPrimaryRequest`. Reading by requestId from the awaited launcher
  // result would be wrong here — the launcher awaits the entire stream
  // before resolving, so by then there's nothing left to subscribe to.
  const primaryRequest = useAppSelector((state) =>
    conversationId ? selectPrimaryRequest(conversationId)(state) : undefined,
  );
  const requestId = primaryRequest?.requestId ?? null;

  const responseText = useAppSelector((state) =>
    requestId ? selectAccumulatedText(requestId)(state) : "",
  );
  const request = useAppSelector((state) =>
    requestId ? selectRequest(requestId)(state) : undefined,
  );
  const requestStatus = request?.status;
  const isStreaming = requestStatus === "streaming";
  const isStreamComplete = requestStatus === "complete";
  const requestError =
    requestStatus === "error"
      ? {
          type: "stream_error",
          message:
            (request as unknown as { errorMessage?: string })?.errorMessage ??
            "Agent execution failed",
        }
      : null;
  const error = localError ?? requestError;

  // streamEvents is preserved in the prop contract for legacy custom UIs but
  // is intentionally empty — Redux exposes higher-level render blocks instead.
  // The standard templates only consume `response`, not raw events.
  const streamEvents: TypedStreamEvent[] = useMemo(() => [], []);

  const guestLimit = useGuestLimit();

  useEffect(() => {
    if (!fingerprintId) return;
    guestLimit.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprintId]);

  // Non-blocking execution tracking — writes a row to `aga_executions` for
  // every visit/run/complete/error. Tracker fires fetch with keepalive:true
  // and never awaits; nothing here can delay the agent dispatch path.
  const { trackVisit, startRun } = useAgentAppTracker(app.id);
  const visitFiredRef = useRef(false);
  useEffect(() => {
    // Dedupe across React strict-mode double-mount in dev. One row per
    // page open is the correct shape; effects that re-run after route
    // changes mount a fresh component (different ref instance), so the
    // ref does not bleed visits between routes.
    if (visitFiredRef.current) return;
    visitFiredRef.current = true;
    trackVisit();
  }, [trackVisit]);

  // No local cleanup needed: Redux owns the request lifecycle and the
  // launcher attaches its own AbortController per conversation.

  // Pre-warm the agent on the configured backend. Fires on idle (after
  // hydration / first paint) so it never competes with the page's render
  // path. If the user submits before the warm completes, the real call
  // simply finds the cache populated; no race.
  const pinnedVersionId =
    !app.use_latest && app.agent_version_id ? app.agent_version_id : null;
  useWarmAgent(pinnedVersionId ?? app.agent_id, {
    isVersion: !!pinnedVersionId,
  });

  const validateVariables = useCallback(
    (variables: Record<string, unknown>) => {
      const errors: string[] = [];
      const valid: Record<string, unknown> = {};
      const schema = app.variable_schema;

      if (!Array.isArray(schema)) {
        return { validVariables: variables, validationErrors: [] };
      }

      for (const schemaItem of schema) {
        const { name, required, type, default: defaultValue } = schemaItem as {
          name: string;
          required?: boolean;
          type?: string;
          default?: unknown;
        };

        if (required && !(name in variables)) {
          if (defaultValue !== undefined) {
            valid[name] = defaultValue;
          } else {
            errors.push(`Missing required variable: ${name}`);
          }
        } else if (name in variables) {
          const value = variables[name];
          const normalizedType = type === "text" ? "string" : type;

          if (normalizedType === "string" || !normalizedType) {
            valid[name] = String(value);
          } else if (normalizedType === "number") {
            const numValue =
              typeof value === "number" ? value : Number(value);
            valid[name] = Number.isNaN(numValue) ? 0 : numValue;
          } else if (normalizedType === "boolean") {
            valid[name] = Boolean(value);
          } else {
            valid[name] = value;
          }
        } else if (defaultValue !== undefined) {
          valid[name] = defaultValue;
        }
      }

      return { validVariables: valid, validationErrors: errors };
    },
    [app.variable_schema],
  );

  const resetConversation = useCallback(() => {
    setConversationId(null);
    setLocalError(null);
  }, []);

  const handleExecute = useCallback(
    async (variables: Record<string, unknown>, userInput?: string) => {
      setIsExecuting(true);
      setLocalError(null);

      let runTracker: ReturnType<typeof startRun> | null = null;

      try {
        const { validVariables, validationErrors } =
          validateVariables(variables);

        if (validationErrors.length > 0) {
          setLocalError({
            type: "execution_error",
            message: validationErrors.join("; "),
          });
          return;
        }

        if (!isAuthenticated && !guestLimit.allowed) {
          setLocalError({
            type: "execution_error",
            message:
              "You have reached the maximum number of free executions. Please sign up to continue.",
          });
          return;
        }

        // Delegate to the canonical agent-execution path. `launchAgentExecution`
        // owns: URL routing (/ai/agents/{id} vs /ai/conversations/{id}),
        // is_new / is_version flags, auth headers (Bearer for authed, fingerprint
        // for guests via the API client), conversation creation, request lifecycle,
        // and NDJSON streaming into Redux. The renderer just consumes the resulting
        // `requestId` via selectors above (`responseText`, `requestStatus`, etc).
        //
        // displayMode "direct" = caller (this renderer + the user's TSX) owns the
        // UI surface; the launcher does not open any overlay/modal.
        if (process.env.NODE_ENV !== "production") {
          console.log("[AgentApp] launchAgentExecution", {
            agent_id: app.agent_id,
            slug,
            isAuthenticated,
            fingerprintId,
            variables: validVariables,
          });
        }

        // Fire run_start tracking BEFORE dispatch but on the same tick.
        // The tracker never awaits, so this is sub-microsecond — the
        // dispatch below kicks off in the same JS turn. The taskId we get
        // back is what we'll send on completion/error.
        runTracker = startRun(validVariables);

        await dispatch(
          launchAgentExecution({
            agentId: app.agent_id,
            surfaceKey: `agent-app:${slug}`,
            sourceFeature: "agent-app",
            config: {
              displayMode: "direct",
              // Without this the launcher creates the conversation + sets it
              // ready, but returns without dispatching executeInstance — see
              // launch-agent-execution.thunk.ts step 5. Agent apps always want
              // immediate execution on submit; there is no manual "Run" button
              // separate from the form.
              autoRun: true,
            },
            runtime: {
              userInput,
              variables: validVariables,
            },
            // Capture conversationId synchronously, before the stream starts.
            // The launcher's awaited promise doesn't resolve until the stream
            // has fully completed (see pollForCompletion in
            // launch-agent-execution.thunk.ts step 5), so subscribing by the
            // post-await result would mean the renderer never sees the
            // streaming text — only the final blob. Setting conversationId
            // here lets selectPrimaryRequest pick up the live request and
            // selectAccumulatedText stream the text into the UI.
            onConversationCreated: (id) => setConversationId(id),
          }),
        ).unwrap();

        runTracker.complete();
        guestLimit.refresh();
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError") {
          // User aborted: leave the run row at success=NULL on purpose.
          // Analytics treats abandoned in-flight rows as a distinct signal
          // from outright errors.
        } else {
          const errMsg = e?.message || "Execution failed";
          setLocalError({ type: "execution_error", message: errMsg });
          runTracker?.error({
            errorType: "execution_error",
            errorMessage: errMsg,
          });
        }
      } finally {
        setIsExecuting(false);
      }
    },
    [
      app.agent_id,
      slug,
      isAuthenticated,
      fingerprintId,
      guestLimit,
      validateVariables,
      dispatch,
      startRun,
    ],
  );

  const CustomUIComponent = useMemo(() => {
    if (TestComponent) return TestComponent;
    if (!app.component_code) return null;

    try {
      let processedCode = app.component_code.replace(
        /import\s+.*?from\s+['"].*?['"];?\s*/g,
        "",
      );

      const babelResult = transform(processedCode, {
        presets: ["react", "typescript"],
        filename: "component.tsx",
      });

      let transformed = babelResult.code || "";

      transformed = transformed.replace(/export\s+default\s+/g, "return ");

      const scope = buildComponentScope(
        (app.allowed_imports as unknown) ?? [],
      );

      if (transformed) {
        patchScopeForMissingIdentifiers(transformed, scope);
      }

      const { paramNames, paramValues } = getScopeFunctionParameters(scope);

      const componentFactory = new Function(...paramNames, transformed);
      const Component = componentFactory(...paramValues);

      return Component as React.ComponentType<Record<string, unknown>>;
    } catch (err) {
      console.error("Failed to transform custom UI:", err);
      return null;
    }
  }, [app.component_code, app.allowed_imports, TestComponent]);

  // responseText is already derived from Redux above (selectAccumulatedText).
  // The old local-streamEvents → text reduction is gone with the bespoke fetch.

  const { open: openCanvas } = useCanvas();

  const [htmlPreviewOpen, setHtmlPreviewOpen] = useState(false);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState("");
  const [htmlPreviewTitle, setHtmlPreviewTitle] = useState("");

  const handleShowHtmlPreview = useCallback(
    (html: string, title?: string) => {
      setHtmlPreviewContent(html);
      setHtmlPreviewTitle(title || app.name || "HTML Preview");
      setHtmlPreviewOpen(true);
    },
    [app.name],
  );

  const handleOpenCanvas = useCallback(() => {
    openCanvas({
      type: "html",
      data: { html: responseText },
      metadata: {
        title: app.name || "Response",
        sourceMessageId: conversationId ?? undefined,
      },
    });
  }, [openCanvas, responseText, app.name, conversationId]);

  const [isCopied, setIsCopied] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const handleCopy = useCallback(async () => {
    if (!responseText) return;
    try {
      await navigator.clipboard.writeText(responseText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // silently fail
    }
  }, [responseText]);

  const showActionBar = isStreamComplete && !!responseText;

  return (
    <div className="h-full flex flex-col">
      {guestLimit.showWarning && (
        <div className="flex-shrink-0 p-4">
          <GuestLimitWarning
            remaining={guestLimit.remaining}
            onDismiss={guestLimit.dismissWarning}
          />
        </div>
      )}

      <SignupConversionModal
        isOpen={guestLimit.showSignupModal}
        onClose={guestLimit.dismissSignupModal}
        totalUsed={guestLimit.totalUsed}
      />

      <div className="flex-1 overflow-auto">
        {CustomUIComponent ? (
          <AgentAppErrorBoundary appName={app.name}>
            <CustomUIComponent
              onExecute={handleExecute}
              response={responseText}
              streamEvents={streamEvents}
              isStreaming={!isStreamComplete && isExecuting}
              isExecuting={isExecuting}
              error={error}
              rateLimitInfo={
                !isAuthenticated
                  ? { remaining: guestLimit.remaining, total: 5 }
                  : null
              }
              conversationId={conversationId}
              onResetConversation={resetConversation}
            />
          </AgentAppErrorBoundary>
        ) : (
          <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold mb-2">{app.name}</h1>
              {app.tagline && (
                <p className="text-muted-foreground">{app.tagline}</p>
              )}
            </div>

            {error && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive mb-1">
                    Error
                  </p>
                  <p className="text-sm text-destructive/80">{error.message}</p>
                </div>
              </div>
            )}

            <div className="mb-6">
              <button
                onClick={() => handleExecute({})}
                disabled={isExecuting}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExecuting ? "Running..." : "Run"}
              </button>
            </div>

            {responseText && (
              <div className="bg-textured">
                <MarkdownStream
                  content={responseText}
                  isStreamActive={isExecuting && !isStreamComplete}
                  onError={(err) =>
                    setLocalError({ type: "render_error", message: err })
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>

      {showActionBar && (
        <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-t border-border/40">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
          <button
            ref={moreButtonRef}
            onClick={() => setIsOptionsOpen(true)}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="More options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <PublicMessageOptionsMenu
        isOpen={isOptionsOpen}
        onClose={() => setIsOptionsOpen(false)}
        content={responseText}
        anchorElement={moreButtonRef.current}
        onShowHtmlPreview={handleShowHtmlPreview}
        onOpenCanvas={handleOpenCanvas}
        onQuickHtmlShare={() => {}}
      />

      {htmlPreviewOpen && (
        <HtmlPreviewModal
          isOpen={htmlPreviewOpen}
          onClose={() => setHtmlPreviewOpen(false)}
          htmlContent={htmlPreviewContent}
          title={htmlPreviewTitle}
        />
      )}
    </div>
  );
}
