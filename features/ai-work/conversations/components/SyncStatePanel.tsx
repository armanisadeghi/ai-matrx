"use client";

// features/ai-work/conversations/components/SyncStatePanel.tsx
//
// "Is my Claude Code history actually arriving?" — answered, per account, from
// facts that were already in the database and that nothing rendered.
//
// TWO components, ONE reader (`readSyncState`):
//   <SyncStatePanel />     the full per-account breakdown on /work/connections
//   <SyncStateIndicator /> the compact strip above /work/conversations
// A user must never be able to open both and see different verdicts.
//
// THE SYNC-NOW DOOR — verified 2026-08-16, stated exactly:
// Matrx Local really does own the historical import (`/coding-session/claude/
// history/{preview,import,status}` in matrx-local), but the web app cannot
// invoke it today, for two independent reasons:
//   1. the desktop engine listens on a locally SCANNED port (MATRX_PORT_BASE
//      22140+), which a browser has no way to discover; and
//   2. the one web→desktop relay that exists — aidream
//      `/api/local-proxy/{app_instance_id}/{path}` — hard-rewrites every
//      request to `{tunnel_url}/sandbox/{path}`, so it cannot address the
//      `/coding-session/*` router at all.
// So the button says that and opens the desktop app's own page. A button that
// looks live and does nothing is the "fake Resume" this product forbids.

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatSessionTimestamp } from "@/features/agent-connections/coding-sessions/verdict";
import { formatText } from "@/utils/text/text-case-converter";
import { providerLabel } from "../presentation";
import {
  EMPTY_SYNC_STATE,
  freshnessLabel,
  readSyncState,
  type SyncAccountState,
  type SyncFreshness,
  type SyncStateSnapshot,
} from "../syncState";
import { MATRX_LOCAL_DOWNLOAD_PATH } from "@/features/matrx-local-download/release";

/** Exact, verified statement of why the web app cannot start a sync itself. */
export const SYNC_NOW_UNAVAILABLE_REASON =
  "Historical Claude Code sync runs inside the Matrx Local desktop app. This browser " +
  "cannot start it: the desktop engine listens on a locally scanned port (22140+) that " +
  "a web page cannot discover, and the only web-to-desktop relay we operate " +
  "(aidream /api/local-proxy) forwards every request to the desktop's /sandbox routes, " +
  "so it cannot reach the Claude-history endpoints. Open Matrx Local → Claude History to run it.";

function useSyncState() {
  const [state, setState] = useState<SyncStateSnapshot>(EMPTY_SYNC_STATE);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void readSyncState()
      .then((next) => {
        if (cancelled) return;
        setState(next);
        setStatus("ready");
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Loud recovery: an empty panel must never read as "you have no
        // sessions" when the read itself failed.
        setState(EMPTY_SYNC_STATE);
        setError(err instanceof Error ? err.message : "Sync state read failed");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return {
    state,
    status,
    error,
    reload: () => {
      setStatus("loading");
      setReloadToken((n) => n + 1);
    },
  };
}

function FreshnessPill({ freshness }: { freshness: SyncFreshness }) {
  const Icon =
    freshness === "live"
      ? CheckCircle2
      : freshness === "recent"
        ? Clock
        : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        freshness === "live" &&
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        freshness === "recent" &&
          "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        (freshness === "stale" || freshness === "none") &&
          "bg-muted text-muted-foreground",
      )}
    >
      <Icon className="h-3 w-3" />
      {freshnessLabel(freshness)}
    </span>
  );
}

/**
 * The one honest "Sync now". It never pretends: it states the boundary and
 * opens the surface that CAN do it.
 */
export function SyncNowDoor({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", compact && "gap-1.5")}
    >
      <Button asChild size="sm" variant="outline" className="gap-1.5">
        <a
          href={MATRX_LOCAL_DOWNLOAD_PATH}
          target="_blank"
          rel="noopener noreferrer"
          title={SYNC_NOW_UNAVAILABLE_REASON}
        >
          <Download className="h-3.5 w-3.5" />
          Sync now in Matrx Local
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </Button>
      {!compact && (
        <p className="flex-1 basis-full text-xs leading-relaxed text-muted-foreground">
          <Info className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          {SYNC_NOW_UNAVAILABLE_REASON}
        </p>
      )}
    </div>
  );
}

