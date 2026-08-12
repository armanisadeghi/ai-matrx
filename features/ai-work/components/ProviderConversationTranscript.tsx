"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronUp,
  CircleAlert,
  CircleDot,
  Loader2,
  MessageSquareText,
  MoreHorizontal,
} from "lucide-react";
import { RichDocument } from "@/features/rich-document/RichDocument";
import AssociateTaskButton from "@/features/tasks/widgets/AssociateTaskButton";
import { Button } from "@/components/ui/button";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { useAppDispatch } from "@/lib/redux/hooks";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { cn } from "@/lib/utils";
import { formatAbsoluteDate } from "@/utils/datetime";
import { formatText } from "@/utils/text/text-case-converter";
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
import { workspaceName } from "../lib/codingSessionPresentation";
import type { ProviderConversationDetail } from "../service/providerConversation";
import {
  fetchEarlierProviderMessages,
  fetchProviderConversationState,
} from "../service/providerConversationClient";
import type { ProviderConversationMessage } from "../lib/providerConversationMessage";
import { buildProviderTimeline } from "../lib/providerTimeline";
import { ConversationOrganizationPanel } from "./ConversationOrganizationPanel";

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
  const provider = appLabel(conversation.source_app);

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

  useEffect(() => {
    let cancelled = false;
    // Owner-scoped binding read purely for the workspace/project provenance
    // chip; sessions without the workspace_name contract simply show nothing.
    void fetchCodingSessionBindings(conversation.id)
      .then((bindings) => {
        if (cancelled) return;
        for (const binding of bindings) {
          const name = workspaceName(binding.metadata);
          if (name) {
            setWorkspace(name);
            return;
          }
        }
      })
      .catch((error: unknown) => {
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
  const hasEarlierAnything = hasEarlierMessages || activity.hasMore;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
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
              <span>{featureLabel(conversation.source_feature)}</span>
              <span aria-hidden>·</span>
              <span>{formatText(conversation.status)}</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold text-foreground">
              {title}
            </h1>
            {conversation.description ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {conversation.description}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Updated {formatAbsoluteDate(conversation.updated_at)} ·{" "}
              {visibleMessageCount} visible{" "}
              {visibleMessageCount === 1 ? "message" : "messages"}
              {activity.totalCount !== null
                ? ` · ${activity.totalCount} tool ${
                    activity.totalCount === 1 ? "action" : "actions"
                  }`
                : null}
            </p>
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

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3">
        <CircleDot className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <p className="min-w-0 flex-1 text-sm text-foreground">
          This is a read-only mirror of work captured from {provider}. Starting
          an AI Matrx chat creates a separate conversation; it does not resume
          the provider session.
        </p>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link href="/chat/new">
            Start AI Matrx chat
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </section>

      <ConversationOrganizationPanel conversationId={conversation.id} />

      {hasEarlierAnything ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
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
            {messages.length - timeline.hiddenMessages} of{" "}
            {visibleMessageCount} messages
            {activity.totalCount !== null
              ? ` and ${shownToolCalls} of ${activity.totalCount} tool actions`
              : null}
            . Earlier history stays stored and loads in order.
          </p>
        </div>
      ) : null}
      {earlierError ? (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" />
          {earlierError}
        </p>
      ) : null}
      {activity.state === "error" ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground">
          <CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          Tool activity could not be loaded: {activity.error}
        </p>
      ) : null}

      {timeline.items.length === 0 && activity.state !== "loading" ? (
        <section className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <MessageSquareText className="mx-auto h-7 w-7 text-muted-foreground/60" />
          <h2 className="mt-2 text-sm font-medium text-foreground">
            No visible messages yet
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            The provider session is known, but it has not projected a visible
            prompt or response into this conversation.
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
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteStateKnown, setFavoriteStateKnown] = useState(false);
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
    void readCanonicalState();
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
  const roleLabel = isUser
    ? "You"
    : message.role === "assistant"
      ? provider
      : formatText(message.role);

  return (
    <li className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <article
        className={cn(
          "w-full max-w-3xl rounded-xl border px-4 py-3 shadow-sm",
          isUser ? "border-primary/20 bg-primary/5" : "border-border bg-card",
        )}
      >
        <header className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{roleLabel}</span>
          <time dateTime={message.created_at}>
            {formatAbsoluteDate(message.created_at)}
          </time>
        </header>
        {message.display.text ? (
          <RichDocument
            content={message.display.text}
            source={{ type: "raw" }}
            actionsVariant="icon-only"
            actionsPosition="top-right"
            actionsBehavior="hover-only"
            contentClassName="text-sm"
          />
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
