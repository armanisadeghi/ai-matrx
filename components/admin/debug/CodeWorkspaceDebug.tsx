// components/admin/debug/CodeWorkspaceDebug.tsx
//
// Admin-only debug panel for the /code workspace stack. The single most
// common "but I'm connected and it still says cloud" failure is that the
// orchestrator's `SandboxInstance.proxy_url` is null — without it the
// chat hook (`useBindAgentToSandbox`) can't write the per-conversation
// override and the AI bar stays on the global URL.
//
// This panel surfaces every layer of that pipeline in one place:
//
//   1. The Redux mirror of the active filesystem adapter (kind / id /
//      label / root).
//   2. The active sandbox id + proxy_url + a derived "AI binding"
//      verdict so admins don't have to mentally walk the chain.
//   3. The list of conversations that currently hold a per-conversation
//      override, so they can confirm a SPECIFIC chat is bound (the
//      global state can be ready and a particular chat still detached
//      if `useBindAgentToSandbox` hasn't mounted for it).
//   4. A live fetch of `GET /api/sandbox` so the raw orchestrator JSON
//      is one click away — the same payload the SandboxesPanel uses,
//      but reachable from any page via the AdminIndicator.
//
// Reads exclusively from Redux for the first three sections. Section 4
// is a fetch-on-demand button so we don't burn orchestrator quota every
// time an admin opens the indicator.

"use client";

import { useCallback, useState } from "react";
import { createSelector } from "@reduxjs/toolkit";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveSandboxId,
  selectActiveSandboxProxyUrl,
  selectActiveFilesystemId,
  selectActiveFilesystemLabel,
  selectActiveFilesystemRoot,
  selectEditorMode,
} from "@/features/code/redux/codeWorkspaceSlice";
import type { RootState } from "@/lib/redux/store";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OverrideEntry {
  conversationId: string;
  url: string;
  hasToken: boolean;
}

// Memoized so the selector returns a stable array reference for unchanged
// state — required to keep `useAppSelector` from triggering re-renders
// every time *any* slice dispatches (see `redux-selector-rules`). Inputs
// extract, the result function transforms.
const selectByConversationId = (state: RootState) =>
  state.instanceUIState?.byConversationId;

const selectOverrideEntries = createSelector(
  [selectByConversationId],
  (byConv): OverrideEntry[] => {
    if (!byConv) return EMPTY_OVERRIDES;
    const out: OverrideEntry[] = [];
    for (const [conversationId, entry] of Object.entries(byConv)) {
      if (entry?.serverOverrideUrl) {
        out.push({
          conversationId,
          url: entry.serverOverrideUrl,
          hasToken: Boolean(entry.serverOverrideAuthToken),
        });
      }
    }
    return out.length === 0 ? EMPTY_OVERRIDES : out;
  },
);

// Stable empty reference — handed back when no overrides exist so the
// selector signature stays consistent without violating the "no defaults
// inside selectors" rule (the source slice is genuinely empty, not
// undefined).
const EMPTY_OVERRIDES: OverrideEntry[] = [];

