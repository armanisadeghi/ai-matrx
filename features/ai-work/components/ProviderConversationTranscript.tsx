"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  ChevronUp,
  CircleAlert,
  CircleDot,
  FileText,
  Info,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
  Network,
  RefreshCw,
} from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import AssociateTaskButton from "@/features/tasks/widgets/AssociateTaskButton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { useAppDispatch } from "@/lib/redux/hooks";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { cn } from "@/lib/utils";
import { formatAbsoluteDate } from "@/utils/datetime";
import { formatText } from "@ai-matrx/kit/text-case";
import {
  appLabel,
  featureLabel,
} from "@/features/agents/redux/conversation-history/source-registry";
import { ToolCallVisualization } from "@/features/tool-call-visualization/components/ToolCallVisualization";
import { ToolCallBatch } from "@/features/tool-call-visualization/components/ToolCallBatch";
import { cxToolCallToLifecycleEntry } from "@/features/tool-call-visualization/utils/cxToolCallToLifecycleEntry";
import { fetchConversationToolCallsPage } from "@/features/tool-call-visualization/service/fetchConversationToolCalls";
import type { CxToolCallRecord } from "@/features/agents/redux/execution-system/observability/observability.slice";
import { fetchCodingSessionBindings } from "@/features/agent-connections/coding-sessions/service";
import { formatSessionTimestamp } from "@/features/agent-connections/coding-sessions/verdict";
import { workspaceName } from "../lib/codingSessionPresentation";
import {
  codingToolFromSource,
  resolveCodingTool,
} from "../lib/providerSource";
import type { ProviderConversationDetail } from "../service/providerConversation";
import {
  fetchEarlierProviderMessages,
  fetchProviderConversationState,
} from "../service/providerConversationClient";
import type { ProviderConversationMessage } from "../lib/providerConversationMessage";
import { buildProviderTimeline } from "../lib/providerTimeline";
import { ConversationAnalyzePanel } from "../analysis/ConversationAnalyzePanel";
import { ConversationProvenancePanel } from "../conversations/components/ConversationProvenancePanel";
import {
  artifactCountLabel,
  ConversationArtifactsPanel,
} from "../conversations/components/ConversationArtifactsPanel";
import { useCodingSessionArtifacts } from "../conversations/artifacts/useCodingSessionArtifacts";
import {
  artifactSessions,
  type ArtifactSessionRef,
} from "../conversations/bindingPlurality";
import { ConversationOrganizationPanel } from "./ConversationOrganizationPanel";
import { AiMatrxReplyComposer } from "../conversations/components/AiMatrxReplyComposer";
import { transcriptAuthorship } from "../lib/providerTranscriptAuthorship";
import { AgentUserMessageContent } from "@/features/agents/components/messages-display/user/AgentUserMessage";
import {
  useLiveProviderTranscript,
  type LiveTranscriptArrival,
  type LiveTranscriptStatus,
} from "../hooks/useLiveProviderTranscript";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** Tool activity page loaded per request — a mirror can hold thousands. */
const TOOL_ACTIVITY_PAGE_SIZE = 200;

interface ToolActivityState {
  records: CxToolCallRecord[];
  state: "loading" | "ready" | "error";
  error: string | null;
  hasMore: boolean;
  totalCount: number | null;
  cursor: string | null;
}

