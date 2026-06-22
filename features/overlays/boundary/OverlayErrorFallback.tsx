"use client";

/**
 * OverlayErrorFallback
 *
 * The canonical error UI rendered by {@link OverlayErrorBoundary} when a lazily
 * loaded overlay throws (almost always a `next/dynamic` chunk-load failure in
 * production). It guarantees the overlay area shows a meaningful, actionable
 * error instead of nothing.
 *
 * Actions (never a dead end — the user is NEVER forced to reload to escape):
 *   - "Close" — dismisses just this overlay instance (the controller's
 *     `closeOverlay`) and returns to the app. Shown whenever an `onClose` is
 *     threaded down from the controller.
 *   - "Try again" (primary) — re-mounts the boundary with a fresh dynamic
 *     import. Because the agent runner's typed request lives in Redux keyed by
 *     conversationId (NOT in the unmounted React tree), a successful retry
 *     brings the user's message back intact.
 *   - "Reload page" (last resort) — the hard fix for a genuinely stale chunk.
 *
 * Two audiences:
 *   - Everyone: a clear message + the actions above.
 *   - Admins: the in-flight agent request (the exact text that was being sent,
 *     so it's visible/copyable and provably not lost), a deploy-skew banner when
 *     detected, plus an expandable view of the TARGETED diagnostics (error,
 *     component stack, failing module, build id, ?dpl= ids, failed/pending
 *     chunks, connection, overlay-relevant Redux slices, and live agent
 *     execution state) — and a "Copy for AI" button that packages it all into
 *     the standard xml envelope. NOT a full Redux dump; for a chunk failure
 *     that's noise.
 */

import * as React from "react";
import {
  AlertTriangle,
  RotateCw,
  RefreshCcw,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import {
  buildOverlayErrorAgentPayload,
  buildOverlayErrorHuman,
  normalizeError,
  safeStringify,
  type OverlayErrorContext,
} from "@/features/overlays/boundary/overlayErrorReport";
import { collectOverlayDiagnostics } from "@/features/overlays/boundary/overlayDiagnostics";

export interface OverlayErrorFallbackProps {
  modulePath: string | null;
  error: unknown;
  componentStack: string | null;
  /** Re-mount the boundary's children (retry the dynamic import). */
  onReset: () => void;
  /**
   * Dismiss the overlay entirely (the controller's `closeOverlay`). When
   * provided, a "Close" button is shown so the user is never forced to reload
   * the whole page just to escape a failed panel.
   */
  onClose?: () => void;
}

export function OverlayErrorFallback({
  modulePath,
  error,
  componentStack,
  onReset,
  onClose,
}: OverlayErrorFallbackProps) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const store = useAppStore();
  const [expanded, setExpanded] = React.useState(false);

  console.log(
    "[Track Overlay] B7, OverlayErrorFallback.tsx — error fallback rendered (user sees a meaningful error)",
    { modulePath, isAdmin },
  );

  const e = normalizeError(error);

  const ctx: OverlayErrorContext = {
    modulePath,
    error,
    componentStack,
    isAdmin,
    getReduxState: () => store.getState(),
  };

  // Deploy-skew detection runs for everyone (cheap, browser-only) so we can show
  // the right recovery hint; the heavier sectioned dump is admin + on-expand.
  const diag = collectOverlayDiagnostics(isAdmin ? store.getState() : null);
  const skewSuspected = diag.deploy.deploymentSkewSuspected;

  // The user's work at risk: any conversation carrying a typed-but-unsent
  // request. Surfaced inline (admins) so they can SEE and copy the exact
  // message that was in flight when the panel crashed — never silently lost.
  const pendingRequests = isAdmin
    ? diag.agentExecution.conversations.filter((c) => c.hasPendingInput)
    : [];

  const adminDump =
    isAdmin && expanded
      ? safeStringify({
          error: { name: e.name, message: e.message, stack: e.stack },
          failedModule: modulePath,
          componentStack,
          deploy: diag.deploy,
          network: diag.network,
          overlayState: diag.overlayState,
          appContext: diag.appContext,
          agentExecution: diag.agentExecution,
          user: diag.user,
        })
      : null;

  return (
    <div className="fixed inset-0 z-[2147483001] flex items-center justify-center p-4 pointer-events-none">
      <div className="pointer-events-auto flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-destructive/40 bg-card shadow-[var(--elevation-3)]">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              This panel failed to load
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {e.isChunkLoadError
                ? "The panel's code couldn't be downloaded — usually a stale build or cached file after a deploy. Reloading the page almost always fixes it."
                : "Something went wrong while rendering this panel."}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {skewSuspected && (
            <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              <span className="font-semibold text-warning">
                Deployment skew detected.
              </span>{" "}
              The page&apos;s scripts disagree on their deployment id
              {diag.deploy.deploymentIdsOnPage.length
                ? ` (${diag.deploy.deploymentIdsOnPage.join(", ")})`
                : ""}
              . This tab was likely open across a deploy — reloading pulls a
              fresh, consistent set of chunks.
            </div>
          )}

          {pendingRequests.length > 0 && (
            <div className="mb-3 rounded-lg border border-info/40 bg-info/10 px-3 py-2 text-xs">
              <p className="font-semibold text-foreground">
                Your message wasn&apos;t lost.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Use{" "}
                <span className="font-medium text-foreground">Try again</span>{" "}
                to reopen this panel with your text intact. A copy is preserved
                below in case you want it.
              </p>
              {pendingRequests.map((c) => (
                <pre
                  key={c.conversationId}
                  className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-background/70 px-2 py-1.5 text-[11px] leading-relaxed text-foreground"
                >
                  {c.inputText}
                  {c.inputTextTruncated ? "\n… (truncated)" : ""}
                </pre>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-muted px-3 py-2 font-mono text-xs text-foreground">
            <span className="text-destructive">{e.name}</span>: {e.message}
          </div>
          {modulePath && (
            <p
              className="mt-2 truncate text-[11px] text-muted-foreground"
              title={modulePath}
            >
              Module: {modulePath}
            </p>
          )}

          {isAdmin && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {expanded ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                Admin diagnostics (deploy / chunk / overlay state)
              </button>
              {expanded && adminDump && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  {adminDump}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          {isAdmin ? (
            <CopyButtons
              size="sm"
              label="Overlay error"
              human={() => buildOverlayErrorHuman(ctx)}
              agent={() => buildOverlayErrorAgentPayload(ctx)}
            />
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {onClose && (
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                onClick={onClose}
                title="Close this panel and return to the app (no reload)"
              >
                <X className="h-3.5 w-3.5" />
                Close
              </Button>
            )}
            <Button
              size="sm"
              variant="default"
              className="gap-1.5"
              onClick={onReset}
              title="Reload just this panel — keeps your typed request"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Try again
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => window.location.reload()}
              title="Last resort — reloads the whole page and loses unsaved work"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Reload page
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OverlayErrorFallback;