function maskToken(token: string): string {
  if (token.length <= 12) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 6)}…${token.slice(-4)}`;
}

export default function CodeWorkspaceDebug() {
  const editorMode = useAppSelector(selectEditorMode);
  const activeSandboxId = useAppSelector(selectActiveSandboxId);
  const activeProxyUrl = useAppSelector(selectActiveSandboxProxyUrl);
  const activeFsId = useAppSelector(selectActiveFilesystemId);
  const activeFsLabel = useAppSelector(selectActiveFilesystemLabel);
  const activeFsRoot = useAppSelector(selectActiveFilesystemRoot);
  const globalBaseUrl = useAppSelector(selectResolvedBaseUrl);
  const overrides = useAppSelector(selectOverrideEntries);

  const [rawListLoading, setRawListLoading] = useState(false);
  const [rawListError, setRawListError] = useState<string | null>(null);
  const [rawList, setRawList] = useState<unknown | null>(null);
  const [rawListOpen, setRawListOpen] = useState(false);

  const [mintLoading, setMintLoading] = useState(false);
  const [mintStatus, setMintStatus] = useState<number | null>(null);
  const [mintResult, setMintResult] = useState<unknown | null>(null);
  const [mintOpen, setMintOpen] = useState(false);

  const testMint = useCallback(async () => {
    if (!activeSandboxId) return;
    setMintLoading(true);
    setMintStatus(null);
    setMintResult(null);
    try {
      const resp = await fetch(
        `/api/sandbox/${encodeURIComponent(activeSandboxId)}/access-tokens`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scopes: ["ai"] }),
          cache: "no-store",
        },
      );
      const text = await resp.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { _rawBody: text };
      }
      // Mask the token for display so admins can paste this output without
      // leaking a usable bearer. The status code + error fields are the
      // signal we actually need.
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed !== null &&
        "token" in parsed &&
        typeof (parsed as { token?: unknown }).token === "string"
      ) {
        const tok = (parsed as { token: string }).token;
        (parsed as Record<string, unknown>).token =
          tok.length > 12 ? `${tok.slice(0, 6)}…${tok.slice(-4)}` : "<short>";
      }
      setMintStatus(resp.status);
      setMintResult(parsed);
      setMintOpen(true);
    } catch (err) {
      setMintStatus(0);
      setMintResult({
        _fetchError: err instanceof Error ? err.message : String(err),
      });
      setMintOpen(true);
    } finally {
      setMintLoading(false);
    }
  }, [activeSandboxId]);

  const fetchRawList = useCallback(async () => {
    setRawListLoading(true);
    setRawListError(null);
    try {
      const resp = await fetch("/api/sandbox", { cache: "no-store" });
      const text = await resp.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { _rawBody: text, _status: resp.status };
      }
      if (!resp.ok) {
        setRawListError(`HTTP ${resp.status}`);
      }
      setRawList(parsed);
      setRawListOpen(true);
    } catch (err) {
      setRawListError(err instanceof Error ? err.message : String(err));
    } finally {
      setRawListLoading(false);
    }
  }, []);

  const aiBound = Boolean(activeSandboxId && activeProxyUrl);
  const sandboxConnected = Boolean(activeSandboxId);

  return (
    <div className="space-y-3 p-3 text-xs">
      {/* ── Verdict ─────────────────────────────────────────────────────── */}
      <Section title="AI routing verdict">
        <Verdict
          ok={aiBound}
          okLabel="AI calls route to the sandbox proxy"
          warnLabel={
            sandboxConnected
              ? "Connected, but proxy_url is null — AI calls fall back to cloud"
              : "No sandbox connected — AI calls use the global cloud server"
          }
        />
        <KV label="editorMode">
          <code className="font-mono">{editorMode}</code>
        </KV>
        <KV label="cloud baseUrl">
          {globalBaseUrl ?? <span className="opacity-60">(none)</span>}
        </KV>
      </Section>

      {/* ── Active sandbox state (Redux mirror) ─────────────────────────── */}
      <Section title="Active sandbox (codeWorkspace slice)">
        <KV label="activeSandboxId">
          {activeSandboxId ? (
            <CopyableMono value={activeSandboxId} />
          ) : (
            <span className="opacity-60">(none)</span>
          )}
        </KV>
        <KV label="activeSandboxProxyUrl">
          {activeProxyUrl ? (
            <CopyableMono value={activeProxyUrl} />
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              null — orchestrator hasn’t shipped one
            </span>
          )}
        </KV>
        <KV label="activeFilesystemId">
          <code className="font-mono">{activeFsId ?? "—"}</code>
        </KV>
        <KV label="activeFilesystemLabel">
          {activeFsLabel ?? <span className="opacity-60">—</span>}
        </KV>
        <KV label="activeFilesystemRoot">
          <code className="font-mono">{activeFsRoot ?? "—"}</code>
        </KV>
      </Section>

      {/* ── Per-conversation overrides ──────────────────────────────────── */}
      <Section title={`Conversations bound to a sandbox (${overrides.length})`}>
        {overrides.length === 0 ? (
          <p className="text-[11px] opacity-70">
            No conversation has a serverOverrideUrl. AI calls in every chat use
            the global cloud URL.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {overrides.map((entry) => (
              <li
                key={entry.conversationId}
                className="rounded border border-neutral-200 bg-white px-2 py-1 dark:border-neutral-800 dark:bg-neutral-950/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <EntityRef
                    token="conversation"
                    id={entry.conversationId}
                    wrap
                    openInNewTab
                    className="min-w-0"
                    nameClassName="font-mono text-[10px]"
                  />
                  {entry.hasToken ? (
                    <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      token
                    </span>
                  ) : (
                    <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
                      no token
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] opacity-80">
                  {entry.url}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Bearer-token mint test ──────────────────────────────────────── */}
      <Section title="Test sandbox access-token mint">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void testMint()}
            disabled={mintLoading || !activeSandboxId}
            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            {mintLoading ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            POST /api/sandbox/{"{id}"}/access-tokens
          </button>
          {mintStatus !== null && (
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[10px]",
                mintStatus >= 200 && mintStatus < 300
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400",
              )}
            >
              HTTP {mintStatus}
            </span>
          )}
          {mintResult !== null && (
            <CopyButton
              value={JSON.stringify(mintResult, null, 2)}
              label="Copy JSON"
            />
          )}
        </div>
        {!activeSandboxId && (
          <p className="text-[10px] opacity-70">
            Connect to a sandbox first to enable this button.
          </p>
        )}
        {mintResult !== null && (
          <Collapsible
            open={mintOpen}
            onToggle={() => setMintOpen((o) => !o)}
            title="Inspect mint response"
          >
            <pre className="max-h-72 overflow-auto rounded bg-neutral-50 p-2 font-mono text-[10px] leading-snug dark:bg-neutral-950">
              {JSON.stringify(mintResult, null, 2)}
            </pre>
          </Collapsible>
        )}
        <p className="text-[10px] opacity-70">
          Hits the same Next.js route the chat surface uses. The token is{" "}
          <strong>masked</strong> in the displayed JSON. Common 500 errors:
          missing{" "}
          <code className="font-mono">MATRX_HOSTED_ORCHESTRATOR_API_KEY</code>{" "}
          (hosted tier) or{" "}
          <code className="font-mono">MATRX_ORCHESTRATOR_API_KEY</code> (EC2
          tier). Note:{" "}
          <code className="font-mono">MATRX_ACCESS_TOKEN_SECRET</code> is the
          orchestrator's HMAC signing secret on the Python side — it does NOT
          authenticate Next.js → orchestrator calls.
        </p>
      </Section>

      {/* ── Raw orchestrator payload ───────────────────────────────────── */}
      <Section title="Raw orchestrator response">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchRawList()}
            disabled={rawListLoading}
            className="inline-flex items-center gap-1 rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            {rawListLoading ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <RefreshCw size={11} />
            )}
            Fetch GET /api/sandbox
          </button>
          {rawList !== null && (
            <CopyButton
              value={JSON.stringify(rawList, null, 2)}
              label="Copy JSON"
            />
          )}
          {rawListError && (
            <span className="text-amber-600 dark:text-amber-400">
              {rawListError}
            </span>
          )}
        </div>
        {rawList !== null && (
          <Collapsible
            open={rawListOpen}
            onToggle={() => setRawListOpen((o) => !o)}
            title="Inspect payload"
          >
            <pre className="max-h-72 overflow-auto rounded bg-neutral-50 p-2 font-mono text-[10px] leading-snug dark:bg-neutral-950">
              {JSON.stringify(rawList, null, 2)}
            </pre>
          </Collapsible>
        )}
        <p className="text-[10px] opacity-70">
          Use this to confirm whether{" "}
          <code className="font-mono">proxy_url</code>,{" "}
          <code className="font-mono">tier</code>, and{" "}
          <code className="font-mono">status</code> match what the orchestrator
          should be returning. Same payload the Sandboxes panel renders, but
          reachable from any page.
        </p>
      </Section>
    </div>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────────
//
// Kept inline because they're trivial and only used here. Promoting to a
// shared module would force every consumer to re-derive the same neutral
// dark/light tokens that already exist as Tailwind utilities.

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {title}
      </h4>
      <div className="rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800 dark:bg-neutral-900/40">
        {children}
      </div>
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-neutral-200/60 py-0.5 last:border-0 dark:border-neutral-800/60">
      <span className="w-40 shrink-0 text-right text-[10px] text-neutral-500 dark:text-neutral-400">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-all text-[11px]">{children}</span>
    </div>
  );
}

function Verdict({
  ok,
  okLabel,
  warnLabel,
}: {
  ok: boolean;
  okLabel: string;
  warnLabel: string;
}) {
  return (
    <div
      className={cn(
        "mb-1 flex items-center gap-1.5 rounded px-2 py-1 text-[11px]",
        ok
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      {ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
      <span>{ok ? okLabel : warnLabel}</span>
    </div>
  );
}

function CopyableMono({ value }: { value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <code className="truncate font-mono text-[11px]">{value}</code>
      <CopyButton value={value} />
    </span>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      title="Copy to clipboard"
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {label && <span className="text-[11px]">{label}</span>}
    </button>
  );
}

function Collapsible({
  open,
  onToggle,
  title,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
