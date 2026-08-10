"use client";

import React, { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Clock3,
  Code2,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Share2,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { formatText } from "@/utils/text/text-case-converter";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import {
  CODING_SESSION_PROVIDERS,
  CODING_SESSION_PROVIDER_META,
  providerMeta,
  type CodingSessionProvider,
} from "../../coding-sessions/catalog";
import {
  bridgeReadHealth,
  fidelityVerdict,
} from "../../coding-sessions/verdict";
import { useCodingSessions } from "../../coding-sessions/useCodingSessions";
import type { CodingSessionView } from "../../coding-sessions/service";

export function PluginsSection() {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] =
    useState<CodingSessionProvider | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const { sessions, loading, error, checkedAtMs, refresh } =
    useCodingSessions();

  const selectedSession = selectedSessionId
    ? (sessions.find((session) => session.id === selectedSessionId) ?? null)
    : null;

  if (selectedSession) {
    return (
      <CodingSessionDetail
        session={selectedSession}
        onBack={() => setSelectedSessionId(null)}
      />
    );
  }

  const query = search.trim().toLowerCase();
  const filteredSessions = sessions.filter((session) => {
    const meta = providerMeta(session.provider);
    const title = session.conversation?.title ?? "";
    const matchesProvider =
      providerFilter === null || session.provider === providerFilter;
    const matchesQuery =
      !query ||
      title.toLowerCase().includes(query) ||
      (meta?.label ?? session.provider).toLowerCase().includes(query) ||
      session.fidelity.toLowerCase().includes(query);
    return matchesProvider && matchesQuery;
  });

  const health = bridgeReadHealth(
    sessions[0]?.last_seen_at ?? null,
    error === null,
    checkedAtMs,
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search coding sessions…"
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-4">
        <BridgeHealthCard
          health={health}
          loading={loading}
          onRefresh={refresh}
        />

        {error ? (
          <StaleDataNotice
            hasData={sessions.length > 0}
            what="your coding sessions"
            onRetry={refresh}
            retrying={loading}
            detail={error}
            className="mt-3"
          />
        ) : null}

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Coding platforms
              </h2>
              <p className="text-xs text-muted-foreground">
                Claude Code is the primary adapter. Codex, Cursor, and VS Code
                use the same session contract and provenance vocabulary.
              </p>
            </div>
            {providerFilter ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 shrink-0"
                onClick={() => setProviderFilter(null)}
              >
                Show all
              </Button>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {CODING_SESSION_PROVIDERS.map((provider) => {
              const meta = CODING_SESSION_PROVIDER_META[provider];
              const Icon = meta.icon;
              const providerSessions = sessions.filter(
                (session) => session.provider === provider,
              );
              const count = providerSessions.length;
              const active = providerFilter === provider;
              return (
                <button
                  key={provider}
                  type="button"
                  onClick={() => setProviderFilter(active ? null : provider)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/40",
                  )}
                  aria-pressed={active}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {meta.label}
                      </span>
                      {meta.priority === "primary" ? (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Primary
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {meta.connection}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {count} session{count === 1 ? "" : "s"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <ClaudeInstallStatus
          sessionCount={
            sessions.filter((session) => session.provider === "claude_code")
              .length
          }
        />

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Session history
              </h2>
              <p className="text-xs text-muted-foreground">
                Private provider state stays owner-only. The linked canonical
                conversation can be opened, previewed, shared, or forked.
              </p>
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {filteredSessions.length}
            </span>
          </div>

          {loading && sessions.length === 0 ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-border py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading coding sessions…
            </div>
          ) : filteredSessions.length === 0 && !error ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
              <Code2 className="mx-auto h-7 w-7 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-medium text-foreground">
                {sessions.length === 0
                  ? "No coding sessions received yet"
                  : "No sessions match this view"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                A session appears only after an authenticated platform adapter
                delivers it. An empty list does not prove a plugin is installed.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-background">
              {filteredSessions.map((session) => (
                <CodingSessionRow
                  key={session.id}
                  session={session}
                  onInspect={() => setSelectedSessionId(session.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <SectionFooter
        description="Coding platforms mirror authenticated sessions into canonical AI Matrx conversations while keeping raw provider state private."
        learnMoreLabel="Read the Claude Code plugin documentation"
        learnMoreHref="https://code.claude.com/docs/en/plugins"
      />
    </div>
  );
}

function BridgeHealthCard({
  health,
  loading,
  onRefresh,
}: {
  health: ReturnType<typeof bridgeReadHealth>;
  loading: boolean;
  onRefresh: () => void;
}) {
  const Icon =
    health.tone === "healthy"
      ? CheckCircle2
      : health.tone === "error"
        ? ShieldAlert
        : health.tone === "stale"
          ? Clock3
          : CircleDot;
  return (
    <section
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5",
        health.tone === "error"
          ? "border-destructive/40 bg-destructive/5"
          : health.tone === "healthy"
            ? "border-emerald-500/40 bg-emerald-500/5"
            : "border-border bg-muted/20",
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">
          {health.label}
        </div>
        <div className="text-xs text-muted-foreground">{health.detail}</div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5"
        onClick={onRefresh}
        disabled={loading}
      >
        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        Refresh
      </Button>
    </section>
  );
}

function ClaudeInstallStatus({ sessionCount }: { sessionCount: number }) {
  const meta = CODING_SESSION_PROVIDER_META.claude_code;
  const Icon = meta.icon;
  return (
    <section className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Claude Code connection
            </h2>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                sessionCount > 0
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {sessionCount > 0 ? "Detected" : "Not detected"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Detection means at least one authenticated Claude Code binding is
            visible to you. It does not infer installation from browser state.
          </p>
          {sessionCount === 0 ? (
            <p className="mt-2 text-xs text-foreground">
              Distribution status: the AI Matrx marketplace package is not
              published, so this screen does not offer a command that would
              fail.
            </p>
          ) : null}
        </div>
        <a
          href={meta.docsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs text-foreground hover:bg-accent"
        >
          Claude docs
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </section>
  );
}

function CodingSessionRow({
  session,
  onInspect,
}: {
  session: CodingSessionView;
  onInspect: () => void;
}) {
  const meta = providerMeta(session.provider);
  const Icon = meta?.icon ?? Code2;
  const title = session.conversation?.title?.trim() || "Untitled conversation";
  const verdict = fidelityVerdict(session.fidelity);
  const dispatch = useAppDispatch();
  const sourceApp = meta?.sourceApp ?? session.provider;

  return (
    <div className="group/entity-ref flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0 hover:bg-muted/30">
      <button
        type="button"
        onClick={onInspect}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Inspect ${title}`}
      >
        <Icon className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <EntityRef
          token="conversation"
          id={session.conversation_id}
          name={title}
          showIcon={false}
          fill
        />
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{meta?.label ?? formatText(session.provider)}</span>
          <span aria-hidden>·</span>
          <span>{verdict.label}</span>
          <span aria-hidden>·</span>
          <span>{new Date(session.last_seen_at).toLocaleString()}</span>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
          verdict.tone === "native"
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : verdict.tone === "mirror"
              ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        )}
      >
        {verdict.label}
      </span>
      <ItemMenu
        config={() =>
          buildConversationMenu({
            conversationId: session.conversation_id,
            title,
            isFavorite: false,
            isArchived: session.status === "archived",
            excludeFromKg: false,
            href: `/chat/${session.conversation_id}`,
            source: { app: sourceApp, feature: "code-editor" },
            dispatch,
          })
        }
        align="end"
      >
        <button
          type="button"
          aria-label={`Share, fork, or manage ${title}`}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </ItemMenu>
    </div>
  );
}

function CodingSessionDetail({
  session,
  onBack,
}: {
  session: CodingSessionView;
  onBack: () => void;
}) {
  const dispatch = useAppDispatch();
  const meta = providerMeta(session.provider);
  const title = session.conversation?.title?.trim() || "Untitled conversation";
  const verdict = fidelityVerdict(session.fidelity);
  const sourceApp = meta?.sourceApp ?? session.provider;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border/40 px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to coding sessions"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <EntityRef
            token="conversation"
            id={session.conversation_id}
            name={title}
            showIcon={false}
            alwaysShowActions
          />
          <div className="text-xs text-muted-foreground">
            {meta?.label ?? formatText(session.provider)} · {verdict.label}
          </div>
        </div>
        <ItemMenu
          config={() =>
            buildConversationMenu({
              conversationId: session.conversation_id,
              title,
              isFavorite: false,
              isArchived: session.status === "archived",
              excludeFromKg: false,
              href: `/chat/${session.conversation_id}`,
              source: { app: sourceApp, feature: "code-editor" },
              dispatch,
            })
          }
          align="end"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share or fork
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </ItemMenu>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        <section
          className={cn(
            "rounded-lg border p-3",
            verdict.tone === "native"
              ? "border-emerald-500/40 bg-emerald-500/5"
              : verdict.tone === "mirror"
                ? "border-sky-500/40 bg-sky-500/5"
                : "border-amber-500/40 bg-amber-500/5",
          )}
        >
          <h2 className="text-sm font-semibold text-foreground">
            {verdict.label}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {verdict.detail}
          </p>
        </section>

        <dl className="mt-4 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          <DetailTerm>Platform</DetailTerm>
          <DetailValue>
            {meta?.label ?? formatText(session.provider)}
          </DetailValue>
          <DetailTerm>Origin</DetailTerm>
          <DetailValue>{formatText(session.origin)}</DetailValue>
          <DetailTerm>Status</DetailTerm>
          <DetailValue>{formatText(session.status)}</DetailValue>
          <DetailTerm>Last activity</DetailTerm>
          <DetailValue>
            {new Date(session.last_seen_at).toLocaleString()}
          </DetailValue>
          <DetailTerm>Runtime</DetailTerm>
          <DetailValue>
            {session.runtime_kind
              ? formatText(session.runtime_kind)
              : "No managed runtime recorded"}
          </DetailValue>
          <DetailTerm>Conversation</DetailTerm>
          <DetailValue>
            <EntityRef
              token="conversation"
              id={session.conversation_id}
              name={title}
              alwaysShowActions
            />
          </DetailValue>
        </dl>
      </div>
    </div>
  );
}

function DetailTerm({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </dt>
  );
}

function DetailValue({ children }: { children: React.ReactNode }) {
  return <dd className="min-w-0 text-foreground">{children}</dd>;
}

export default PluginsSection;