export function ProviderConversationTranscript({
  detail,
}: {
  detail: ProviderConversationDetail;
}) {
  const { conversation, visibleMessageCount } = detail;
  const title = conversation.title?.trim() || "Untitled conversation";
  /**
   * Storage providers of this conversation's coding-session bindings. A reply
   * typed in AI Matrx carries `source_feature = coding_session_reply`, so the
   * tool it belongs to is read from the binding, never guessed.
   */
  const [bindingProviders, setBindingProviders] = useState<readonly string[]>(
    [],
  );
  const familyLabel = appLabel(conversation.source_app);
  const toolNamedByFeature =
    codingToolFromSource(conversation.source_app, conversation.source_feature) !==
    null;
  // Until a reply row's binding read lands, the family label stands in — an
  // honest "Code Plugin", never a guessed tool.
  const provider =
    resolveCodingTool(
      conversation.source_app,
      conversation.source_feature,
      bindingProviders,
    )?.label ?? familyLabel;

  const [messages, setMessages] = useState<ProviderConversationMessage[]>(
    detail.messages,
  );
  const [hasEarlierMessages, setHasEarlierMessages] = useState(
    detail.hasEarlierMessages,
  );
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [earlierError, setEarlierError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ToolActivityState>({
    records: [],
    state: "loading",
    error: null,
    hasMore: false,
    totalCount: null,
    cursor: null,
  });
  const [workspace, setWorkspace] = useState<string | null>(null);
  /**
   * EVERY claimed provider session on this conversation — each one the key a
   * batch of artifact rows carries in `metadata.cli_session_id`. A handed-off
   * conversation has more than one, and keeping a single id made the
   * originating tool's artifacts structurally unreachable on this screen
   * (verifier V-XT-5 § A7). Empty until the binding read lands, and for a
   * conversation whose only bindings are unclaimed handoff offers — an offer
   * has no provider session and produces no artifacts.
   */
  const [sessions, setSessions] = useState<readonly ArtifactSessionRef[]>([]);
  const [bindingRead, setBindingRead] = useState(false);
  /**
   * Rows that arrived AFTER the server render, counted separately so the
   * "showing N of M" line stays truthful while a session keeps writing — the
   * server totals were correct only at first paint.
   */
  const [liveMessagesAdded, setLiveMessagesAdded] = useState(0);
  const [liveToolCallsAdded, setLiveToolCallsAdded] = useState(0);
  /** Every id currently in state — the live poll dedups against these. */
  const knownMessageIdsRef = useRef(
    new Set(detail.messages.map((message) => message.id)),
  );
  const knownToolCallIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // Owner-scoped binding read for the workspace/project provenance chip and
    // the provider session id the artifact panel keys on; sessions without
    // the workspace_name contract simply show no chip.
    void fetchCodingSessionBindings(conversation.id)
      .then((bindings) => {
        if (cancelled) return;
        setBindingRead(true);
        setSessions(artifactSessions(bindings));
        setBindingProviders(bindings.map((binding) => binding.provider));
        for (const binding of bindings) {
          const name = workspaceName(binding.metadata);
          if (name) {
            setWorkspace(name);
            return;
          }
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBindingRead(true);
        console.error(
          "[ProviderConversationTranscript] workspace binding read failed",
          error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  useEffect(() => {
    let cancelled = false;
    void fetchConversationToolCallsPage(conversation.id, {
      limit: TOOL_ACTIVITY_PAGE_SIZE,
    })
      .then((page) => {
        if (cancelled) return;
        for (const record of page.records) {
          knownToolCallIdsRef.current.add(record.id);
        }
        setActivity({
          records: page.records,
          state: "ready",
          error: null,
          hasMore: page.hasMore,
          totalCount: page.totalCount,
          cursor: page.oldestStartedAt,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setActivity((existing) => ({
          ...existing,
          state: "error",
          error:
            error instanceof Error
              ? error.message
              : "Tool activity read failed",
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  const loadEarlier = useCallback(() => {
    setLoadingEarlier(true);
    setEarlierError(null);
    const wants: Promise<void>[] = [];

    if (hasEarlierMessages && messages.length > 0) {
      wants.push(
        fetchEarlierProviderMessages(
          conversation.id,
          messages[0].position,
        ).then((page) => {
          setMessages((existing) => {
            const known = new Set(existing.map((message) => message.id));
            return [
              ...page.messages.filter((message) => !known.has(message.id)),
              ...existing,
            ];
          });
          for (const message of page.messages) {
            knownMessageIdsRef.current.add(message.id);
          }
          setHasEarlierMessages(page.hasEarlierMessages);
        }),
      );
    }

    if (activity.hasMore && activity.cursor) {
      const cursor = activity.cursor;
      wants.push(
        fetchConversationToolCallsPage(conversation.id, {
          limit: TOOL_ACTIVITY_PAGE_SIZE,
          beforeStartedAt: cursor,
        }).then((page) => {
          for (const record of page.records) {
            knownToolCallIdsRef.current.add(record.id);
          }
          setActivity((current) => {
            const known = new Set(current.records.map((record) => record.id));
            return {
              ...current,
              records: [
                ...page.records.filter((record) => !known.has(record.id)),
                ...current.records,
              ],
              hasMore: page.hasMore,
              cursor: page.oldestStartedAt ?? current.cursor,
            };
          });
        }),
      );
    }

    void Promise.all(wants)
      .catch((error: unknown) => {
        setEarlierError(
          error instanceof Error ? error.message : "Loading earlier failed",
        );
      })
      .finally(() => {
        setLoadingEarlier(false);
      });
  }, [
    conversation.id,
    hasEarlierMessages,
    messages,
    activity.hasMore,
    activity.cursor,
  ]);

  /**
   * Newest-side arrivals from the live poll. Both streams append at the TAIL,
   * which the honesty floor never trims (it only withholds rows OLDER than the
   * loaded window), so a live row can never be rendered against a gap. Dedup is
   * by id: the tool-call cursor is tie-inclusive on purpose, and a manual
   * "Check now" can overlap a scheduled read.
   */
  const handleArrival = useCallback((arrival: LiveTranscriptArrival) => {
    const knownMessages = knownMessageIdsRef.current;
    const freshMessages = arrival.messages.filter(
      (message) => !knownMessages.has(message.id),
    );
    // Claimed BEFORE the state update: dedup must not live inside the updater
    // (updaters are pure and may run twice), and an overlapping "Check now"
    // must not add the same row again.
    for (const message of freshMessages) knownMessages.add(message.id);

    const knownToolCalls = knownToolCallIdsRef.current;
    const freshToolCalls = arrival.toolCalls.filter(
      (record) => !knownToolCalls.has(record.id),
    );
    for (const record of freshToolCalls) knownToolCalls.add(record.id);

    if (freshMessages.length > 0) {
      setMessages((existing) => [...existing, ...freshMessages]);
      setLiveMessagesAdded((count) => count + freshMessages.length);
    }
    if (freshToolCalls.length > 0) {
      setActivity((current) => ({
        ...current,
        records: [...current.records, ...freshToolCalls],
      }));
      setLiveToolCallsAdded((count) => count + freshToolCalls.length);
    }
  }, []);

  const live = useLiveProviderTranscript({
    conversationId: conversation.id,
    latestPosition:
      messages.length > 0 ? messages[messages.length - 1].position : -1,
    latestStartedAt:
      activity.records.length > 0
        ? activity.records[activity.records.length - 1].startedAt
        : null,
    onArrival: handleArrival,
  });

  const timeline = useMemo(
    () =>
      buildProviderTimeline({
        messages,
        toolCalls: activity.records,
        hasEarlierMessages,
        toolCallsHaveMore: activity.hasMore,
      }),
    [messages, activity.records, hasEarlierMessages, activity.hasMore],
  );

  const shownToolCalls = activity.records.length - timeline.hiddenToolCalls;
  const totalMessages = visibleMessageCount + liveMessagesAdded;
  const totalToolCalls =
    activity.totalCount === null
      ? null
      : activity.totalCount + liveToolCallsAdded;
  const hasEarlierAnything = hasEarlierMessages || activity.hasMore;

  const artifacts = useCodingSessionArtifacts(sessions);
  const artifactSummary =
    artifacts.state === "ready"
      ? artifacts.groups.length > 1
        ? `${artifactCountLabel(artifacts.rows.length)} across ${artifacts.groups.length} tools`
        : artifactCountLabel(artifacts.rows.length)
      : artifacts.state === "error"
        ? "artifacts unavailable"
        : bindingRead && sessions.length === 0
          ? null
          : "counting artifacts…";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6">
      <section className="border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-violet-500/10 px-2 py-1 font-medium text-violet-700 dark:text-violet-300">
                {provider}
              </span>
              {workspace ? (
                <span
                  className="max-w-56 truncate rounded-full bg-sky-500/10 px-2 py-1 font-medium text-sky-700 dark:text-sky-300"
                  title={`Workspace: ${workspace}`}
                >
                  {workspace}
                </span>
              ) : null}
              <span>
                {toolNamedByFeature
                  ? familyLabel
                  : `${familyLabel} · ${featureLabel(conversation.source_feature)}`}
              </span>
              <span aria-hidden>·</span>
              <span>{formatText(conversation.status)}</span>
            </div>
            {conversation.description ? (
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {conversation.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Updated {formatAbsoluteDate(conversation.updated_at)} ·{" "}
              {totalMessages} visible{" "}
              {totalMessages === 1 ? "message" : "messages"}
              {totalToolCalls !== null
                ? ` · ${totalToolCalls} tool ${
                    totalToolCalls === 1 ? "action" : "actions"
                  }`
                : null}
              {artifactSummary ? ` · ${artifactSummary}` : null}
            </p>
            <LiveTranscriptIndicator status={live} />
          </div>
          <div className="flex items-center gap-1.5">
            <AssociateTaskButton
              entityType="conversation"
              entityId={conversation.id}
              label={title}
              metadata={{
                sourceApp: conversation.source_app,
                sourceFeature: conversation.source_feature,
              }}
              prePopulate={{ title: `Follow up: ${title}` }}
              variant="button"
              label_text="Attach to task"
            />
            <TranscriptConversationMenu
              conversation={conversation}
              title={title}
            />
          </div>
        </div>
      </section>
      <Tabs defaultValue="conversation" className="mt-3">
        <TabsList className="scrollbar-none h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="conversation"
            className="min-h-10 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            Conversation
          </TabsTrigger>
          <TabsTrigger
            value="source"
            className="min-h-10 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Info className="h-3.5 w-3.5" />
            Source
          </TabsTrigger>
          <TabsTrigger
            value="files"
            className="min-h-10 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <FileText className="h-3.5 w-3.5" />
            Files
          </TabsTrigger>
          <TabsTrigger
            value="analyze"
            className="min-h-10 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <BrainCircuit className="h-3.5 w-3.5" />
            Analyze
          </TabsTrigger>
          <TabsTrigger
            value="organize"
            className="min-h-10 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Network className="h-3.5 w-3.5" />
            Organize
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="mt-4 space-y-4">
          <section className="flex flex-col items-stretch gap-3 border-l-2 border-sky-500 bg-sky-500/5 px-3 py-2.5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
              <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 sm:mt-0 dark:text-sky-400" />
              <p className="min-w-0 text-sm text-foreground">
                {provider} is mirrored here and cannot be changed from AI Matrx.
                Replies below stay in AI Matrx and are answered by an AI Matrx
                agent.
              </p>
            </div>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="gap-1.5 sm:shrink-0"
            >
              <Link href="/chat/new">
                New AI Matrx chat
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </section>

          {hasEarlierAnything ? (
            <div className="flex flex-wrap items-center gap-3 border-b border-border pb-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={loadEarlier}
                disabled={loadingEarlier}
              >
                {loadingEarlier ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
                Load earlier
              </Button>
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                Showing {timeline.items.length > 0 ? "the most recent" : ""}{" "}
                {messages.length - timeline.hiddenMessages} of {totalMessages}{" "}
                messages
                {totalToolCalls !== null
                  ? ` and ${shownToolCalls} of ${totalToolCalls} tool actions`
                  : null}
                . Earlier history stays stored and loads in order.
              </p>
            </div>
          ) : null}
          {earlierError ? (
            <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" />
              {earlierError}
              <ErrorAlchemyMenu error={earlierError} />
            </p>
          ) : null}
          {activity.state === "error" ? (
            <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground">
              <CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              Tool activity could not be loaded: {activity.error}
              <ErrorAlchemyMenu error={activity.error} />
            </p>
          ) : null}

          {timeline.items.length === 0 && activity.state !== "loading" ? (
            <section className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
              <MessageSquareText className="mx-auto h-7 w-7 text-muted-foreground/60" />
              <h2 className="mt-2 text-sm font-medium text-foreground">
                No visible messages yet
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                The provider session is known, but it has not projected a
                visible prompt or response into this conversation.
              </p>
            </section>
          ) : (
            <ol
              className="space-y-4"
              aria-label={`${provider} conversation transcript`}
            >
              {activity.state === "loading" ? (
                <li className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading tool activity…
                </li>
              ) : null}
              {timeline.items.map((item) =>
                item.kind === "message" ? (
                  <ProviderTranscriptMessage
                    key={item.message.id}
                    message={item.message}
                    provider={provider}
                  />
                ) : (
                  <ProviderActivityGroup
                    key={item.records[0].id}
                    records={item.records}
                    conversationId={conversation.id}
                  />
                ),
              )}
            </ol>
          )}

          <AiMatrxReplyComposer
            conversationId={conversation.id}
            conversationOrganizationId={conversation.organization_id}
            onAnswered={live.refreshNow}
          />
        </TabsContent>

        <TabsContent value="source" className="mt-4">
          <ConversationProvenancePanel conversation={conversation} />
        </TabsContent>

        <TabsContent value="files" className="mt-4">
          <ConversationArtifactsPanel
            artifacts={artifacts}
            hasSession={!bindingRead || sessions.length > 0}
          />
        </TabsContent>

        <TabsContent value="analyze" className="mt-4">
          <ConversationAnalyzePanel
            conversationId={conversation.id}
            conversationTitle={title}
          />
        </TabsContent>

        <TabsContent value="organize" className="mt-4">
          <ConversationOrganizationPanel conversationId={conversation.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * States the live mode TRUTHFULLY, in the user's words, and never implies more
 * than the mechanism delivers: this reads the newest side every few seconds
 * while the session is delivering, and it says so. When the session settles it
 * says that too, and stops — an idle mirror months old must not poll forever.
 * Returning to the tab re-checks on its own; "Check now" is the manual door.
 */
function LiveTranscriptIndicator({ status }: { status: LiveTranscriptStatus }) {
  if (status.mode === "checking" && !status.error) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking whether this session is still running…
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {status.mode === "live" ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Live — new turns and tool activity appear here every few seconds
        </span>
      ) : (
        <span className="text-muted-foreground">
          {/* WHEN it went quiet is the fact that makes "idle" actionable — a
              session that stopped two minutes ago and one that stopped last
              week read identically without it, and a tester reading only
              "idle" cannot tell a settled session from a broken feature. */}
          This session is idle, so live updates are paused.
          {status.lastSeenAt
            ? ` It last delivered on ${formatSessionTimestamp(status.lastSeenAt)}.`
            : " It has never delivered a session."}
        </span>
      )}
      <button
        type="button"
        onClick={status.checkNow}
        disabled={status.busy}
        className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
      >
        <RefreshCw className={cn("h-3 w-3", status.busy && "animate-spin")} />
        Check now
      </button>
      {status.error ? (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <CircleAlert className="h-3 w-3 shrink-0" />
          Live updates stopped: {status.error}
          <ErrorAlchemyMenu error={status.error} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * The canonical conversation menu (pin / share / archive / duplicate / KG)
 * on the transcript surface — the same registry every conversation list row
 * consumes. Delete stays hidden because the provider binding would survive
 * and become a dead door.
 */
function TranscriptConversationMenu({
  conversation,
  title,
}: {
  conversation: ProviderConversationDetail["conversation"];
  title: string;
}) {
  const dispatch = useAppDispatch();
  // Seeded from the server read, which already resolved the canonical
  // user_entity_state flag — so the Favorite item is present and correct on
  // first paint instead of appearing a round-trip later.
  const [isFavorite, setIsFavorite] = useState(conversation.is_favorite);
  const [favoriteStateKnown, setFavoriteStateKnown] = useState(true);
  const [isArchived, setIsArchived] = useState(
    conversation.status === "archived",
  );
  const [excludeFromKg, setExcludeFromKg] = useState(
    conversation.exclude_from_kg ?? false,
  );

  const readCanonicalState = useCallback(async () => {
    const [favoriteResult, mutableState] = await Promise.all([
      favoritesService.getBulk("conversation", [conversation.id]),
      fetchProviderConversationState(conversation.id),
    ]);
    if (isScopesRpcErr(favoriteResult)) {
      console.error(
        "[TranscriptConversationMenu] favorite-state read failed",
        favoriteResult.error,
      );
      setFavoriteStateKnown(false);
    } else {
      setIsFavorite(
        favoriteResult.data.items.some((state) => state.isFavorite),
      );
      setFavoriteStateKnown(true);
    }
    if (mutableState) {
      setIsArchived(mutableState.status === "archived");
      setExcludeFromKg(mutableState.excludeFromKg);
    }
  }, [conversation.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void readCanonicalState();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [readCanonicalState]);

  const onMutationSuccess = useCallback(() => {
    // The thunks own the DB write; reconcile this page's local snapshot.
    void readCanonicalState();
  }, [readCanonicalState]);

  return (
    <ItemMenu
      config={() =>
        buildConversationMenu({
          conversationId: conversation.id,
          title,
          isFavorite,
          isArchived,
          excludeFromKg,
          href: `/work/conversations/${conversation.id}`,
          source: {
            app: conversation.source_app,
            feature: conversation.source_feature,
          },
          showRename: false,
          showFavorite: favoriteStateKnown,
          showDelete: false,
          onMutationSuccess,
          dispatch,
        })
      }
      align="end"
    >
      <button
        type="button"
        aria-label={`Share, pin, archive, or manage ${title}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </ItemMenu>
  );
}

/**
 * A consecutive run of provider tool calls, rendered through the canonical
 * tool-call system: one `ToolCallVisualization` per call, folded behind the
 * standard `ToolCallBatch` line when the run has 2+ calls.
 */
function ProviderActivityGroup({
  records,
  conversationId,
}: {
  records: CxToolCallRecord[];
  conversationId: string;
}) {
  const entries = useMemo(
    () => records.map(cxToolCallToLifecycleEntry),
    [records],
  );

  return (
    <li className="flex justify-start">
      <div className="w-full max-w-3xl">
        {entries.length === 1 ? (
          <ToolCallVisualization
            entries={entries}
            conversationId={conversationId}
            isPersisted
          />
        ) : (
          <ToolCallBatch
            entries={entries}
            conversationId={conversationId}
            isPersisted
          >
            {entries.map((entry) => (
              <ToolCallVisualization
                key={entry.callId}
                entries={[entry]}
                conversationId={conversationId}
                isPersisted
              />
            ))}
          </ToolCallBatch>
        )}
      </div>
    </li>
  );
}

function ProviderTranscriptMessage({
  message,
  provider,
}: {
  message: ProviderConversationDetail["messages"][number];
  provider: string;
}) {
  const isUser = message.role === "user";
  const authorship = transcriptAuthorship(message, provider);

  return (
    <li className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <article
        className={cn(
          "w-full px-3 py-2.5",
          // A Matrx-authored turn on a bound conversation is VISIBLY marked:
          // a solid accent edge, not a subtle tint, so nobody reads our words
          // as the coding tool's.
          isUser
            ? cn(
                "max-w-3xl rounded-lg border bg-muted",
                authorship.fromMatrx ? "border-violet-500/60" : "border-border",
              )
            : cn(
                "max-w-4xl border-l-2 bg-transparent pl-4",
                authorship.fromMatrx
                  ? "border-violet-500"
                  : "border-sky-500/70",
              ),
        )}
      >
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-foreground">
              {authorship.label}
            </span>
            {authorship.fromMatrx && !isUser ? (
              <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 font-medium text-violet-700 dark:text-violet-300">
                in AI Matrx
              </span>
            ) : null}
            {authorship.note ? <span>{authorship.note}</span> : null}
          </span>
          <time dateTime={message.created_at}>
            {formatAbsoluteDate(message.created_at)}
          </time>
        </header>
        {message.display.text ? (
          isUser ? (
            <AgentUserMessageContent
              conversationId={message.conversation_id}
              text={message.display.text}
              attachmentParts={[]}
            />
          ) : (
            <MarkdownStream imagePolicy="ai"
              content={message.display.text}
              className="text-sm text-foreground"
              hideCopyButton={false}
              allowFullScreenEditor={false}
            />
          )
        ) : (
          <p className="text-sm text-muted-foreground">
            {message.contentValid
              ? "This message has no displayable text."
              : "This stored message could not be rendered."}
          </p>
        )}
        {message.display.activityCount > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {message.display.activityCount} non-text provider{` `}
            {message.display.activityCount === 1
              ? "activity"
              : "activities"}{" "}
            captured inside this message
          </p>
        ) : null}
      </article>
    </li>
  );
}
