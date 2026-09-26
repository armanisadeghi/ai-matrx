"use client";

// features/ai-work/conversations/components/MatrxConversationDetail.tsx
//
// The provenance view for an AI Matrx conversation — the ~92% of the corpus
// that is NOT a provider mirror.
//
// This route used to REDIRECT these straight to /chat, which meant the one
// surface that explains where a conversation's data comes from was unreachable
// for almost every conversation. It now renders here, with runnable chat as a
// prominent door rather than a silent hop. The transcript stays provider-only:
// a mirror is the only kind with no chat home, and /chat already renders these
// perfectly.

import Link from "next/link";
import {
  ArrowRight,
  Info,
  MessagesSquare,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { formatSessionTimestamp } from "@/features/agent-connections/coding-sessions/verdict";
import { ConversationAnalyzePanel } from "@/features/ai-work/analysis/ConversationAnalyzePanel";
import { ConversationOrganizationPanel } from "@/features/ai-work/components/ConversationOrganizationPanel";
import type { ProviderConversation } from "@/features/ai-work/service/providerConversation";
import { conversationTypeLabel } from "../presentation";
import { ConversationProvenancePanel } from "./ConversationProvenancePanel";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export function MatrxConversationDetail({
  conversation,
  runnable,
}: {
  conversation: ProviderConversation;
  /** True when an agent owns this conversation, i.e. /chat can actually run it. */
  runnable: boolean;
}) {
  const title = conversation.title?.trim() || "Untitled conversation";

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-5">
      <section className="border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {conversationTypeLabel(conversation.conversation_type)} ·{" "}
              {conversation.message_count} message
              {conversation.message_count === 1 ? "" : "s"} · updated{" "}
              {formatSessionTimestamp(conversation.updated_at)}
            </p>
            <div className="mt-1.5">
              <EntityRef
                token="conversation"
                id={conversation.id}
                name={title}
                href={runnable ? `/chat/${conversation.id}` : undefined}
                alwaysShowActions
                fill
                className="text-lg font-semibold text-foreground"
              />
            </div>
          </div>
          {runnable ? (
            <Button asChild size="sm" className="gap-1.5">
              <Link href={`/chat/${conversation.id}`}>
                Open in chat
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <p className="max-w-64 text-xs leading-relaxed text-muted-foreground">
              <MessagesSquare className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
              No agent owns this conversation, so it cannot be continued in
              chat. It stays readable and analyzable here.
            </p>
          )}
        </div>
      </section>

      <Tabs defaultValue="source" className="mt-3">
        <TabsList className="scrollbar-none h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="source"
            className="min-h-10 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Info className="h-3.5 w-3.5" />
            Source
          </TabsTrigger>
          <TabsTrigger
            value="analyze"
            className="min-h-10 shrink-0 gap-1.5 rounded-none border-b-2 border-transparent px-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <AGENT_ICON className="h-3.5 w-3.5" />
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
        <TabsContent value="source" className="mt-4">
          <ConversationProvenancePanel conversation={conversation} />
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
