"use client";

import Link from "next/link";
import { ArrowRight, CircleDot, MessageSquareText } from "lucide-react";
import { RichDocument } from "@/features/rich-document/RichDocument";
import AssociateTaskButton from "@/features/tasks/widgets/AssociateTaskButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatAbsoluteDate } from "@/utils/datetime";
import { formatText } from "@/utils/text/text-case-converter";
import {
  appLabel,
  featureLabel,
} from "@/features/agents/redux/conversation-history/source-registry";
import type { ProviderConversationDetail } from "../service/providerConversation";

export function ProviderConversationTranscript({
  detail,
}: {
  detail: ProviderConversationDetail;
}) {
  const { conversation, messages, visibleMessageCount, hasEarlierMessages } =
    detail;
  const title = conversation.title?.trim() || "Untitled conversation";
  const provider = appLabel(conversation.source_app);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-5 sm:px-6">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-violet-500/10 px-2 py-1 font-medium text-violet-700 dark:text-violet-300">
                {provider}
              </span>
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
            </p>
          </div>
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

      {hasEarlierMessages ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-foreground">
          Showing the most recent {messages.length} visible messages. Earlier
          messages remain stored but are not loaded on this page yet.
        </p>
      ) : null}

      {messages.length === 0 ? (
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
          {messages.map((message) => (
            <ProviderTranscriptMessage
              key={message.id}
              message={message}
              provider={provider}
            />
          ))}
        </ol>
      )}
    </div>
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
            captured
          </p>
        ) : null}
      </article>
    </li>
  );
}
