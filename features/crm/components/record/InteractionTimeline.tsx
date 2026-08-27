"use client";

// features/crm/components/record/InteractionTimeline.tsx
//
// The interaction timeline — calls / emails / meetings / notes, newest first
// — with a compact composer. This is also why `last_touch_at` is NOT on the
// party row: touch history derives from crm.interaction (party is versioned;
// a stored column would snapshot the whole row on every dial).

import { useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import {
  ArrowDownLeft,
  ArrowUpRight,
  AtSign,
  CalendarClock,
  History,
  Megaphone,
  MessageSquare,
  NotebookPen,
  Phone,
  Trash2,
} from "lucide-react";
import { InboundLabelBadge } from "../outreach-lists/badges";
import { readInboundClassification } from "../../inbox/attributes";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  CollapsibleText,
  CollapsibleTextGroupControls,
} from "@/components/official/CollapsibleText";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/datetime";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { logInteraction, removeInteraction } from "../../service";
import { parseInteraction } from "../../agent-context/crmRecordSurfaceWrite";
import type {
  InteractionChannel,
  InteractionDirection,
  InteractionRow,
} from "../../types";
import { SectionCard, SectionEmpty } from "./SectionCard";

const CHANNEL_META: Record<string, { label: string; Icon: LucideIcon }> = {
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
  /** When set, logged activity binds to this deal's timeline (deal record page). */
  dealId?: string | null;
  getApplicationScope?: () => ApplicationScope;
  /** Registers the record-only write target when this shared component mounts there. */
  writeSurfaceName?: string;
}

export function InteractionTimeline({
  partyId,
  orgId,
  interactions,
  onChanged,
  dealId,
  getApplicationScope,
  writeSurfaceName,
}: Props) {
  const [channel, setChannel] = useState<InteractionChannel>("call");
  const [direction, setDirection] = useState<InteractionDirection>("outbound");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const expandableRowIds = interactions
    .filter((row) => Boolean(row.body))
    .map((row) => row.id);
  const allExpanded =
    expandableRowIds.length > 0 &&
    expandableRowIds.every((id) => expandedRows.has(id));
  const anyExpanded = expandableRowIds.some((id) => expandedRows.has(id));

  const setRowExpanded = (id: string, expanded: boolean) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (expanded) next.add(id);
      else next.delete(id);
      return next;
    });
  };

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
        dealId: dealId ?? null,
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

  useSurfaceWriteHandlers(writeSurfaceName ?? null, {
    log_interaction: async (raw: unknown) => {
      const parsed = parseInteraction(raw);
      await logInteraction({
        partyId,
        orgId,
        channel: parsed.channel,
        direction: parsed.direction,
        subject: parsed.subject,
        body: parsed.body,
        durationSeconds: parsed.durationSeconds,
        occurredAt: parsed.occurredAt,
        dealId: dealId ?? null,
      });
      await onChanged();
    },
  });

  return (
    <SectionCard
      title="Activity"
      Icon={History}
      count={interactions.length}
      action={
        <CollapsibleTextGroupControls
          allExpanded={allExpanded}
          anyExpanded={anyExpanded}
          disabled={expandableRowIds.length === 0}
          onExpandAll={() => setExpandedRows(new Set(expandableRowIds))}
          onCollapseAll={() => setExpandedRows(new Set())}
        />
      }
    >
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
                  "inline-flex h-11 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors sm:h-6",
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
            className="inline-flex h-11 items-center gap-1 rounded px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground sm:h-6"
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
              className="h-11 w-16 text-base sm:h-6 sm:w-14 sm:text-xs"
              aria-label="Duration in minutes"
            />
          )}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-[minmax(10rem,13rem)_1fr]">
          <ProInput
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            enableVoice={false}
            className="h-9"
            aria-label="Activity subject"
          />
          <ProTextarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened?"
            autoGrow
            minHeight={64}
            maxHeight={240}
            onSubmit={submit}
            submitDisabled={saving || (!subject.trim() && !body.trim())}
            isSubmitting={saving}
            submitLabel="Log activity"
            surfaceName={writeSurfaceName}
            sourceFeature="crm"
            getApplicationScope={getApplicationScope}
            enableTextStats
            defaultShowTextStatsBar={false}
            className="text-base sm:text-sm"
            aria-label="Activity details"
          />
        </div>
      </div>

      {interactions.length === 0 ? (
        <SectionEmpty>No activity yet — log the first touch above</SectionEmpty>
      ) : (
        <ul className="space-y-0.5">
          {interactions.map((row) => {
            const meta = CHANNEL_META[row.channel_code] ?? CHANNEL_META.other;
            // A REPLY is the most important row on this timeline — someone we
            // wrote to wrote back. It gets a standing accent, the classifier's
            // verdict, and a door to the campaign it answers, instead of
            // sitting anonymously among logged calls.
            const isReply = row.direction === "inbound";
            const classification = isReply
              ? readInboundClassification(row.attributes)
              : null;
            return (
              <li
                key={row.id}
                className={cn(
                  "group flex items-start gap-2 rounded px-1.5 py-1 hover:bg-accent/50",
                  isReply &&
                    "border-l-2 border-emerald-500/60 bg-emerald-500/5 pl-1",
                )}
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
                    {classification?.rawLabel && (
                      <span className="shrink-0 self-center">
                        <InboundLabelBadge value={classification.rawLabel} />
                      </span>
                    )}
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
                    <CollapsibleText
                      expanded={expandedRows.has(row.id)}
                      onExpandedChange={(expanded) =>
                        setRowExpanded(row.id, expanded)
                      }
                      className="mt-0.5 text-xs leading-relaxed text-muted-foreground"
                      expandLabel={`Expand ${meta.label.toLowerCase()} details`}
                      collapseLabel={`Collapse ${meta.label.toLowerCase()} details`}
                    >
                      {row.body}
                    </CollapsibleText>
                  )}
                  {classification?.evidence && (
                    <p className="mt-0.5 text-[11px] italic text-muted-foreground/80">
                      {classification.evidence}
                    </p>
                  )}
                  {/* THE DOOR LAW: this row names a campaign — reach it. */}
                  {row.outreach_list_id && (
                    <Link
                      href={`/crm/outreach-lists/${row.outreach_list_id}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                    >
                      <Megaphone className="h-3 w-3" aria-hidden />
                      View the campaign this came from
                    </Link>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Delete entry"
                  onClick={() => void remove(row)}
                  className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-100 hover:text-destructive sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100"
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
