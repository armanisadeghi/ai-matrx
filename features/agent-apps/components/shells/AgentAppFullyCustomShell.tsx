"use client";

/**
 * AgentAppFullyCustomShell — Tier-3 escape hatch.
 *
 * The whole UI lives in user-supplied React code (Babel sandbox, same
 * allowed-imports scope as Tier-2 slot overrides). Rather than the
 * stale `(onExecute, response, ...)` callback contract used by the
 * legacy renderer, custom apps here receive the full `useAgentApp()`
 * output as props — variables, setVariable, submit, response,
 * isStreaming, messages, loadConversation, etc. The legacy fields are
 * preserved as compatibility aliases so apps written against the old
 * shape (the three reference apps in sample-code/apps/) continue to
 * work without modification.
 *
 * Source resolution order: `slot_code.app` (preferred — populated by
 * the Phase-1a backfill and any new fully_custom apps) → legacy text
 * column `component_code` (still set on legacy rows). This means an
 * editor save to `slot_code.app` shadows `component_code` until the
 * latter is wiped, which is the migration path we want.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MoreHorizontalTapButton,
  StopTapButton,
} from "@ai-matrx/tap-target/buttons";
import { cancelExecution } from "@/features/agents/redux/execution-system/thunks/smart-execute.thunk";
import { APP_RUN_ERROR_TITLE } from "@/features/agent-apps/components/app-run-error";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useGuestLimit } from "@/hooks/useGuestLimit";
import { GuestLimitWarning } from "@/components/guest/GuestLimitWarning";
import { SignupConversionModal } from "@/components/guest/SignupConversionModal";
import { compileSlotComponent } from "@/features/agent-apps/utils/compile-slot";
import { AgentAppErrorBoundary } from "@/features/agent-apps/components/AgentAppErrorBoundary";
import PublicMessageOptionsMenu from "@/features/public-chat/components/PublicMessageOptionsMenu";
import MarkdownStream from "@/components/MarkdownStream";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useAgentApp } from "@/features/agent-apps/hooks/useAgentApp";
import type { UseAgentAppReturn } from "@/features/agent-apps/hooks/useAgentApp";
import { ContentTransferSurfaceProvider } from "@ai-matrx/design-system/content-transfer";
import { useAgentAppTracker } from "@/features/agent-apps/tracking/useAgentAppTracker";
import {
  isPageLeaving,
  recordRunOutcome,
  waitForRunOutcome,
} from "@/features/agent-apps/tracking/run-outcome";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { useWarmAgent } from "@/features/agents/hooks/useWarmAgent";
import type {
  AgentAppShellConfigCommon,
  PublicAgentApp,
} from "@/features/agent-apps/types";
import type { AgentAppSurfaceBinding } from "@/features/agent-apps/surface/agent-app-surface";
import {
  AgentAppMarkdownStream,
  AgentAppStreamProvider,
} from "@/features/agent-apps/components/shells/AgentAppMarkdownStreamBridge";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const HtmlPreviewModal = dynamic(
  () => import("@/features/html-pages/components/HtmlPreviewModal"),
  { ssr: false },
);

interface AgentAppFullyCustomShellProps {
  app: PublicAgentApp;
  /** Declared surface for this run (public route only) — see agent-app-surface.ts. */
  surface?: AgentAppSurfaceBinding;
}

