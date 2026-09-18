"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDot,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  ServerCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import {
  INITIAL_BRIDGE_CAPABILITY,
  readBridgeCapability,
  type CodingBridgeCapability,
} from "@/features/ai-work/lib/codingBridgeCapability";
import { destinationAvailability } from "@/features/ai-work/compose/destinations";
import {
  CODING_SESSION_PROVIDERS,
  CODING_SESSION_PROVIDER_META,
} from "@/features/agent-connections/coding-sessions/catalog";
import type { CodingSessionView } from "@/features/agent-connections/coding-sessions/service";
import { useCodingSessions } from "@/features/agent-connections/coding-sessions/useCodingSessions";
import { formatSessionTimestamp } from "@/features/agent-connections/coding-sessions/verdict";
import { captureGapVerdict } from "@/features/agent-connections/coding-sessions/captureGap";
import { CaptureGapAlert } from "@/features/agent-connections/coding-sessions/CaptureGapAlert";
import {
  NO_ACCOUNT_IDENTITY,
  providerAccountIdentity,
  workspaceName,
} from "@/features/ai-work/lib/codingSessionPresentation";
import {
  deliveryHistory,
  newestDeliveryAt,
} from "@/features/ai-work/conversations/bindingPlurality";
import { SyncStatePanel } from "@/features/ai-work/conversations/components/SyncStatePanel";
import { MATRX_LOCAL_DOWNLOAD_PATH } from "@/features/matrx-local-download/release";

/**
 * Matrx Local ships the explicit Claude local-history importer (v1.4.22+,
 * sidebar → "Claude History"). Its aimatrx:// scheme only handles OAuth
 * callbacks today, so the honest door is the desktop download page plus the
 * exact in-app route name — not a pretend deep link.
 */
interface AccountGroup {
  key: string;
  display: string;
  isLabel: boolean;
  sessionCount: number;
  lastSeenAt: string | null;
}