function AccountCard({ account }: { account: SyncAccountState }) {
  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">
            {providerLabel(account.provider) ?? formatText(account.provider)}
          </h3>
          <span
            className={cn(
              "max-w-56 truncate rounded-full px-2 py-0.5 text-[11px] font-medium",
              account.accountReported
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
            title={account.accountLabel}
          >
            {account.accountLabel}
          </span>
        </div>
        <FreshnessPill freshness={account.freshness} />
      </div>
      <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        <Fact label="Sessions delivered">
          {account.sessionCount.toLocaleString()}
        </Fact>
        <Fact label="Last delivery">
          {account.lastSeenAt
            ? formatSessionTimestamp(account.lastSeenAt)
            : "Never"}
        </Fact>
        <Fact label="Fidelity">
          {account.fidelity
            .map((f) => `${formatText(f.value)} (${f.count})`)
            .join(", ") || "None recorded"}
        </Fact>
        <Fact label="Arrived by">
          {account.origin
            .map((o) => `${formatText(o.value)} (${o.count})`)
            .join(", ") || "None recorded"}
        </Fact>
        <Fact label="Bindings not active">
          {account.inactiveCount > 0 ? account.inactiveCount : "None"}
        </Fact>
        <Fact label="Workspaces">
          {account.workspaces.length > 0
            ? account.workspaces.join(", ")
            : "None reported"}
        </Fact>
      </dl>
    </article>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md bg-muted/30 px-2.5 py-2">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{children}</dd>
    </div>
  );
}

export function SyncStatePanel() {
  const { state, status, error, reload } = useSyncState();

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">Sync state</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            What has actually been delivered into AI Matrx, per provider
            account. These are binding facts from your own coding sessions — not
            an estimate, and not a claim that anything is running right now.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status === "ready" && <FreshnessPill freshness={state.freshness} />}
          <button
            type="button"
            onClick={reload}
            aria-label="Re-read sync state"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {status === "loading" ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reading delivered sessions…
        </div>
      ) : status === "error" ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : state.accounts.length === 0 ? (
        <p className="mt-3 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          No coding session has ever been delivered to this account. Install the
          AI Matrx plugin in Claude Code, or import your existing history from
          Matrx Local.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            {state.totalSessions.toLocaleString()} session
            {state.totalSessions === 1 ? "" : "s"} across{" "}
            {state.accounts.length} provider account
            {state.accounts.length === 1 ? "" : "s"}.
          </p>
          {state.accounts.map((account) => (
            <AccountCard key={account.key} account={account} />
          ))}
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <SyncNowDoor />
      </div>
    </article>
  );
}

/**
 * The compact form for the conversations list — same reader, same verdict, one
 * line. It is a door, not a decoration: the whole strip links to the full
 * panel.
 */
export function SyncStateIndicator() {
  const { state, status, error } = useSyncState();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
      <span className="font-medium text-foreground">Claude Code sync</span>
      {status === "loading" ? (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Checking…
        </span>
      ) : status === "error" ? (
        <span className="flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </span>
      ) : (
        <>
          <FreshnessPill freshness={state.freshness} />
          <span className="text-muted-foreground">
            {state.totalSessions.toLocaleString()} session
            {state.totalSessions === 1 ? "" : "s"} · {state.accounts.length}{" "}
            account
            {state.accounts.length === 1 ? "" : "s"} ·{" "}
            {state.lastSeenAt
              ? `last delivery ${formatSessionTimestamp(state.lastSeenAt)}`
              : "never delivered"}
          </span>
        </>
      )}
      <a
        href="/work/connections"
        className="ml-auto font-medium text-primary hover:underline"
      >
        Sync state and Sync now
      </a>
    </div>
  );
}