export function AgentAppFullyCustomShell({
  app,
  surface,
}: AgentAppFullyCustomShellProps) {
  const config = (app.shell_config ?? {}) as AgentAppShellConfigCommon;
  const slotCode = (app.slot_code ?? {}) as Record<string, string | undefined>;
  const sourceCode = slotCode.app || app.component_code || "";

  // Compile once per source change. Failures surface inline rather than
  // crashing through the error boundary on every keystroke from the editor.
  const { Component: CustomApp, error: compileError } = useMemo(
    () =>
      compileSlotComponent({
        code: sourceCode,
        allowedImports: app.allowed_imports,
        scopeOverrides: {
          MarkdownStream: AgentAppMarkdownStream,
          Markdown: AgentAppMarkdownStream,
        },
      }),
    [sourceCode, app.allowed_imports],
  );

  const { isAuthenticated, fingerprintId } = useApiAuth();
  const guestLimit = useGuestLimit();

  // ── Tracking ──────────────────────────────────────────────────────────
  const { trackVisit, startRun } = useAgentAppTracker(app.id);
  const visitFiredRef = useRef(false);
  useEffect(() => {
    if (visitFiredRef.current) return;
    visitFiredRef.current = true;
    trackVisit();
  }, [trackVisit]);

  useEffect(() => {
    if (!fingerprintId) return;
    guestLimit.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprintId]);

  // ── Hook (Tier-3 contract) ────────────────────────────────────────────
  const ctx = useAgentApp({
    // See AgentAppFormToResultShell: the row carries the app's JOB.
    app,
    appId: app.id,
    autoRun: config.autoRun ?? false,
    allowChat: config.allowChat ?? true,
    surface,
  });

  // Warm the resolved winner, not the row's leftover pin. After cutover
  // the row's agent_id is display-stale; the holder is the truth.
  const pinnedVersionId =
    !ctx.useLatest && ctx.agentVersionId ? ctx.agentVersionId : null;
  useWarmAgent(pinnedVersionId ?? ctx.agentId ?? "", {
    isVersion: !!pinnedVersionId,
  });

  const [localError, setLocalError] = useState<string | null>(null);
  const store = useAppStore();
  const dispatch = useAppDispatch();

  // ── Legacy-compat onExecute / onResetConversation ──────────────────────
  // The three sample apps + many in-the-wild rows still use the old prop
  // contract. We preserve `onExecute(variables, userInput?)` so they keep
  // working; new apps should call ctx.submit(...) directly.
  const handleLegacyExecute = useCallback(
    async (
      variables: Record<string, unknown>,
      userInput?: string,
    ): Promise<void> => {
      setLocalError(null);

      if (!isAuthenticated && !guestLimit.allowed) {
        setLocalError(
          "You have reached the maximum number of free executions. Please sign up to continue.",
        );
        return;
      }

      const tracker = startRun(variables);
      try {
        const receipt = await ctx.submit({
          variables,
          text: userInput,
        });
        // Resolving is not success: the server may have refused the run.
        // Record what the request actually ended as (the screen already
        // shows its reason through ctx.error).
        const outcome = receipt
          ? await waitForRunOutcome(
              store,
              receipt.conversationId,
              receipt.requestIdsBefore,
            )
          : ({ kind: "pending" } as const);
        recordRunOutcome(tracker, outcome);
        guestLimit.refresh();
      } catch (err) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError") return;
        // The page is reloading or leaving: the run lives on server-side and
        // the reopened page rejoins it — never record it as failed.
        if (isPageLeaving()) return;
        const msg = e?.message ?? "Execution failed";
        setLocalError(msg);
        tracker.error({
          errorType: "execution_error",
          errorMessage: msg,
        });
      }
    },
    [ctx, guestLimit, isAuthenticated, startRun, store],
  );

  // ── Action bar (copy / canvas / preview) ──────────────────────────────
  const { open: openCanvas } = useCanvas();
  const [htmlPreviewOpen, setHtmlPreviewOpen] = useState(false);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState("");
  const [htmlPreviewTitle, setHtmlPreviewTitle] = useState("");
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

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
      data: { html: ctx.response },
      metadata: {
        title: app.name || "Response",
        sourceMessageId: ctx.conversationId ?? undefined,
      },
    });
  }, [openCanvas, ctx.response, app.name, ctx.conversationId]);

  // The finished bar is for a FINISHED result only — never while a run is
  // live, held, or being rejoined after a reload (it used to show beside the
  // still-generating answer).
  const isLive = ctx.isStreaming || ctx.isExecuting || ctx.isRestoringRun;
  const showActionBar = !isLive && ctx.response.length > 0;
  // What the run was asked, for the live bar ("Checking: …" in the app's own
  // words is the app's; the host says what it is working on).
  const liveInput = Object.values(ctx.variables ?? {}).find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  const stopRun = () => {
    if (ctx.conversationId) void dispatch(cancelExecution(ctx.conversationId));
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (!sourceCode) {
    return (
      <AgentAppTransferBoundary handle={ctx.surfaceHandle}>
        <DefaultFallback
          app={app}
          ctx={ctx}
          onLegacyExecute={handleLegacyExecute}
          localError={localError}
          setLocalError={setLocalError}
        />
      </AgentAppTransferBoundary>
    );
  }

  if (compileError) {
    return (
      <AgentAppTransferBoundary handle={ctx.surfaceHandle}>
        <div className="p-6 max-w-2xl mx-auto">
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium mb-1">App failed to compile</div>
              <pre className="whitespace-pre-wrap font-mono text-xs opacity-80">
                {compileError}
              </pre>
            </div>
            <ErrorAlchemyMenu />
          </div>
        </div>
      </AgentAppTransferBoundary>
    );
  }

  if (!CustomApp) {
    return (
      <AgentAppTransferBoundary handle={ctx.surfaceHandle}>
        {null}
      </AgentAppTransferBoundary>
    );
  }

  const error = localError ?? ctx.error;

  // An app's own `autoFocus` lit its field's focus ring on an idle first
  // paint, which a stranger read as an error (page-pass /p/[slug]). Release
  // that programmatic first-paint focus; a click or Tab focuses normally.
  const appRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const focused = document.activeElement;
      if (
        focused instanceof HTMLElement &&
        appRootRef.current?.contains(focused) &&
        focused.matches("textarea, input")
      ) {
        focused.blur();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Hook-contract props (Tier-3 idiomatic).
  const hookProps = ctx as unknown as Record<string, unknown>;

  // Legacy-contract aliases (for apps written against the old shape).
  const legacyProps = {
    onExecute: handleLegacyExecute,
    response: ctx.response,
    streamEvents: [],
    isStreaming: ctx.isStreaming,
    isExecuting: ctx.isExecuting,
    // `type` is rendered as the error's HEADING by every template and sample
    // app (`{error.type}`), so it is a sentence a person reads, never a code.
    error: error ? { type: APP_RUN_ERROR_TITLE, message: error } : null,
    rateLimitInfo: !isAuthenticated
      ? { remaining: guestLimit.remaining, total: 5 }
      : null,
    conversationId: ctx.conversationId,
    onResetConversation: () => ctx.startNewRun(),
    appName: app.name,
    appTagline: app.tagline,
    appCategory: app.category,
    // The reopened run's input — so a refresh never loses what was typed.
    initialVariables: ctx.variables,
  };

  return (
    <AgentAppTransferBoundary handle={ctx.surfaceHandle}>
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

        <div ref={appRootRef} className="flex-1 overflow-auto">
          {/* A finished result keeps its title and its actions at the TOP as
              well as the bottom: a long answer never hides what it is, how to
              copy it, or how to run the app again (page-pass /p/[slug]). */}
          {/* Public page only: in the management workspace the route header
              already names the app, so a second title there is a duplicate
              and the bottom bar carries the actions. */}
          {showActionBar && surface && (
            <AppResultBar
              appName={app.name}
              response={ctx.response}
              onStartOver={ctx.startNewRun}
              className="border-b"
            />
          )}
          <AgentAppErrorBoundary appName={app.name}>
            <AgentAppStreamProvider
              value={{
                response: ctx.response,
                requestId: ctx.requestId,
                conversationId: ctx.conversationId,
                isStreaming: ctx.isStreaming,
              }}
            >
              {/* Remounted on "Start over" so the app returns to its first screen. */}
              {/* Remounted on "Start over" (runKey), and once a reopened run
                  has loaded (isRestoringRun → false) so the app seeds its
                  inputs from `initialVariables`. */}
              <CustomApp
                key={`${ctx.runKey}:${ctx.isRestoringRun ? "restoring" : "ready"}`}
                {...hookProps}
                {...legacyProps}
              />
            </AgentAppStreamProvider>
          </AgentAppErrorBoundary>
        </div>

        {isLive && ctx.conversationId && (
          // The host's live bar: what is running, and a Stop that cancels the
          // request (server included) — the run is then recorded as cancelled.
          <div
            data-testid="app-live-bar"
            className="matrx-touch-targets flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-t border-border/40"
          >
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {ctx.isRestoringRun ? "Reopening your run" : "Generating"}
              {liveInput ? ` — ${liveInput}` : "…"}
            </p>
            <StopTapButton onClick={stopRun} ariaLabel="Stop this run" tooltip="Stop" label="Stop" />
          </div>
        )}

        {showActionBar && (
          <div className="matrx-touch-targets flex-shrink-0 flex items-center gap-1 px-3 py-1.5 border-t border-border/40">
            {/* The canonical Copy / Copy-for-AI pair over the finished result. */}
            <CopyButtons
              size="icon"
              label={`${app.name || "App"} result`}
              human={() => ctx.response}
              agent={() =>
                `Result from the "${app.name || "agent"}" app:\n\n${ctx.response}`
              }
            />
            <StartOverButton onStartOver={ctx.startNewRun} />
            <MoreHorizontalTapButton
              ref={moreButtonRef}
              onClick={() => setIsOptionsOpen(true)}
              ariaLabel="More options"
              tooltip="More options"
            />
          </div>
        )}

        <PublicMessageOptionsMenu
          isOpen={isOptionsOpen}
          onClose={() => setIsOptionsOpen(false)}
          content={ctx.response}
          anchorElement={moreButtonRef.current}
          onShowHtmlPreview={handleShowHtmlPreview}
          onOpenCanvas={handleOpenCanvas}
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
    </AgentAppTransferBoundary>
  );
}

function StartOverButton({ onStartOver }: { onStartOver: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onStartOver} className="gap-1.5">
      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
      Start over
    </Button>
  );
}