/** Groups delivered sessions by their opaque provider-account identity. */
function groupSessionsByAccount(sessions: CodingSessionView[]): AccountGroup[] {
  const groups = new Map<string, AccountGroup>();
  for (const session of sessions) {
    const identity = providerAccountIdentity(session.metadata);
    const key = identity.fingerprint ?? identity.label ?? NO_ACCOUNT_IDENTITY;
    const existing = groups.get(key);
    if (existing) {
      existing.sessionCount += 1;
      if (
        session.last_seen_at &&
        (!existing.lastSeenAt || session.last_seen_at > existing.lastSeenAt)
      ) {
        existing.lastSeenAt = session.last_seen_at;
      }
      // A later session may carry the display label an earlier one lacked.
      if (!existing.isLabel && identity.label) {
        existing.display = identity.label;
        existing.isLabel = true;
      }
    } else {
      groups.set(key, {
        key,
        display: identity.display,
        isLabel: identity.label !== null,
        sessionCount: 1,
        lastSeenAt: session.last_seen_at,
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""),
  );
}

interface WorkspaceGroup {
  name: string;
  sessionCount: number;
  lastSeenAt: string | null;
}

/** Groups delivered sessions by the bridge-stamped workspace/project name. */
function groupSessionsByWorkspace(
  sessions: CodingSessionView[],
): WorkspaceGroup[] {
  const groups = new Map<string, WorkspaceGroup>();
  for (const session of sessions) {
    const name = workspaceName(session.metadata);
    if (!name) continue;
    const existing = groups.get(name);
    if (existing) {
      existing.sessionCount += 1;
      if (
        session.last_seen_at &&
        (!existing.lastSeenAt || session.last_seen_at > existing.lastSeenAt)
      ) {
        existing.lastSeenAt = session.last_seen_at;
      }
    } else {
      groups.set(name, {
        name,
        sessionCount: 1,
        lastSeenAt: session.last_seen_at,
      });
    }
  }
  return [...groups.values()].sort((a, b) =>
    (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""),
  );
}

export function AiWorkConnections() {
  const {
    sessions,
    loading,
    error,
    checkedAtMs,
    refresh,
    hasMore,
    loadingMore,
    loadOlder,
  } = useCodingSessions();

  // Derived from the bindings this page already loaded — no second read, and
  // no chance of disagreeing with the delivery facts rendered below.
  const captureGap = captureGapVerdict({
    // The newest DELIVERY, never the first row: an unclaimed handoff offer has
    // delivered nothing and sorts first once its `last_seen_at` is null.
    lastSeenAt: newestDeliveryAt(sessions),
    history: deliveryHistory(sessions),
    readSucceeded: checkedAtMs === 0 ? null : error === null,
    nowMs: checkedAtMs,
  });
  // The hosted-runtime verdict comes from the coding session bridge
  // (`claude_code × matrx_sandbox`) — the SAME reader `/work/new` uses, so the
  // two surfaces cannot disagree about whether a sandbox can be started.
  const [capability, setCapability] = useState<CodingBridgeCapability>(
    INITIAL_BRIDGE_CAPABILITY,
  );
  const organizationId = useAppSelector(selectOrganizationId);

  // ONE decider, shared with the composer's destination gate: this card and
  // `/work/new` can never disagree about whether a hosted run can start, and
  // the refusal sentence is the server's own either way.
  const hostedStart = destinationAvailability(
    "claude-code-hosted",
    capability,
  );

  const refreshHostedCapability = () => {
    setCapability(INITIAL_BRIDGE_CAPABILITY);
    void readBridgeCapability("claude_code", "matrx_sandbox").then(
      setCapability,
    );
  };

  // Keyed on the active organization so choosing one in the inline notice
  // re-runs the read instead of leaving a dead card. The bridge verdict is per
  // user AND per organization, so this is not an optimisation.
  useEffect(() => {
    let cancelled = false;
    setCapability(INITIAL_BRIDGE_CAPABILITY);
    void readBridgeCapability("claude_code", "matrx_sandbox").then((next) => {
      if (!cancelled) setCapability(next);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  return (
    <div className="h-full overflow-y-auto px-4 py-5 scrollbar-thin sm:px-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground">
              Connections and sync
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Connection facts are kept separate: account identity,
              authorization, client detection, session delivery, and history
              sync do not prove one another.
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href="/agent-connections/plugins">
              Technical diagnostics
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </section>

        {error ? (
          <StaleDataNotice
            hasData={sessions.length > 0}
            what="your coding-session delivery state"
            onRetry={refresh}
            retrying={loading}
            detail={error}
          />
        ) : null}

        {/*
          Above every per-platform card on purpose. "Session delivery" is the
          one connection fact that fails silently — Claude treats a failed hook
          as non-blocking — so it gets the top of the page, not a status chip.
        */}
        <CaptureGapAlert
          verdict={captureGap}
          lastSeenAt={newestDeliveryAt(sessions)}
          onRefresh={refresh}
          refreshing={loading}
        />

        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Coding platforms
              </h2>
              <p className="text-xs text-muted-foreground">
                Detection comes only from authenticated sessions already
                delivered to AI Matrx.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1.5"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {CODING_SESSION_PROVIDERS.map((provider) => {
              const meta = CODING_SESSION_PROVIDER_META[provider];
              const providerSessions = sessions.filter(
                (session) => session.provider === provider,
              );
              const latest = providerSessions[0] ?? null;
              const accounts = groupSessionsByAccount(providerSessions);
              const workspaces = groupSessionsByWorkspace(providerSessions);
              return (
                <article
                  key={provider}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <meta.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {meta.label}
                        </h3>
                        <StateBadge ready={providerSessions.length > 0} />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {meta.connection}
                      </p>
                    </div>
                    <a
                      href={meta.docsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`${meta.label} documentation`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                    <ConnectionFact label="Authorization grant">
                      Not exposed by the session binding
                    </ConnectionFact>
                    <ConnectionFact label="Client detection">
                      {providerSessions.length > 0
                        ? "Detected from delivered session"
                        : "Not detected"}
                    </ConnectionFact>
                    <ConnectionFact label="Session delivery">
                      {latest
                        ? `${providerSessions.length} recent binding${providerSessions.length === 1 ? "" : "s"}; ${formatSessionTimestamp(latest.last_seen_at)}`
                        : "No session delivered"}
                    </ConnectionFact>
                    <ConnectionFact
                      label={
                        accounts.length > 1
                          ? `Accounts (${accounts.length})`
                          : "Account identity"
                      }
                    >
                      {accounts.length === 0 ? (
                        NO_ACCOUNT_IDENTITY
                      ) : (
                        <ul className="space-y-1">
                          {accounts.map((account) => (
                            <li
                              key={account.key}
                              className="flex flex-wrap items-baseline gap-x-1.5"
                            >
                              <span className="break-all font-medium">
                                {account.display}
                              </span>
                              {accounts.length > 1 ||
                              account.sessionCount > 1 ? (
                                <span className="text-muted-foreground">
                                  {account.sessionCount} session
                                  {account.sessionCount === 1 ? "" : "s"}
                                  {account.lastSeenAt
                                    ? ` · ${formatSessionTimestamp(account.lastSeenAt)}`
                                    : ""}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </ConnectionFact>
                    {workspaces.length > 0 ? (
                      <ConnectionFact
                        label={`Workspaces (${workspaces.length})`}
                      >
                        <ul className="space-y-1">
                          {workspaces.map((workspace) => (
                            <li
                              key={workspace.name}
                              className="flex flex-wrap items-baseline gap-x-1.5"
                            >
                              <span className="break-all font-medium">
                                {workspace.name}
                              </span>
                              <span className="text-muted-foreground">
                                {workspace.sessionCount} session
                                {workspace.sessionCount === 1 ? "" : "s"}
                                {workspace.lastSeenAt
                                  ? ` · ${formatSessionTimestamp(workspace.lastSeenAt)}`
                                  : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </ConnectionFact>
                    ) : null}
                  </dl>
                </article>
              );
            })}
          </div>
          {hasMore ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={loadOlder}
                disabled={loadingMore}
              >
                {loadingMore
                  ? "Loading older sessions…"
                  : "Load older sessions"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Detection and account facts above cover the {sessions.length}{" "}
                most recent delivered sessions; older sessions exist.
              </p>
            </div>
          ) : null}
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <article className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <ServerCog className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">
                  Start a hosted Claude Code session
                </h2>
                {capability.organizationRequired ? (
                  <div className="mt-1">
                    <OrganizationRequiredNotice
                      compact
                      description="Starting a hosted Claude Code session needs to know which organization to work in. Pick one below and this checks again automatically."
                    />
                  </div>
                ) : capability.state === "loading" ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking whether a hosted sandbox can be started for you…
                  </p>
                ) : hostedStart.selectable ? (
                  <>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      AI Matrx can start a Claude Code session for you in a
                      Matrx Sandbox
                      {capability.runtime ? ` (${capability.runtime})` : ""}.
                      Start it from the composer, where you also say what you
                      want done and where the result should live.
                    </p>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="mt-2 gap-1.5"
                    >
                      <Link href="/work/new">
                        <Play className="h-3.5 w-3.5" />
                        Start a hosted session
                      </Link>
                    </Button>
                  </>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Starting a hosted Claude Code session is not available:{" "}
                    {hostedStart.reason} No launch control is shown until the
                    live capability verdict says otherwise.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={refreshHostedCapability}
                aria-label="Refresh the hosted Claude Code capability"
                aria-busy={capability.state === "loading"}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RefreshCw
                  className={
                    capability.state === "loading"
                      ? "h-3.5 w-3.5 animate-spin"
                      : "h-3.5 w-3.5"
                  }
                />
              </button>
            </div>
          </article>

          {/* The answer to "is my history actually arriving?", from binding
              facts that already existed and that nothing rendered. Same reader
              as the compact indicator on /work/conversations, so the two
              surfaces cannot disagree. */}
          <SyncStatePanel />

          <article className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <Download className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-foreground">
                  Historical Claude Code sync
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Available in the Matrx Local desktop app (v1.4.22+): open{" "}
                  <span className="font-medium text-foreground">
                    Claude History
                  </span>{" "}
                  in its sidebar to preview local Claude Code sessions and
                  import the ones you choose, with an exact accepted/duplicate
                  report. This web page never reads local provider files, so the
                  import itself runs in the desktop app.
                </p>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-1.5"
                >
                  <a
                    href={MATRX_LOCAL_DOWNLOAD_PATH}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get Matrx Local
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  ChatGPT and Claude.ai web-chat history remain unavailable — no
                  supported live seam exists, and no pretend sync action is
                  offered.
                </p>
              </div>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}

function StateBadge({ ready }: { ready: boolean }) {
  const Icon = ready ? CheckCircle2 : CircleDot;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        ready
          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {ready ? "Detected" : "Not detected"}
    </span>
  );
}

function ConnectionFact({
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
