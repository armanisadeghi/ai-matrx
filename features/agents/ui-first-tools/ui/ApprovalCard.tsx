"use client";

/**
 * ApprovalCard — the agent-edit approval surface (kind:"approval").
 *
 * Replaces the old reuse-the-confirm-AskCard approach, which said the same thing
 * three times (a chip + an "AGENT WANTS TO EDIT THIS TILE" line + a question
 * sentence) and stacked an extra "Anything else?" note and a "Write message
 * instead" link on top. This card states the change ONCE:
 *
 *   - a single header: a verb-tinted icon + "{Verb} {entity}" eyebrow + the
 *     thing's name as the headline (an add shows the new name; nothing repeats);
 *   - a diff body: adds show new values, updates show before → after, ONLY for
 *     the fields that actually change;
 *   - one clean action row: Approve · Decline · Respond, plus an opt-in
 *     "always approve {noun}" so the agent stops asking for that class of edit.
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
  X,
  ArrowRight,
  Plus,
  Pencil,
  Tag,
  RotateCcw,
  MessageSquarePlus,
  CornerDownLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import type {
  ApprovalChange,
  ApprovalFieldDiff,
  ApprovalVerb,
} from "./approval-types";
import { REMEMBER_SENTINEL } from "./approval-types";

interface ApprovalCardProps {
  ask: PendingAsk;
}

const VERB_META: Record<
  ApprovalVerb,
  { label: string; Icon: typeof Plus; chip: string; accent: string }
> = {
  add: {
    label: "Add",
    Icon: Plus,
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    accent: "from-emerald-500/60",
  },
  update: {
    label: "Update",
    Icon: Pencil,
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    accent: "from-sky-500/60",
  },
  rename: {
    label: "Rename",
    Icon: Tag,
    chip: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    accent: "from-violet-500/60",
  },
  complete: {
    label: "Complete",
    Icon: Check,
    chip: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    accent: "from-emerald-500/60",
  },
  reopen: {
    label: "Reopen",
    Icon: RotateCcw,
    chip: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
    accent: "from-amber-500/60",
  },
  append: {
    label: "Append to",
    Icon: MessageSquarePlus,
    chip: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
    accent: "from-sky-500/60",
  },
};

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Humanize a value for display: null/empty → a muted placeholder marker. */
function display(value: string | null | undefined): {
  text: string;
  empty: boolean;
} {
  if (value == null || value.trim() === "") return { text: "empty", empty: true };
  return { text: value, empty: false };
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
  const Icon = meta.Icon;
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

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/70 bg-card text-card-foreground",
        "shadow-[0_10px_30px_-14px_rgb(0_0_0/0.45)] ring-1 ring-black/[0.03] dark:ring-white/[0.04]",
        "animate-in fade-in slide-in-from-bottom-2 duration-300",
        !pending && "opacity-50 pointer-events-none",
      )}
      role="region"
      aria-label={`${eyebrow}: ${headline}`}
    >
      {/* Verb-tinted top accent. */}
      <div
        className={cn(
          "h-0.5 w-full bg-gradient-to-r to-transparent",
          meta.accent,
        )}
      />

      <div className="flex items-start gap-3 px-4 pt-3.5">
        <div
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            meta.chip,
          )}
        >
          <Icon className="size-[18px]" strokeWidth={2.25} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </div>
          <div className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">
            {headline}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          title="Dismiss"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Diff body — only the fields that actually change. */}
      {change.fields.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5 px-4">
          {change.fields.map((f, i) => (
            <DiffRow key={`${f.label}-${i}`} field={f} />
          ))}
        </div>
      )}

      {/* Action row. */}
      {respondMode ? (
        <div className="mt-3 border-t border-border/60 bg-muted/30 px-4 py-3">
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
        <div className="mt-3 flex flex-col gap-2 border-t border-border/60 bg-muted/30 px-4 py-3">
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
      )}
    </div>
  );
}

function DiffRow({ field }: { field: ApprovalFieldDiff }) {
  const hasBefore = field.before !== undefined; // undefined ⇒ this is an add
  const after = display(field.after);
  const before = display(field.before ?? null);

  if (field.block) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background/60 p-2">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {field.label}
        </div>
        {hasBefore && !before.empty && (
          <div className="line-clamp-2 whitespace-pre-wrap text-[12px] text-muted-foreground/70 line-through">
            {before.text}
          </div>
        )}
        <div
          className={cn(
            "line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed",
            after.empty
              ? "italic text-muted-foreground"
              : "text-foreground",
          )}
        >
          {after.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <div className="w-20 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {field.label}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {hasBefore && (
          <>
            <span
              className={cn(
                "truncate",
                before.empty
                  ? "italic text-muted-foreground/60"
                  : "text-muted-foreground/70 line-through",
              )}
            >
              {before.text}
            </span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
          </>
        )}
        <span
          className={cn(
            "truncate font-medium",
            after.empty ? "italic text-muted-foreground" : "text-foreground",
          )}
        >
          {after.empty && !hasBefore ? "—" : after.text}
        </span>
      </div>
    </div>
  );
}
