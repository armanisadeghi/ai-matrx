"use client";

// features/crm/components/record/InteractionTimeline.tsx
//
// The interaction timeline — calls / emails / meetings / notes, newest first
// — with a compact composer. This is also why `last_touch_at` is NOT on the
// party row: touch history derives from crm.interaction (party is versioned;
// a stored column would snapshot the whole row on every dial).

import { useState } from "react";
import { toast } from "@/lib/toast";
import {
  ArrowDownLeft,
  ArrowUpRight,
  AtSign,
  CalendarClock,
  History,
  MessageSquare,
  NotebookPen,
  Phone,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";
import { logInteraction, removeInteraction } from "../../service";
import type {
  InteractionChannel,
  InteractionDirection,
  InteractionRow,
} from "../../types";
import { SectionCard, SectionEmpty } from "./SectionCard";

const CHANNEL_META: Record<
  string,
  { label: string; Icon: LucideIcon }
> = {
  call: { label: "Call", Icon: Phone },
  email: { label: "Email", Icon: AtSign },
  meeting: { label: "Meeting", Icon: CalendarClock },
  sms: { label: "SMS", Icon: MessageSquare },
  social: { label: "Social", Icon: MessageSquare },
  note: { label: "Note", Icon: NotebookPen },
  task: { label: "Task", Icon: NotebookPen },
  other: { label: "Other", Icon: NotebookPen },
};

const COMPOSER_CHANNELS: InteractionChannel[] = [
  "call",
  "email",
  "meeting",
  "note",
];

interface Props {
  partyId: string;
  orgId: string;
  interactions: InteractionRow[];
  onChanged: () => Promise<void>;
}

export function InteractionTimeline({
  partyId,
  orgId,
  interactions,
  onChanged,
}: Props) {
  const [channel, setChannel] = useState<InteractionChannel>("call");
  const [direction, setDirection] = useState<InteractionDirection>("outbound");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!subject.trim() && !body.trim()) {
      toast.error("Add a subject or a note");
      return;
    }
    setSaving(true);
    try {
      await logInteraction({
        partyId,
        orgId,
        channel,
        direction,
        subject: subject || undefined,
        body: body || undefined,
        durationSeconds: minutes.trim()
          ? Math.round(Number(minutes) * 60) || null
          : null,
      });
      setSubject("");
      setBody("");
      setMinutes("");
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to log");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: InteractionRow) => {
    const ok = await confirm({
      title: "Delete this entry?",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeInteraction(row.id);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  return (
    <SectionCard title="Activity" Icon={History} count={interactions.length}>
      {/* Composer — one tight strip: type, direction, subject, minutes, log. */}
      <div className="mb-2 space-y-1.5 rounded border border-border bg-muted/30 p-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {COMPOSER_CHANNELS.map((c) => {
            const meta = CHANNEL_META[c];
            return (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors",
                  channel === c
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <meta.Icon className="h-3 w-3" />
                {meta.label}
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            onClick={() =>
              setDirection(direction === "outbound" ? "inbound" : "outbound")
            }
            title="Toggle direction"
            className="inline-flex h-6 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {direction === "outbound" ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownLeft className="h-3 w-3" />
            )}
            {direction === "outbound" ? "Outbound" : "Inbound"}
          </button>
          {channel === "call" && (
            <Input
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="min"
              inputMode="numeric"
              className="h-6 w-14 text-xs"
              aria-label="Duration in minutes"
            />
          )}
        </div>
        <div className="flex gap-1.5">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="h-7 w-40 shrink-0 text-xs sm:w-52"
          />
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder="What happened?"
            className="h-7 flex-1 text-xs"
          />
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={submit}
            disabled={saving}
          >
            Log
          </Button>
        </div>
      </div>

      {interactions.length === 0 ? (
        <SectionEmpty>No activity yet — log the first touch above</SectionEmpty>
      ) : (
        <ul className="space-y-0.5">
          {interactions.map((row) => {
            const meta = CHANNEL_META[row.channel_code] ?? CHANNEL_META.other;
            return (
              <li
                key={row.id}
                className="group flex items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/50"
              >
                <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
                  <meta.Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {row.direction === "outbound" ? (
                    <ArrowUpRight className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                  ) : (
                    <ArrowDownLeft className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {row.subject || meta.label}
                    </span>
                    {row.duration_seconds != null && (
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {Math.round(row.duration_seconds / 60)}m
                      </span>
                    )}
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {formatRelativeTime(row.occurred_at ?? row.created_at)}
                    </span>
                  </div>
                  {row.body && (
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                      {row.body}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Delete entry"
                  onClick={() => void remove(row)}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/40 opacity-0 hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
