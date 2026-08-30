"use client";

/**
 * ApprovalCard — the agent-edit approval surface (kind:"approval").
 *
 * States the change ONCE: a compact "{Verb} · {title}" header, optional details,
 * a fully reviewable before→after diff body, and one compact action row
 * (Apply · Keep as is · Respond) with an opt-in "always approve {noun}". Built
 * on the shared `<AgentCardShell>` + `<ChangeDiff>`, so it shares its look with
 * every other inline agent card and its diff with every other change surface.
 *
 * Resolution mirrors <AskCard>: it routes through the same ask-resolver registry
 * + pendingAsks slice, so the war-room dispatcher's awaiting promise unblocks
 * exactly once. Apply packs `confirmed:true` (and the REMEMBER_SENTINEL when
 * "always approve" is on); Keep as is packs `confirmed:false`; Respond packs the
 * typed `freeform`; the × minimizes without resolving the tool call.
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
  ChevronUp,
  ChevronDown,
  Info,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ChangeDiff } from "@/components/ui/change-diff";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { PendingAsk } from "../redux/pending-asks.slice";
import { resolvePendingAsk } from "../redux/pending-asks.slice";
import { resolveAskByCallId } from "../redux/ask-resolver-registry";
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
  const [minimized, setMinimized] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const change = ask.approval;
  // Defensive: an approval ask should always carry its change descriptor.
  if (!change) return null;

  const meta = VERB_META[change.verb];
  const MetaIcon = meta.Icon;
  const headline =
    change.title && change.title.trim()
      ? change.title
      : capitalize(change.entity);
  const eyebrow = `${meta.label} ${change.entity}`;
  const autoNoun = change.autoApprove?.noun;
  // AgentCardShell dims when `pending` is true — pass true only once resolved
  // (matches AskCard / BatchAskCard; inverted here was blocking all clicks).
  const resolved = ask.status !== "pending";

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
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button
          size="sm"
          onClick={sendRespond}
          disabled={!respondText.trim()}
          className="min-h-11 gap-1.5 sm:min-h-8"
        >
          <CornerDownLeft className="size-3.5" />
          Send
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
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
      <div className="flex w-full items-center justify-end gap-1.5">
        <Button
          size="sm"
          onClick={approve}
          className="min-h-11 flex-1 gap-1.5 px-2.5 sm:min-h-8 sm:flex-none"
        >
          <Check className="size-4" />
          Apply
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={decline}
          className="min-h-11 flex-1 px-2.5 sm:min-h-8 sm:flex-none"
        >
          Keep as is
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRespondMode(true)}
          className="min-h-11 flex-1 px-2.5 text-muted-foreground hover:text-foreground sm:min-h-8 sm:flex-none"
        >
          Respond
        </Button>
      </div>
      {autoNoun && (
        <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-md text-[12px] text-muted-foreground transition-colors hover:text-foreground sm:min-h-6">
          <Checkbox
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          Always approve {autoNoun} on this tile
        </label>
      )}
    </div>
  );

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left transition-colors hover:bg-primary/10"
        aria-label={`Review pending agent change: ${headline}`}
      >
        <MetaIcon className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          Decision waiting: {headline}
        </span>
        <span className="text-xs text-muted-foreground">Review</span>
        <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <AgentCardShell
      tone={meta.tone}
      icon={meta.Icon}
      eyebrow={meta.label}
      title={headline}
      titleInline
      headerAction={
        change.description ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setDetailsOpen((open) => !open)}
            className="min-h-11 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground sm:min-h-8"
            aria-expanded={detailsOpen}
          >
            <Info className="size-3.5" />
            Details
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                detailsOpen && "rotate-180",
              )}
            />
          </Button>
        ) : null
      }
      onDismiss={() => setMinimized(true)}
      dismissLabel="Minimize — keep decision pending"
      pending={resolved}
      footer={footer}
      footerClassName="px-3 py-2"
      contentClassName="px-3 pb-2 pt-1"
      aria-label={`${eyebrow}: ${headline}`}
    >
      {change.description && detailsOpen ? (
        <p className="mb-2 rounded-md bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
          {change.description}
        </p>
      ) : null}
      {change.fields.length > 0 ? <ChangeDiff fields={change.fields} /> : null}
    </AgentCardShell>
  );
}
