"use client";

/**
 * "TALK TO THIS RECORD" — THE PLATFORM'S ONE CHAT, BOUND TO ONE RECORD.
 *
 * AGT-N-9 / PRODUCTS row 11. `@ai-matrx/records-ui`'s `RecordChat` builds the SCOPE — one
 * call to `custom.record_scope_context`, which assembles the record's Fields with their
 * `(record, field, value version)` triples, its relations one hop out, its history, its
 * comments and its Table's other records INSIDE the database, every piece through the read
 * door under this person's own field-level security — and hands it to the host's `chat`
 * port. This file is that port.
 *
 * 🚨 IT RENDERS THE EXISTING SURFACE, NOT A NEW ONE. `AgentConversationColumn` is the
 * platform's single chat column: the same transcript, the same composer, the same streaming,
 * the same tool cards, the same approval cards. A second chat beside a record would be the
 * parallel layer the canvas ruling forbids, and it would drift within a month.
 *
 * 🚨 THE BINDING IS DURABLE, AND IT IS NOT THIS COMPONENT'S OPINION. The conversation is
 * bound to the record through `conversationScopeBind`, which writes ONE
 * `platform.associations` edge and is decided by the store's own ladder — a person who may
 * not open the record cannot bind a chat to it. Once bound, EVERY turn's context is
 * assembled server-side by `aidream`'s `record_scope_block`, whether the turn comes from
 * this panel, from `/chat/<id>` later, or from a scheduled run. Nothing about the grounding
 * lives in this browser.
 *
 * WHAT THE PERSON SEES THAT THEY WOULD NOT OTHERWISE: the scope chip ("About: Acme
 * Industrial"), the suggested questions this record's own shape produced, and — when the
 * store withheld a Field — the sentence saying which Field and why, above the composer,
 * before they ask a question whose answer would be missing it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RecordChatContext } from "@ai-matrx/records-ui";
import { useRecordsClient } from "@ai-matrx/records/react";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { stashChatDraftTransfer } from "@/features/agents/components/chat/chat-draft-transfer";
import {
  UNIFIED_DATA_CAMPAIGN,
  UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE,
} from "@/lib/knobs/unifiedDataCampaign";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface RecordScopedChatProps {
  ctx: RecordChatContext;
  className?: string;
}

export function RecordScopedChat({ ctx, className }: RecordScopedChatProps) {
  // The campaign switch, read on the runtime entry point that reaches the store.
  const campaignOn = UNIFIED_DATA_CAMPAIGN.enabled();
  const client = useRecordsClient();
  const { conversationId } = useAgentLauncher(DEFAULT_NEW_CHAT_MANDATE_KEY, {
    // Derived from the record, so two record chats open at once never fight over focus.
    surfaceKey: ctx.surfaceKey,
    mandateKey: DEFAULT_NEW_CHAT_MANDATE_KEY,
    sourceFeature: "unified-data-record-chat",
  } as never) as { conversationId: string | null };

  const [bound, setBound] = useState<"pending" | "bound" | { refused: string }>("pending");
  const boundFor = useRef<string | null>(null);

  useEffect(() => {
    if (!campaignOn || !conversationId) return;
    const key = `${conversationId}:${ctx.recordId}`;
    if (boundFor.current === key) return;
    boundFor.current = key;
    let cancelled = false;
    void client
      .conversationScopeBind({ conversation_id: conversationId, record_id: ctx.recordId })
      .then((answered) => {
        if (cancelled) return;
        // NOTHING FAILS SILENTLY. A chat that looks bound and is not would answer about
        // this record from nothing at all, which is the one failure a record chat may
        // never have.
        setBound(answered.ok ? "bound" : { refused: answered.error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [campaignOn, client, conversationId, ctx.recordId]);

  const ask = useCallback(
    (question: string) => {
      if (!conversationId) return;
      stashChatDraftTransfer({ conversationId, text: question } as never);
    },
    [conversationId],
  );

  const withheldLine = useMemo(() => ctx.says, [ctx.says]);

  if (!campaignOn) {
    return (
      <p className={cn("rounded border border-dashed px-2 py-1 text-xs text-muted-foreground", className)}>
        {UNIFIED_DATA_CAMPAIGN_OFF_SENTENCE}
      </p>
    );
  }

  if (!conversationId) {
    return (
      <p className={cn("px-2 py-1 text-xs text-muted-foreground", className)}>
        Opening a conversation about {ctx.title}…
      </p>
    );
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-2", className)}>
      {/* ONE ROW: the scope chip and the state of the binding. The record's name is not
          repeated below it. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border px-2 py-0.5 font-medium">{ctx.chip}</span>
        {bound === "pending" ? (
          <span className="text-muted-foreground">binding this conversation to the record…</span>
        ) : bound === "bound" ? null : (
          <span className="text-destructive">
            This conversation is NOT bound to {ctx.title} ({bound.refused}), so the agent has not
            been given it. Ask again once that is fixed rather than trusting an answer about it.
          </span>
        )}
      </div>

      {withheldLine ? (
        <p className="rounded border border-dashed px-2 py-1 text-[11px] text-muted-foreground">
          {withheldLine}
        </p>
      ) : null}

      {/* FROM THE RECORD'S OWN SHAPE. A question is offered only when the record carries
          what it would need to answer it — never a fixed list. */}
      {ctx.suggested.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {ctx.suggested.map((q) => (
            <Button key={q} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => ask(q)}>
              {q}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <AgentConversationColumn conversationId={conversationId} surfaceKey={ctx.surfaceKey} />
      </div>
    </div>
  );
}
