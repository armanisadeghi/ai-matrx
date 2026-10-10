"use client";

// features/vision-interview/group-chat/GroupChatInspector.tsx
//
// The room's Group Chat inspector (the creator's lens, L4 minimal): one row per participant —
// name, the round of its latest turn, and its view policy as compact controls edited in place —
// and, for the selected participant's latest turn, exactly what it was shown (the receipt's
// "Group chat" block), what was withheld and by which rule, and what it said. Dense, no prose.
// The policy write is the server's (`useGroupChat`); the turn is read from `chat.message`.

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Checkbox, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectValue, Skeleton } from "@ai-matrx/design-system";
import { Button, Input, SelectTrigger, SegmentedControl } from "@ai-matrx/design-system/controls";
import { RoomViewReceipt } from "@ai-matrx/chat/agents/components/context-policies-display/MessageContextReceipt";
import { RichDocument } from "@ai-matrx/rich-content/rich-document/RichDocument";
import { stripControlLines } from "@/lib/control-tokens/stripControlLines";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTurnsOrdered } from "../redux/vision-interview.slice";
import {
  PERSON_KEY,
  participantName,
  policyProblem,
  readPolicy,
  writePolicy,
  type FullPolicy,
  type ParticipantOut,
  type ViewPolicy,
} from "./policy";
import { useGroupChat } from "./useGroupChat";
import { fetchLatestTurn, hitOutputLimit, type LatestTurn } from "./latestTurn";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
type TurnState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; turn: LatestTurn | null };

/** Every participant's latest turn, re-read when the room records a new turn or on Refresh. */
function useLatestTurns(conversationIds: readonly string[], signal: number) {
  const [turns, setTurns] = useState<Record<string, TurnState>>({});
  const key = conversationIds.join(",");
  useEffect(() => {
    let disposed = false;
    for (const id of key ? key.split(",") : []) {
      fetchLatestTurn(id).then(
        (turn) => !disposed && setTurns((t) => ({ ...t, [id]: { status: "ready", turn } })),
        (error: unknown) =>
          !disposed &&
          setTurns((t) => ({ ...t, [id]: { status: "error", message: error instanceof Error ? error.message : String(error) } })),
      );
    }
    return () => {
      disposed = true;
    };
  }, [key, signal]);
  return turns;
}

const SEES_OPTIONS = [
  { value: "everyone", label: "Everyone" },
  { value: "none", label: "No one" },
  { value: "only", label: "Only…" },
  { value: "except", label: "All except…" },
] as const;

const REVEAL_OPTIONS = [
  { value: "always", label: "Always" },
  { value: "after_round", label: "After round" },
  { value: "every_rounds", label: "Every N rounds" },
] as const;

const CADENCE_OPTIONS = [
  { value: "person", label: "When asked" },
  { value: "every_rounds", label: "Every N rounds" },
] as const;

