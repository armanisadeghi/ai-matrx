"use client";

/**
 * BackendTargetPanel
 *
 * Admin/debug panel for the cloud-vs-sandbox routing of a single
 * conversation. Shows exactly which channel its outbound AI calls will
 * use, the resolved URL, and (when the override is active) the bearer
 * token expiry.
 *
 * Why this exists:
 *   - Sandbox-mode AI silently rewires this conversation's `/ai/*`
 *     calls from the central server to the in-container Python via the
 *     orchestrator proxy. That's invisible from the chat UI alone, so
 *     admins need a way to confirm which channel is live before
 *     filing a "the agent doesn't see my files" bug.
 *   - Lives inside `CreatorRunPanel` (admin-gated tab) so it doesn't
 *     surface to end users, but is one click away when debugging.
 *
 * It is read-only on purpose for now. Manual override controls (set an
 * arbitrary URL / paste a bearer token) are tracked for a follow-up;
 * the orchestrator's `proxy_url` + minted token already covers the
 * common case end-to-end.
 */

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceUIState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import type { BackendChannel } from "@/features/agents/redux/execution-system/thunks/resolve-base-url";
import {
  selectActiveSandboxId,
  selectActiveSandboxProxyUrl,
  selectEditorMode,
} from "@/features/code/redux/codeWorkspaceSlice";
import { cn } from "@/lib/utils";

interface BackendTargetPanelProps {
  conversationId: string;
}

function CopyableValue({
  value,
  mono = true,
  className,
}: {
  value: string;
  mono?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <span className={cn("flex items-center gap-1.5 min-w-0", className)}>
      <span
        className={cn(
          "truncate text-[11px] text-foreground",
          mono && "font-mono",
        )}
        title={value}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Copy"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-500" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1 border-b border-border/40 last:border-0">
      <span className="w-32 min-w-32 shrink-0 text-right text-[11px] text-muted-foreground">
        {label}
      </span>
      <span className="flex-1 min-w-0 text-[11px] text-foreground break-all">
        {children}
      </span>
    </div>
  );
}

function Pill({
  variant,
  children,
}: {
  variant: "active" | "muted" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    variant === "active"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      : variant === "warn"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wider",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function maskToken(token: string): string {
  if (token.length <= 12) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

function fmtCountdown(expSeconds: number | null): string {
  if (!expSeconds) return "—";
  const now = Math.floor(Date.now() / 1000);
  const remaining = expSeconds - now;
  if (remaining <= 0) return "expired";
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function BackendTargetPanel({
  conversationId,
}: BackendTargetPanelProps) {
  const instanceUI = useAppSelector(selectInstanceUIState(conversationId));
  const globalBaseUrl = useAppSelector(selectResolvedBaseUrl);
  const editorMode = useAppSelector(selectEditorMode);
  const activeSandboxId = useAppSelector(selectActiveSandboxId);
  const activeSandboxProxyUrl = useAppSelector(selectActiveSandboxProxyUrl);

  const overrideUrl = instanceUI?.serverOverrideUrl ?? null;
  const overrideToken = instanceUI?.serverOverrideAuthToken ?? null;
  const overrideTokenError = instanceUI?.serverOverrideAuthTokenError ?? null;

  // For display only — the runtime decision lives in resolveBackendForConversation.
  const channel: BackendChannel = overrideUrl ? "override" : "global";
  const effectiveUrl = overrideUrl ?? globalBaseUrl ?? "(unconfigured)";

  // We don't store exp in the slice (it would leak through devtools dumps).
  // The sandbox-token hook caches it locally; for the panel we approximate
  // by treating presence as "fresh" — close enough for an at-a-glance debug
  // view. A future revision can surface the exp via a small selector.
  const tokenStatus =
    channel === "override" ? (overrideToken ? "minted" : "missing") : "n/a";

  return (
    <div className="px-3 py-2 space-y-3">
      {/* Channel summary */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground">Channel:</span>
        {channel === "override" ? (
          <Pill variant="active">Sandbox proxy</Pill>
        ) : (
          <Pill variant="muted">Cloud server</Pill>
        )}
        <span className="text-[11px] text-muted-foreground">·</span>
        <span className="text-[11px] text-muted-foreground">Editor:</span>
        <Pill variant={editorMode === "sandbox" ? "active" : "muted"}>
          {editorMode}
        </Pill>
      </div>

      {/* Effective URL — the one the next AI call WILL hit. */}
      <div>
        <Row label="Effective URL">
          <CopyableValue value={effectiveUrl} />
        </Row>
        <Row label="Auth scheme">
          <span>Bearer (Supabase JWT)</span>
        </Row>
      </div>

      {/* Cloud baseline (always shown for comparison) */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pb-1 border-b border-border/40 mb-1">
          Cloud (global)
        </div>
        <Row label="Resolved URL">
          {globalBaseUrl ? (
            <CopyableValue value={globalBaseUrl} />
          ) : (
            <span className="text-muted-foreground/60">(none)</span>
          )}
        </Row>
      </div>

      {/* Override / sandbox section */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pb-1 border-b border-border/40 mb-1">
          Per-conversation override
        </div>
        <Row label="Override URL">
          {overrideUrl ? (
            <CopyableValue value={overrideUrl} />
          ) : (
            <span className="text-muted-foreground/60">(none)</span>
          )}
        </Row>
        <Row label="Bearer token">
          {overrideToken ? (
            <span className="flex items-center gap-2">
              <span className="font-mono text-[11px]">
                {maskToken(overrideToken)}
              </span>
              <CopyableValue value={overrideToken} mono className="hidden" />
            </span>
          ) : (
            <span className="text-muted-foreground/60">(none)</span>
          )}
        </Row>
        <Row label="Token status">
          <Pill
            variant={
              tokenStatus === "minted"
                ? "active"
                : tokenStatus === "missing"
                  ? "warn"
                  : "muted"
            }
          >
            {tokenStatus}
          </Pill>
        </Row>
        {overrideTokenError && (
          <Row label="Mint error">
            <span className="text-amber-600 dark:text-amber-400 break-words">
              {overrideTokenError}
            </span>
          </Row>
        )}
      </div>

      {/* Sandbox binding source */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pb-1 border-b border-border/40 mb-1">
          Sandbox binding (codeWorkspace)
        </div>
        <Row label="Active sandbox id">
          {activeSandboxId ? (
            <CopyableValue value={activeSandboxId} />
          ) : (
            <span className="text-muted-foreground/60">(none)</span>
          )}
        </Row>
        <Row label="Sandbox proxy_url">
          {activeSandboxProxyUrl ? (
            <CopyableValue value={activeSandboxProxyUrl} />
          ) : (
            <span className="text-muted-foreground/60">
              (orchestrator hasn’t shipped one for this sandbox)
            </span>
          )}
        </Row>
      </div>

      <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
        Read-only. Set automatically by the editor surface via{" "}
        <code className="font-mono">useBindAgentToSandbox</code>. The override
        only redirects this conversation’s <code>/ai/*</code> calls — every
        other backend call (cloud-files, prompts, agent definitions) keeps using
        the global URL.
      </p>
    </div>
  );
}
