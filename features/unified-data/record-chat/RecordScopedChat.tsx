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
import { AgentConversationColumn } from "@ai-matrx/chat/agents/components/shared/AgentConversationColumn";
import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { useComposerMode } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/useComposerMode";
import { useCompactInputMaxHeight } from "@ai-matrx/chat/agents/components/inputs/smart-input/composer/useCompactInputMaxHeight";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@ai-matrx/chat/agents/components/chat/chat-quick-actions.config";
import { createClient } from "@/utils/supabase/client";
import { mayReadAsMember } from "@/features/organizations/organizationsIAmIn";
import { cn } from "@/lib/utils";

/** The one door this file calls, exactly as the portals and forms services call theirs. */
type DoorCaller = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

/** How often, and how many times, the bind is asked again while the conversation's row is not made yet. */
const BIND_RETRY_MS = 3000;
const BIND_RETRIES = 200;

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
  // MEMBER-ONLY, keyed by the RECORD's organization: this file binds the conversation through
  // custom.conversation_scope_bind, a member's door. No store switch is asked — the record store
  // is never off (CHAIR-ALWAYS-ON, 2026-10-03).
  const [membership, setMembership] = useState<{ organizationId: string; isMember: boolean } | null>(null);
  useEffect(() => {
    if (!organizationId) return undefined;
    let live = true;
    void mayReadAsMember(organizationId).then((isMember) => {
      if (live) setMembership({ organizationId, isMember });
    });
    return () => {
      live = false;
    };
  }, [organizationId]);
  const member =
    !organizationId ? true : membership && membership.organizationId === organizationId ? membership.isMember : null;
  const memberHere = member === true;
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
  const { mode: composerMode } = useComposerMode();
  const { measureRef, maxInputHeightPx } = useCompactInputMaxHeight();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!memberHere || openedFor.current === ctx.surfaceKey) return;
    openedFor.current = ctx.surfaceKey;
    let cancelled = false;
    void launchMandate(DEFAULT_NEW_CHAT_MANDATE_KEY, {
      surfaceKey: ctx.surfaceKey,
      // A REGISTERED feature, never a new string: `SOURCE_FEATURES` is generated from the
      // database and this surface IS the chat, opened from a record.
      sourceFeature: "chat",
      // THE RECORD'S OWN ORGANIZATION, never the active one (v7 TABLE-EXPERIENCE): with no active
      // organization the launch threw and the panel sat on "Opening a conversation…" forever.
      ...(organizationId ? { organizationId } : {}),
    }).then(
      (result) => {
        if (!cancelled) setConversationId(result.conversationId);
      },
      (thrown: unknown) => {
        if (!cancelled) setLaunchRefused(thrown instanceof Error ? thrown.message : "The conversation could not be opened.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [memberHere, ctx.surfaceKey, launchMandate, organizationId]);
  const [launchRefused, setLaunchRefused] = useState<string | null>(null);

  const [bound, setBound] = useState<"pending" | "bound" | { refused: string }>("pending");
  const boundFor = useRef<string | null>(null);

  useEffect(() => {
    if (!memberHere || !conversationId || !organizationId) return;
    const key = `${conversationId}:${ctx.recordId}`;
    if (boundFor.current === key) return;
    boundFor.current = key;
    let cancelled = false;
    // A CONVERSATION'S ROW EXISTS ONLY AFTER ITS FIRST MESSAGE (conversation-start contract: the
    // client mints the id, the server makes the row on the first turn), so a bind at open is refused
    // as "not yours" until then. It is asked again until the row is there — the record's facts are
    // already in the chat's context — and only a refusal that outlives that wait is said.
    const attempt = async (left: number): Promise<void> => {
      const answered = await bindConversationToRecord({ organizationId, conversationId, recordId: ctx.recordId });
      if (cancelled) return;
      if (answered.ok) return setBound("bound");
      if (left > 0 && /not yours/i.test(answered.because)) {
        await new Promise((r) => setTimeout(r, BIND_RETRY_MS));
        if (!cancelled) return attempt(left - 1);
        return;
      }
      // NOTHING FAILS SILENTLY. A chat that looks bound and is not would answer about this
      // record out of nothing at all, which is the one failure a record chat may never have.
      setBound({ refused: answered.because });
    };
    void attempt(BIND_RETRIES);
    return () => {
      cancelled = true;
    };
  }, [memberHere, conversationId, organizationId, ctx.recordId]);

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

  if (member === null) return null;

  if (!memberHere) {
    return (
      <p className={cn("rounded border border-dashed px-2 py-1 text-xs text-muted-foreground", className)}>
        Chat is for members of this record&apos;s organization
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

  if (!conversationId && launchRefused) {
    return (
      <p className={cn("px-2 py-1 text-xs text-destructive", className)} data-record-chat-refused="">
        {launchRefused}
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
          <span className="text-muted-foreground">Linked once you ask</span>
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

      {/* The compact composer (composer/FEATURE.md) — a record's side panel. The agent is
          the default-chat job's, bound to THIS record; switching it would be a second
          conversation that is not bound, so no agent switch is offered (a plain label). */}
      <div ref={measureRef} className="flex min-h-0 flex-1 flex-col">
        <AgentConversationColumn
          conversationId={conversationId}
          surfaceKey={ctx.surfaceKey}
          smartInputProps={{
            composer: { size: "compact", mode: composerMode, placeholder: `Ask about ${ctx.title}`, maxInputHeightPx },
          }}
        />
      </div>
    </div>
  );
}