/** A whole-number field that commits on blur or Enter (never per keystroke). */
function CountInput({
  value,
  onCommit,
  ariaLabel,
  className,
  step,
}: {
  value: number | null;
  onCommit: (n: number | null) => void;
  ariaLabel: string;
  className?: string;
  step?: number;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = draft.trim() === "" ? null : Number(draft);
    setDraft(null);
    onCommit(n === null || Number.isNaN(n) ? null : n);
  };
  return (
    <Input
      type="number"
      inputMode="numeric"
      step={step ?? 1}
      aria-label={ariaLabel}
      value={draft ?? (value == null ? "" : String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
      className={className} numeric align="start"
    />
  );
}

function SeesKeysPicker({
  full,
  options,
  nameOf,
  open,
  onOpenChange,
  onChange,
}: {
  full: FullPolicy;
  options: readonly string[];
  nameOf: (key: string) => string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (keys: string[]) => void;
}) {
  const chosen = new Set(full.seesKeys);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" title={full.seesKeys.map(nameOf).join(", ")} className="min-w-0">
          {full.seesKeys.length ? full.seesKeys.map(nameOf).join(", ") : "Pick…"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" width="xs" padding="xs">
        {options.map((key) => (
          <label key={key} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted" data-clickable>
            <Checkbox
              checked={chosen.has(key)}
              onCheckedChange={(on) => onChange(options.filter((k) => (k === key ? on === true : chosen.has(k))))}
            />
            {nameOf(key)}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function ParticipantRow({
  row,
  groupKeys,
  nameOf,
  turn,
  selected,
  saving,
  onSelect,
  onSave,
}: {
  row: ParticipantOut;
  groupKeys: readonly string[];
  nameOf: (key: string) => string;
  turn: TurnState | undefined;
  selected: boolean;
  saving: boolean;
  onSelect: () => void;
  onSave: (policy: ViewPolicy) => void;
}) {
  const participant = row.participant;
  // A choice the server would refuse ("Only…" with nobody picked) waits here until it is whole.
  const [draft, setDraft] = useState<FullPolicy | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  if (!participant) {
    return (
      <div className="border-b border-border/60 px-2 py-1 type-secondary text-destructive" data-participant={row.id}>
        {row.error ?? "Unreadable participant"}
      <ErrorAlchemyMenu error={row.error} /></div>
    );
  }
  const full = draft ?? readPolicy(participant.policy);
  const problem = draft ? policyProblem(draft, groupKeys) : null;
  const change = (patch: Partial<FullPolicy>) => {
    const next = { ...full, ...patch };
    if (policyProblem(next, groupKeys)) {
      setDraft(next);
      return;
    }
    setDraft(null);
    onSave(writePolicy(next));
  };
  const others = [PERSON_KEY, ...groupKeys.filter((k) => k !== participant.key)];
  const round = turn?.status === "ready" ? (turn.turn?.roomView?.round ?? null) : null;
  const band = selected ? "bg-accent/60" : "hover:bg-muted/50";
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-1 border-b border-border/60 px-2 py-1", band)}
      data-participant={participant.key}
      aria-selected={selected}
      onClick={onSelect}
      data-clickable
    >
      <div className="flex min-w-0 items-baseline gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate type-secondary font-medium text-foreground">{participantName(participant)}</div>
          {problem ? <div className="truncate type-meta text-destructive">{problem}<ErrorAlchemyMenu error={problem} /></div> : null}
        </div>
        <span className="shrink-0 type-meta tabular-nums text-muted-foreground" title="Round of its latest turn">
          {round == null ? "R —" : `R${round}`}
        </span>
        <span className="shrink-0 type-meta tabular-nums text-muted-foreground" title="Policy version">
          {saving ? "…" : `v${participant.policy_version ?? 1}`}
        </span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 items-center gap-1">
          <span className="type-meta text-muted-foreground">Sees</span>
          <Select
            value={full.sees}
            onValueChange={(v) => {
              const sees = v as FullPolicy["sees"];
              const wantsKeys = sees === "only" || sees === "except";
              change({ sees, seesKeys: wantsKeys ? full.seesKeys : [] });
              if (wantsKeys && full.seesKeys.length === 0) setPickerOpen(true);
            }}
          >
            <SelectTrigger width="xs" aria-label="Sees">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEES_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {full.sees === "only" || full.sees === "except" ? (
            <SeesKeysPicker
              full={full}
              options={others}
              nameOf={nameOf}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onChange={(seesKeys) => change({ seesKeys })}
            />
          ) : null}
        </div>
        <SegmentedControl aria-label="Labels"
          value={full.labels}
          onValueChange={(v) => change({ labels: v as FullPolicy["labels"] })}
          data={[
            { value: "named", label: "Named" },
            { value: "anonymous", label: "Anon", ariaLabel: "Anonymous" },
          ]}
        />
      </div>
      <div className="min-w-0" data-participant-rules={participant.key} onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex items-center gap-1">
            <span className="type-meta text-muted-foreground">Reveal</span>
            <Select
              value={full.reveal}
              onValueChange={(v) => change({ reveal: v as FullPolicy["reveal"], revealRounds: full.revealRounds ?? 1 })}
            >
              <SelectTrigger width="sm" aria-label="Reveal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVEAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {full.reveal !== "always" ? (
              <CountInput
                ariaLabel="Reveal rounds"
                value={full.revealRounds}
                onCommit={(n) => change({ revealRounds: n })}
                className="w-12"
              />
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <span className="type-meta text-muted-foreground">Cadence</span>
            <Select
              value={full.cadence}
              onValueChange={(v) => change({ cadence: v as FullPolicy["cadence"], cadenceRounds: full.cadenceRounds ?? 1 })}
            >
              <SelectTrigger width="sm" aria-label="Cadence">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CADENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {full.cadence !== "person" ? (
              <CountInput
                ariaLabel="Cadence rounds"
                value={full.cadenceRounds}
                onCommit={(n) => change({ cadenceRounds: n })}
                className="w-12"
              />
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <span className="type-meta text-muted-foreground">Budget</span>
            <CountInput
              ariaLabel="Budget (characters)"
              step={1000}
              value={full.budgetChars}
              onCommit={(n) => change({ budgetChars: n ?? 0 })}
              className="w-[4.5rem]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TurnDetail({
  turn,
  nameOf,
}: {
  turn: TurnState | undefined;
  nameOf: (key: string) => string;
}) {
  if (!turn || turn.status === "loading") return <Skeleton shape="block" height="md" className="mx-2 my-2" />;
  if (turn.status === "error") return <p className="px-2 py-1 type-secondary text-destructive">{turn.message}<ErrorAlchemyMenu error={turn.message} /></p>;
  if (!turn.turn) return <p className="px-2 py-1 type-secondary text-muted-foreground">No turn yet</p>;
  const { turn: t } = turn;
  return (
    <div className="flex min-w-0 flex-col">
      <h3 className="px-2 pt-2 type-meta font-semibold uppercase tracking-wide text-muted-foreground">Shown</h3>
      <RoomViewReceipt
        conversationId={t.conversationId}
        messageId={t.messageId}
        receipt={t.receipt}
        speakerName={nameOf}
        withheldText={t.withheldText}
      />
      <h3 className="px-2 pt-2 type-meta font-semibold uppercase tracking-wide text-muted-foreground">Said</h3>
      {t.reply && hitOutputLimit(t.finishReason) ? (
        <p className="px-2 pt-1 type-meta font-medium text-destructive" data-finish-reason={t.finishReason}>
          Cut off at the output limit
        </p>
      ) : null}
      {t.reply ? (
        <div className="px-2 py-1">
          <RichDocument imagePolicy="ai" content={stripControlLines(t.reply)} source={{ type: "raw" }} hideCopyButton contentClassName="text-xs" />
        </div>
      ) : (
        <p className="px-2 py-1 type-secondary text-muted-foreground">No reply yet</p>
      )}
    </div>
  );
}

export function GroupChatInspector({ anchorType, anchorId, initialKey }: { anchorType: string; anchorId: string; initialKey?: string | null }) {
  const { state, saving, savePolicy, reload } = useGroupChat(anchorType, anchorId);
  // A new turn recorded in the room (or Refresh) re-reads every participant's latest turn.
  const roomTurns = useAppSelector(selectTurnsOrdered).length;
  const [refresh, setRefresh] = useState(0);
  // The round counts the person's messages: re-read it when the room records a turn, and once more
  // after the write has surely landed.
  const firstRoomTurns = useRef(roomTurns);
  useEffect(() => {
    if (roomTurns === firstRoomTurns.current) return;
    reload();
    const t = setTimeout(reload, 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomTurns]);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey ?? null);
  const rows = state.status === "ready" ? (state.group.participants ?? []) : [];
  const turns = useLatestTurns(
    rows.map((r) => r.conversation_id),
    roomTurns * 1000 + refresh,
  );

  if (state.status === "loading") return <Skeleton shape="block" height="lg" className="m-2" />;
  if (state.status === "missing") return <p className="px-3 py-2 type-secondary text-muted-foreground">No group chat in this room yet</p>;
  if (state.status === "error") return <p className="px-3 py-2 type-secondary text-destructive">{state.message}<ErrorAlchemyMenu error={state.message} /></p>;

  const groupKeys = rows.flatMap((r) => (r.participant ? [r.participant.key] : []));
  const nameOf = (key: string) => {
    if (key === PERSON_KEY) return "You";
    const p = rows.find((r) => r.participant?.key === key)?.participant;
    return p ? participantName(p) : key;
  };
  const selected = rows.find((r) => r.participant?.key === selectedKey) ?? rows[0] ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-group-chat={anchorId}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1 type-secondary">
        <span className="font-medium text-foreground">Round {state.group.round}</span>
        <span className="text-muted-foreground">{rows.length} participants</span>
        <Button variant="quiet" icon={<RefreshCw />} aria-label="Refresh" title="Refresh" onClick={() => {
            reload();
            setRefresh((n) => n + 1);
          }} className="ml-auto" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="min-w-0 overflow-x-hidden" data-participants>
          {rows.map((row) => (
            <ParticipantRow
              key={`${row.id}:${row.participant?.policy_version ?? 0}`}
              row={row}
              groupKeys={groupKeys}
              nameOf={nameOf}
              turn={turns[row.conversation_id]}
              selected={row === selected}
              saving={saving === row.id}
              onSelect={() => setSelectedKey(row.participant?.key ?? null)}
              onSave={(policy) => void savePolicy(row, policy)}
            />
          ))}
          {anchorType === "interview_session" ? (
            <div className="border-b border-border/60 px-2 py-1 type-secondary text-muted-foreground" data-participant="scribe">
              Scribe · background pass, not a group participant
            </div>
          ) : null}
        </div>
        {selected ? (
          <section className="border-t border-border" data-latest-turn={selected.participant?.key}>
            <div className="px-2 pt-2 type-secondary font-medium text-foreground">
              {selected.participant ? participantName(selected.participant) : "Participant"} · latest turn
            </div>
            <TurnDetail turn={turns[selected.conversation_id]} nameOf={nameOf} />
          </section>
        ) : null}
      </div>
    </div>
  );
}
