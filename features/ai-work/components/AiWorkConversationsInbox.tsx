"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Code2,
  Loader2,
  MessagesSquare,
} from "lucide-react";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import {
  appLabel,
  featureLabel,
} from "@/features/agents/redux/conversation-history/source-registry";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import {
  fetchCodingSessionBindings,
  type CodingSessionBinding,
} from "@/features/agent-connections/coding-sessions/service";
import { providerMeta } from "@/features/agent-connections/coding-sessions/catalog";
import {
  fidelityVerdict,
  formatSessionTimestamp,
} from "@/features/agent-connections/coding-sessions/verdict";
import { formatText } from "@/utils/text/text-case-converter";
import { isProviderSourceApp } from "@/features/ai-work/lib/providerSource";
import {
  accountFingerprint,
  recordedCapabilityLabels,
} from "@/features/ai-work/lib/codingSessionPresentation";
import { ConversationOrganizationPanel } from "./ConversationOrganizationPanel";

function conversationHref(conversation: ConversationListItem): string {
  return conversation.sourceApp && isProviderSourceApp(conversation.sourceApp)
    ? `/work/conversations/${conversation.conversationId}`
    : `/chat/${conversation.conversationId}`;
}

export function AiWorkConversationsInbox() {
  const [selected, setSelected] = useState<ConversationListItem | null>(null);

  return (
    <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(18rem,45%)_minmax(0,1fr)] overflow-hidden md:grid-cols-[minmax(19rem,26rem)_minmax(0,1fr)] md:grid-rows-1">
      <aside className="min-h-0 border-b border-border bg-card md:border-b-0 md:border-r">
        <ConversationHistorySidebar
          scopeId="ai-work-unified-inbox"
          agentIds={[]}
          surfaceId="history-window"
          pageSize={40}
          activeConversationId={selected?.conversationId ?? null}
          onOpenConversation={setSelected}
          openInPlace
          getConversationHref={conversationHref}
          headerSlot={
            <div className="border-b border-border px-3 py-3">
              <h1 className="text-sm font-semibold text-foreground">
                All conversations
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                AI Matrx chats and delivered provider mirrors, one canonical
                history.
              </p>
            </div>
          }
          emptyState={
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              No conversations are available in this source view.
            </p>
          }
        />
      </aside>
      <main className="min-h-0 overflow-y-auto bg-background p-4 scrollbar-thin sm:p-5">
        {selected ? (
          <ConversationInspector
            key={selected.conversationId}
            conversation={selected}
          />
        ) : (
          <EmptyInspector />
        )}
      </main>
    </div>
  );
}

function EmptyInspector() {
  return (
    <div className="mx-auto flex min-h-full max-w-xl items-center justify-center">
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
        <MessagesSquare className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <h2 className="mt-3 text-sm font-semibold text-foreground">
          Choose a conversation
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Inspect its exact source and provider state, then attach it directly
          to a Project, Task, or War Room.
        </p>
      </div>
    </div>
  );
}

function ConversationInspector({
  conversation,
}: {
  conversation: ConversationListItem;
}) {
  const [bindings, setBindings] = useState<CodingSessionBinding[]>([]);
  const [bindingState, setBindingState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [bindingError, setBindingError] = useState<string | null>(null);
  const title = conversation.title?.trim() || "Untitled conversation";
  const href = conversationHref(conversation);
  const providerSource = Boolean(
    conversation.sourceApp && isProviderSourceApp(conversation.sourceApp),
  );

  useEffect(() => {
    let cancelled = false;
    void fetchCodingSessionBindings(conversation.conversationId)
      .then((next) => {
        if (cancelled) return;
        setBindings(next);
        setBindingState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBindings([]);
        setBindingError(
          error instanceof Error ? error.message : "Binding read failed",
        );
        setBindingState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [conversation.conversationId]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span>
                {conversation.sourceApp
                  ? appLabel(conversation.sourceApp)
                  : "AI Matrx"}
              </span>
              <span aria-hidden>·</span>
              <span>
                {conversation.sourceFeature
                  ? featureLabel(conversation.sourceFeature)
                  : "Conversation"}
              </span>
              <span aria-hidden>·</span>
              <span>{formatText(conversation.status)}</span>
            </div>
            <div className="mt-1.5">
              <EntityRef
                token="conversation"
                id={conversation.conversationId}
                name={title}
                href={href}
                alwaysShowActions
                fill
                className="text-lg font-semibold text-foreground"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {conversation.messageCount} message
              {conversation.messageCount === 1 ? "" : "s"} · updated{" "}
              {formatSessionTimestamp(conversation.updatedAt)}
            </p>
          </div>
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <Link href={href}>
              {providerSource ? "Read mirror" : "Open in chat"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <Code2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">
              Provider and delivery state
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Binding facts only. No raw provider ledger or credential data is
              read by this inbox.
            </p>
          </div>
        </div>
        {bindingState === "loading" ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking provider bindings…
          </div>
        ) : bindingState === "error" ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {bindingError}
          </div>
        ) : bindings.length === 0 ? (
          <p className="mt-3 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            {providerSource
              ? "This conversation has provider provenance, but no readable coding-session binding is currently attached."
              : "AI Matrx conversation. No provider coding-session binding is attached."}
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {bindings.map((binding) => (
              <BindingFacts key={binding.id} binding={binding} />
            ))}
          </div>
        )}
      </section>

      <ConversationOrganizationPanel
        conversationId={conversation.conversationId}
      />
    </div>
  );
}

function BindingFacts({ binding }: { binding: CodingSessionBinding }) {
  const meta = providerMeta(binding.provider);
  const verdict = fidelityVerdict(binding.fidelity);
  const fingerprint = accountFingerprint(binding.metadata);
  const capabilities = recordedCapabilityLabels(binding.capabilities);

  return (
    <article className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">
          {meta?.label ?? formatText(binding.provider)}
        </h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
          {verdict.label}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {verdict.detail}
      </p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <Fact label="Provider account">
          {fingerprint ?? "Not reported by this binding"}
        </Fact>
        <Fact label="Session delivery">
          {formatSessionTimestamp(binding.last_seen_at)}
        </Fact>
        <Fact label="Binding state">{formatText(binding.status)}</Fact>
        <Fact label="Session ended">
          {binding.ended_at
            ? formatSessionTimestamp(binding.ended_at)
            : "Not ended"}
        </Fact>
        <Fact label="Origin">{formatText(binding.origin)}</Fact>
        <Fact label="Runtime">
          {binding.runtime_kind
            ? formatText(binding.runtime_kind)
            : "No managed runtime recorded"}
        </Fact>
        <Fact label="Capabilities">
          {capabilities.length > 0 ? capabilities.join(", ") : "None recorded"}
        </Fact>
        <Fact label="Workspace identity">
          {binding.workspace_fingerprint ??
            binding.provider_project_key ??
            "Not reported"}
        </Fact>
        <Fact label="Writer lease">
          {binding.writer_lease_expires_at
            ? `Expires ${formatSessionTimestamp(binding.writer_lease_expires_at)}`
            : "No active lease recorded"}
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
