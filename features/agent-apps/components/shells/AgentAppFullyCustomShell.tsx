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
import { AlertCircle, Copy, Check, MoreHorizontal } from "lucide-react";
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
import { useAgentAppTracker } from "@/features/agent-apps/tracking/useAgentAppTracker";
import { useWarmAgent } from "@/features/agents/hooks/useWarmAgent";
import type {
  AgentAppShellConfigCommon,
  PublicAgentApp,
} from "@/features/agent-apps/types";

const HtmlPreviewModal = dynamic(
  () => import("@/features/html-pages/components/HtmlPreviewModal"),
  { ssr: false },
);

interface AgentAppFullyCustomShellProps {
  app: PublicAgentApp;
}

export function AgentAppFullyCustomShell({
  app,
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

  // Pre-warm the agent on idle (same path the legacy renderer used).
  const pinnedVersionId =
    !app.use_latest && app.agent_version_id ? app.agent_version_id : null;
  useWarmAgent(pinnedVersionId ?? app.agent_id, {
    isVersion: !!pinnedVersionId,
  });

  // ── Hook (Tier-3 contract) ────────────────────────────────────────────
  const ctx = useAgentApp({
    agentId: app.agent_id,
    agentVersionId: app.agent_version_id,
    useLatest: app.use_latest,
    appId: app.id,
    autoRun: config.autoRun ?? false,
    allowChat: config.allowChat ?? true,
  });

  const [localError, setLocalError] = useState<string | null>(null);

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
        await ctx.submit({
          variables,
          text: userInput,
        });
        tracker.complete();
        guestLimit.refresh();
      } catch (err) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError") return;
        const msg = e?.message ?? "Execution failed";
        setLocalError(msg);
        tracker.error({
          errorType: "execution_error",
          errorMessage: msg,
        });
      }
    },
    [ctx, guestLimit, isAuthenticated, startRun],
  );

  // ── Action bar (copy / canvas / preview) ──────────────────────────────
  const { open: openCanvas } = useCanvas();
  const [htmlPreviewOpen, setHtmlPreviewOpen] = useState(false);
  const [htmlPreviewContent, setHtmlPreviewContent] = useState("");
  const [htmlPreviewTitle, setHtmlPreviewTitle] = useState("");
  const [isCopied, setIsCopied] = useState(false);
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

  const handleCopy = useCallback(async () => {
    if (!ctx.response) return;
    try {
      await navigator.clipboard.writeText(ctx.response);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // silently fail
    }
  }, [ctx.response]);

  const showActionBar = !ctx.isStreaming && ctx.response.length > 0;

  // ── Render ────────────────────────────────────────────────────────────

  if (!sourceCode) {
    return (
      <DefaultFallback
        app={app}
        ctx={ctx}
        onLegacyExecute={handleLegacyExecute}
        localError={localError}
        setLocalError={setLocalError}
      />
    );
  }

  if (compileError) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-medium mb-1">App failed to compile</div>
            <pre className="whitespace-pre-wrap font-mono text-xs opacity-80">
              {compileError}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  if (!CustomApp) {
    return null;
  }

  const error = localError ?? ctx.error;

  // Hook-contract props (Tier-3 idiomatic).
  const hookProps = ctx as unknown as Record<string, unknown>;

  // Legacy-contract aliases (for apps written against the old shape).
  const legacyProps = {
    onExecute: handleLegacyExecute,
    response: ctx.response,
    streamEvents: [],
    isStreaming: ctx.isStreaming,
    isExecuting: ctx.isExecuting,
    error: error
      ? { type: "execution_error", message: error }
      : null,
    rateLimitInfo: !isAuthenticated
      ? { remaining: guestLimit.remaining, total: 5 }
      : null,
    conversationId: ctx.conversationId,
    onResetConversation: () => ctx.resetConversation(),
    appName: app.name,
    appTagline: app.tagline,
    appCategory: app.category,
  };

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
        <AgentAppErrorBoundary appName={app.name}>
          <CustomApp {...hookProps} {...legacyProps} />
        </AgentAppErrorBoundary>
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
        content={ctx.response}
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
        {app.tagline && (
          <p className="text-muted-foreground">{app.tagline}</p>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive mb-1">Error</p>
            <p className="text-sm text-destructive/80">{error}</p>
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
          <MarkdownStream
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
