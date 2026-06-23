"use client";

/**
 * ApprovalCard — the agent-edit approval surface (kind:"approval").
 *
 * States the change ONCE: a verb-tinted header ("{Verb} {entity}" + the thing's
 * name), a before→after diff body (adds show new values), and one action row
 * (Approve · Decline · Respond) with an opt-in "always approve {noun}". Built on
 * the shared `<AgentCardShell>` + `<ChangeDiff>`, so it shares its look with every
 * other inline agent card and its diff with every other change surface.
 *
 * Resolution mirrors <AskCard>: it routes through the same ask-resolver registry
 * + pendingAsks slice, so the war-room dispatcher's awaiting promise unblocks
 * exactly once. Approve packs `confirmed:true` (and the REMEMBER_SENTINEL when
 * "always approve" is on); Decline packs `confirmed:false`; Respond packs the
 * typed `freeform`; the × dismisses with `cancelled:true`.
 */

import { useState } from "react";
import {
  Check,
  Plus,
  Pencil,
  Tag,
  RotateCcw,
  MessageSquarePlus,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChangeDiff } from "@/components/ui/change-diff";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { PendingAsk } from "../redux/pending-asks.slice";
import {
  resolvePendingAsk,
  cancelPendingAsk,
} from "../redux/pending-asks.slice";
import {
  resolveAskByCallId,
  cancelAskByCallId,
} from "../redux/ask-resolver-registry";
import { EMPTY_ASK_RESPONSE } from "../tools/schemas";
import type { ApprovalVerb } from "./approval-types";
import { REMEMBER_SENTINEL } from "./approval-types";
import { AgentCardShell, type AccentTone } from "./AgentCardShell";

interface ApprovalCardProps {
  ask: PendingAsk;
}

const VERB_META: Record<
  ApprovalVerb,
  { label: string; Icon: LucideIcon; tone: AccentTone }
> = {
  add: { label: "Add", Icon: Plus, tone: "success" },
  update: { label: "Update", Icon: Pencil, tone: "info" },
  rename: { label: "Rename", Icon: Tag, tone: "violet" },
  complete: { label: "Complete", Icon: Check, tone: "success" },
  reopen: { label: "Reopen", Icon: RotateCcw, tone: "warning" },
  append: { label: "Append to", Icon: MessageSquarePlus, tone: "info" },
};

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function ApprovalCard({ ask }: ApprovalCardProps) {
  const dispatch = useAppDispatch();
  const [remember, setRemember] = useState(false);
  const [respondMode, setRespondMode] = useState(false);
  const [respondText, setRespondText] = useState("");

  const change = ask.approval;
  // Defensive: an approval ask should always carry its change descriptor.
  if (!change) return null;

  const meta = VERB_META[change.verb];
  const headline =
    change.title && change.title.trim()
      ? change.title
      : capitalize(change.entity);
  const eyebrow = `${meta.label} ${change.entity}`;
  const autoNoun = change.autoApprove?.noun;
  const pending = ask.status === "pending";

  function resolve(response: Parameters<typeof resolveAskByCallId>[1]) {
    resolveAskByCallId(ask.callId, response);
    dispatch(
      resolvePendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
  }

  function approve() {
    resolve({
      ...EMPTY_ASK_RESPONSE,
      confirmed: true,
      selected: remember && change?.autoApprove ? [REMEMBER_SENTINEL] : null,
    });
  }

  function decline() {
    resolve({ ...EMPTY_ASK_RESPONSE, confirmed: false });
  }

  function dismiss() {
    cancelAskByCallId(ask.callId);
    dispatch(
      cancelPendingAsk({
        callId: ask.callId,
        conversationId: ask.conversationId,
      }),
    );
  }

  function sendRespond() {
    const text = respondText.trim();
    if (!text) return;
    resolve({ ...EMPTY_ASK_RESPONSE, freeform: text });
  }

  const footer = respondMode ? (
    <div>
      <Textarea
        value={respondText}
        onChange={(e) => setRespondText(e.target.value)}
        placeholder="Tell the agent what to do instead…"
        rows={2}
        autoFocus
        className="text-base"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") sendRespond();
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          onClick={sendRespond}
          disabled={!respondText.trim()}
          className="gap-1.5"
        >
          <CornerDownLeft className="size-3.5" />
          Send
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setRespondMode(false);
            setRespondText("");
          }}
        >
          Back
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={approve} className="gap-1.5">
          <Check className="size-4" />
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={decline}>
          Decline
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRespondMode(true)}
          className="ml-auto text-muted-foreground hover:text-foreground"
        >
          Respond
        </Button>
      </div>
      {autoNoun && (
        <button
          type="button"
          onClick={() => setRemember((v) => !v)}
          className="flex w-fit items-center gap-2 rounded-md py-0.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          aria-pressed={remember}
        >
          <span
            className={cn(
              "grid size-4 place-items-center rounded-[5px] border transition-colors",
              remember
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background",
            )}
          >
            {remember && <Check className="size-3" strokeWidth={3} />}
          </span>
          Always approve {autoNoun} on this tile
        </button>
      )}
    </div>
  );

  return (
    <AgentCardShell
      tone={meta.tone}
      icon={meta.Icon}
      eyebrow={eyebrow}
      title={headline}
      onDismiss={dismiss}
      pending={pending}
      footer={footer}
      aria-label={`${eyebrow}: ${headline}`}
    >
      {change.fields.length > 0 ? <ChangeDiff fields={change.fields} /> : null}
    </AgentCardShell>
  );
}
