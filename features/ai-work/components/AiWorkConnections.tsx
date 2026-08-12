"use client";

import { useEffect, useMemo, useState } from "react";
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
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import { apiGet } from "@/lib/api/typed-client";
import {
  CODING_SESSION_PROVIDERS,
  CODING_SESSION_PROVIDER_META,
} from "@/features/agent-connections/coding-sessions/catalog";
import type { CodingSessionView } from "@/features/agent-connections/coding-sessions/service";
import { useCodingSessions } from "@/features/agent-connections/coding-sessions/useCodingSessions";
import { formatSessionTimestamp } from "@/features/agent-connections/coding-sessions/verdict";
import {
  NO_ACCOUNT_IDENTITY,
  providerAccountIdentity,
} from "@/features/ai-work/lib/codingSessionPresentation";

/**
 * Matrx Local ships the explicit Claude local-history importer (v1.4.22+,
 * sidebar → "Claude History"). Its aimatrx:// scheme only handles OAuth
 * callbacks today, so the honest door is the desktop download page plus the
 * exact in-app route name — not a pretend deep link.
 */
const MATRX_LOCAL_DOWNLOAD_URL =
  "https://github.com/armanisadeghi/matrx-local/releases/latest";

type ManagedCapability = {
  state: "loading" | "ready" | "error";
  available: boolean;
  nativeResume: boolean;
  nativeFork: boolean;
  reason: string | null;
};

const INITIAL_CAPABILITY: ManagedCapability = {
  state: "loading",
  available: false,
  nativeResume: false,
  nativeFork: false,
  reason: null,
};

async function readManagedCapability(): Promise<ManagedCapability> {
  try {
    const { data } = await apiGet("/coding-sessions/claude/capabilities");
    return {
      state: "ready",
      available: data.available,
      nativeResume: data.native_resume,
      nativeFork: data.native_fork,
      reason: data.reason ?? null,
    };
  } catch (capabilityError) {
    return {
      state: "error",
      available: false,
      nativeResume: false,
      nativeFork: false,
      reason:
        capabilityError instanceof Error
          ? capabilityError.message
          : "Capability check failed",
    };
  }
}

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

export function AiWorkConnections() {
  const {
    sessions,
    loading,
    error,
    refresh,
    hasMore,
    loadingMore,
    loadOlder,
  } = useCodingSessions();
  const [capability, setCapability] =
    useState<ManagedCapability>(INITIAL_CAPABILITY);

  const refreshManagedCapability = () => {
    setCapability(INITIAL_CAPABILITY);
    void readManagedCapability().then(setCapability);
  };

  useEffect(() => {
    let cancelled = false;
    void readManagedCapability().then((next) => {
      if (!cancelled) setCapability(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
                              {accounts.length > 1 || account.sessionCount > 1 ? (
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
                  Start a Claude Code session
                </h2>
                {capability.state === "loading" ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Checking the live backend capability…
                  </p>
                ) : capability.available ? (
                  <>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      The backend reports a managed Claude runtime. Native
                      resume: {capability.nativeResume ? "available" : "unavailable"};
                      native fork: {capability.nativeFork ? "available" : "unavailable"}.
                      Launching from this page is still in certification — the
                      start/stream/resume path must pass an end-to-end
                      certification run before this button goes live.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2 gap-1.5"
                      disabled
                      title="Managed launch is certification-pending"
                    >
                      <Play className="h-3.5 w-3.5" />
                      Start session — certification pending
                    </Button>
                  </>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Starting a managed Claude Code session from AI Matrx is not
                    available:{" "}
                    {capability.reason ||
                      "the backend reports no managed Claude runtime here."}{" "}
                    No launch button is shown until the live capability call
                    says otherwise.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={refreshManagedCapability}
                aria-label="Refresh managed Claude capability"
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </article>

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
                  import the ones you choose, with an exact
                  accepted/duplicate report. This web page never reads local
                  provider files, so the import itself runs in the desktop
                  app.
                </p>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="mt-2 gap-1.5"
                >
                  <a
                    href={MATRX_LOCAL_DOWNLOAD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Get Matrx Local
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  ChatGPT and Claude.ai web-chat history remain unavailable —
                  no supported live seam exists, and no pretend sync action is
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
