"use client";

/**
 * "TALK TO THIS RECORD" — THE PLATFORM'S ONE CHAT, BOUND TO ONE RECORD.
 *
 * AGT-N-9 / PRODUCTS row 11. `@ai-matrx/records-ui`'s `RecordChat` builds the record half —
 * the record read through the read door, with the Fields the store masked NAMED rather than
 * silently dropped — and hands it to the host's `chat` port. This file is that port.
 *
 * 🚨 IT RENDERS THE EXISTING SURFACE, NOT A NEW ONE. `AgentConversationColumn` is the
 * platform's single chat column: the same transcript, the same composer, the same streaming,
 * the same tool cards, the same approval cards. A second chat beside a record would be the
 * parallel layer the canvas ruling forbids, and it would drift within a month.
 *
 * 🚨 WHY THE BINDING IS AN RPC HERE AND NOT `client.conversationScopeBind(…)`.
 * `custom.conversation_scope_bind` is LIVE on the database and granted to `authenticated`
 * (lane TALK-TO-RECORD, 2026-09-20); the typed wrapper for it ships in `@ai-matrx/records`
 * 0.19.0, which npm does not hold yet — `latest` is 0.17.0. App code on `main` only ever
 * calls what the PUBLISHED packages export, so this calls the door the same way
 * `features/portals/service.ts` and `features/forms/service.ts` already call theirs, and it
 * swaps to the typed client when the release owner publishes. The door is the contract;
 * the wrapper is sugar.
 *
 * WHAT THE BINDING BUYS. It writes ONE `platform.associations` edge, decided by the store's
 * own ladder — a person who may not open the record cannot bind a chat to it — and from then
 * on EVERY turn's context is assembled server-side by aidream's `record_scope_block`,
 * whether the turn comes from this panel, from `/chat/<id>` tomorrow, or from a scheduled
 * run. Nothing about the grounding lives in this browser.
 *
 * WHAT THE PERSON SEES: the scope chip ("About: Acme Industrial"), and — when the store
 * withheld a Field — the sentence saying which Field and why, above the composer, before
 * they ask a question whose answer would be missing it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { RecordChatContext } from "@ai-matrx/records-ui";
import { AgentConversationColumn } from "@/features/agents/components/shared/AgentConversationColumn";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import { createClient } from "@/utils/supabase/client";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { cn } from "@/lib/utils";

/** The one door this file calls, exactly as the portals and forms services call theirs. */
type DoorCaller = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function bindConversationToRecord(args: {
  organizationId: string;
  conversationId: string;
  recordId: string;
}): Promise<{ ok: true } | { ok: false; because: string }> {
  const supabase = createClient();
  const doors = (supabase as unknown as { schema(name: string): DoorCaller }).schema("custom");
  const { error } = await doors.rpc("conversation_scope_bind", {
    p_organization_id: args.organizationId,
    p_conversation_id: args.conversationId,
    p_record_id: args.recordId,
  });
  return error ? { ok: false, because: error.message } : { ok: true };
}

export interface RecordScopedChatProps {
  ctx: RecordChatContext;
  /** May be null while the organization is still resolving — see below. */
  organizationId: string | null;
  className?: string;
}

export function RecordScopedChat({ ctx, organizationId, className }: RecordScopedChatProps) {
  // ONE SWITCH, read HERE rather than inherited: this file reaches the store on its own
  // (it binds the conversation through custom.conversation_scope_bind), so it asks the same
  // question its host page asks, and `pnpm check:campaign-entry-points` can see it ask.
  const campaign = useUnifiedDataCampaign({
    organizationId,
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.enabled(organization),
  });
  const campaignOn = campaign.on === true;
  /**
   * THE MANDATE DOOR, NOT A UUID. `launchMandate` resolves who answers on the server
   * (system default → organization binding → user binding), so a rebind changes the agent
   * with no client deploy. The imperative form is used deliberately: the managed form takes
   * an agent id positionally, and this panel has no agent to paint — the mandate has one.
   *
   * `surfaceKey` comes from the record, so two record chats open at once never fight over
   * focus.
   */
  const { launchMandate } = useAgentLauncher();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!campaignOn || openedFor.current === ctx.surfaceKey) return;
    openedFor.current = ctx.surfaceKey;
    let cancelled = false;
    void launchMandate(DEFAULT_NEW_CHAT_MANDATE_KEY, {
      surfaceKey: ctx.surfaceKey,
      // A REGISTERED feature, never a new string: `SOURCE_FEATURES` is generated from the
      // database and this surface IS the chat, opened from a record.
      sourceFeature: "chat",
    }).then((result) => {
      if (!cancelled) setConversationId(result.conversationId);
    });
    return () => {
      cancelled = true;
    };
  }, [campaignOn, ctx.surfaceKey, launchMandate]);

  const [bound, setBound] = useState<"pending" | "bound" | { refused: string }>("pending");
  const boundFor = useRef<string | null>(null);

  useEffect(() => {
    if (!campaignOn || !conversationId || !organizationId) return;
    const key = `${conversationId}:${ctx.recordId}`;
    if (boundFor.current === key) return;
    boundFor.current = key;
    let cancelled = false;
    void bindConversationToRecord({
      organizationId,
      conversationId,
      recordId: ctx.recordId,
    }).then((answered) => {
      if (cancelled) return;
      // NOTHING FAILS SILENTLY. A chat that looks bound and is not would answer about this
      // record out of nothing at all, which is the one failure a record chat may never have.
      setBound(answered.ok ? "bound" : { refused: answered.because });
    });
    return () => {
      cancelled = true;
    };
  }, [campaignOn, conversationId, organizationId, ctx.recordId]);

  /**
   * THE SENTENCE THE STORE ALREADY WROTE. The published `RecordChatWithheld` carries the
   * store's own `reason` per Field; this only joins them. Nothing here decides what is
   * withheld — that decision is `custom.read_record`'s and nobody else's.
   */
  const withheldLine = useMemo(() => {
    if (ctx.withheld.length === 0) return null;
    const names = ctx.withheld.map((w) => w.label).join(", ");
    const why = ctx.withheld[0]?.reason ?? "The store withheld it for this reader.";
    return (
      `Not in this conversation: ${names}. ${why} ` +
      `An answer here is an answer without ${ctx.withheld.length === 1 ? "that field" : "those fields"}.`
    );
  }, [ctx.withheld]);

  if (campaign.on === null) {
    return (
      <p className={cn("px-2 py-1 text-xs text-muted-foreground", className)}>
        Checking whether this organization keeps its data in the record store…
      </p>
    );
  }

  if (!campaignOn) {
    return (
      <p className={cn("rounded border border-dashed px-2 py-1 text-xs text-muted-foreground", className)}>
        {campaign.because}
      </p>
    );
  }

  if (!organizationId) {
    // ABSENT WITH THE REASON, never a chat with nothing behind it: without an organization
    // there is no address to read the record under, so there is nothing honest to ground on.
    return (
      <p className={cn("px-2 py-1 text-xs text-muted-foreground", className)}>
        This chat needs an organization before it can be about a record, and none is resolved yet.
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
        <span className="rounded-full border px-2 py-0.5 font-medium">About: {ctx.title}</span>
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

      <div className="flex min-h-0 flex-1 flex-col">
        <AgentConversationColumn conversationId={conversationId} surfaceKey={ctx.surfaceKey} />
      </div>
    </div>
  );
}