/** The app's name plus the result's actions, shown above a finished result. */
function AppResultBar({
  appName,
  response,
  onStartOver,
  className,
}: {
  appName: string;
  response: string;
  onStartOver: () => void;
  className?: string;
}) {
  const name = appName?.trim() || "App";
  return (
    <div
      className={`flex items-center gap-2 border-border/40 px-3 py-1.5 ${className ?? ""}`}
    >
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {name}
      </h1>
      <CopyButtons
        size="icon"
        label={`${name} result`}
        human={() => response}
        agent={() => `Result from the "${name}" app:\n\n${response}`}
      />
      <StartOverButton onStartOver={onStartOver} />
    </div>
  );
}

function AgentAppTransferBoundary({
  handle,
  children,
}: {
  handle: UseAgentAppReturn["surfaceHandle"];
  children: React.ReactNode;
}) {
  return handle ? (
    <ContentTransferSurfaceProvider handle={handle}>
      {children}
    </ContentTransferSurfaceProvider>
  ) : (
    children
  );
}

interface DefaultFallbackProps {
  app: PublicAgentApp;
  ctx: ReturnType<typeof useAgentApp>;
  onLegacyExecute: (
    variables: Record<string, unknown>,
    userInput?: string,
  ) => Promise<void>;
  localError: string | null;
  setLocalError: (next: string | null) => void;
}

/** Used when an app row is shell_kind='fully_custom' but has no source. */
function DefaultFallback({
  app,
  ctx,
  onLegacyExecute,
  localError,
  setLocalError,
}: DefaultFallbackProps) {
  const error = localError ?? ctx.error;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{app.name}</h1>
        {app.tagline && <p className="text-muted-foreground">{app.tagline}</p>}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive mb-1">Error</p>
            <p className="text-sm text-destructive/80">{error} <ErrorAlchemyMenu error={error} /></p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <button
          onClick={() => onLegacyExecute({})}
          disabled={ctx.isExecuting}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {ctx.isExecuting ? "Running..." : "Run"}
        </button>
      </div>

      {ctx.response && (
        <div className="bg-textured">
          <MarkdownStream imagePolicy="ai"
            content={ctx.response}
            isStreamActive={ctx.isStreaming}
            onError={(err) => setLocalError(err)}
            requestId={ctx.requestId ?? undefined}
            conversationId={ctx.conversationId ?? undefined}
          />
        </div>
      )}
    </div>
  );
}
