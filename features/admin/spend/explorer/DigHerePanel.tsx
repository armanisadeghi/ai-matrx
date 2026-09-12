// features/admin/spend/explorer/DigHerePanel.tsx
//
// "DIG HERE" (Arman, 2026-09-12: "the thing that shows us where to look for
// the bigger issues"). Seven signals the database computed for the window,
// each a card: how much money it touches, what it means in one sentence, and
// the rows behind it — every row opens its conversation or drills the
// explorer. Cards are ordered by money, and a signal that found nothing says
// so rather than disappearing (a screen never lies by omission).
//
// The lines the signals are measured against are knobs
// (`platform.spend_explorer.*`), shown on each card so nobody has to guess
// what "heavy" meant.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Flame,
  Repeat,
  RotateCcw,
  Tag,
  TrendingUp,
} from "lucide-react";

import { timestamp, usd } from "../format";
import type { SpendBreakdown, SpendDimension } from "../types";
import { compactNumber, percent, shortLocal } from "./labels";

interface SignalCardProps {
  icon: typeof AlertTriangle;
  title: string;
  cost: number;
  total: number;
  n: number;
  unit: string;
  meaning: string;
  line?: string;
  rows: React.ReactNode[];
  moreThanShown: number;
}

function SignalCard({
  icon: Icon,
  title,
  cost,
  total,
  n,
  unit,
  meaning,
  line,
  rows,
  moreThanShown,
}: SignalCardProps) {
  const [open, setOpen] = useState(false);
  const empty = n === 0;
  const share = total > 0 ? cost / total : 0;
  const hot = share >= 0.25;
  const shown = open ? rows : rows.slice(0, 3);
  return (
    <div
      className={`flex min-w-0 flex-col rounded-md border ${
        hot ? "border-destructive/50 bg-destructive/5" : "border-border bg-card"
      }`}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${hot ? "text-destructive" : "text-muted-foreground"}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{title}</span>
            <span
              className={`shrink-0 text-sm font-semibold tabular-nums ${
                hot ? "text-destructive" : "text-foreground"
              }`}
            >
              {empty ? "none" : usd(cost)}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            {empty ? "Nothing crossed the line in this window." : `${percent(share)} of the window · ${n} ${unit}`}
            {line ? ` · line: ${line}` : ""}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{meaning}</p>
        </div>
      </div>
      {rows.length > 0 ? (
        <ul className="border-t border-border">
          {shown}
          {rows.length > 3 ? (
            <li>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="flex w-full items-center gap-1 px-3 py-1 text-[11px] text-primary hover:underline"
              >
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {open
                  ? "Show fewer"
                  : `Show all ${rows.length}${moreThanShown > 0 ? ` (${moreThanShown} more not listed — narrow the window)` : ""}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function Row({
  primary,
  secondary,
  cost,
  href,
  onDrill,
}: {
  primary: string;
  secondary: string;
  cost: number;
  href?: string | null;
  onDrill?: () => void;
}) {
  return (
    <li className="flex items-center gap-2 px-3 py-1 text-xs">
      <div className="min-w-0 flex-1">
        {onDrill ? (
          <button
            type="button"
            onClick={onDrill}
            className="block max-w-full truncate text-left text-foreground hover:underline"
            title="Look only at this"
          >
            {primary}
          </button>
        ) : (
          <div className="truncate text-foreground">{primary}</div>
        )}
        <div className="truncate text-[11px] text-muted-foreground">{secondary}</div>
      </div>
      <span className="shrink-0 tabular-nums font-medium text-foreground">{usd(cost)}</span>
      {href ? (
        <Link
          href={href}
          className="shrink-0 text-muted-foreground hover:text-primary"
          title="Open the conversation"
          aria-label="Open the conversation"
        >
          <ExternalLink className="h-3 w-3" />
        </Link>
      ) : (
        <span className="h-3 w-3 shrink-0" aria-hidden />
      )}
    </li>
  );
}

export function DigHerePanel({
  data,
  onDrill,
}: {
  data: SpendBreakdown;
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  const s = data.signals;
  const total = data.totals.cost;

  const cards: Array<{ cost: number; node: React.ReactNode }> = [
    {
      cost: s.conversationHogs.cost,
      node: (
        <SignalCard
          key="hogs"
          icon={Flame}
          title="Conversations that ate the window"
          cost={s.conversationHogs.cost}
          total={total}
          n={s.conversationHogs.n}
          unit="conversations"
          line={`one conversation ≥ ${s.conversationHogs.threshold}% of the window`}
          meaning="A single conversation this large is either the one job that mattered or a session that kept re-reading its own history. Open it and read the last few turns."
          moreThanShown={Math.max(0, s.conversationHogs.n - s.conversationHogs.rows.length)}
          rows={s.conversationHogs.rows.map((r) => (
            <Row
              key={r.conversationId}
              primary={r.conversation ?? "Untitled conversation"}
              secondary={`${r.user ?? "no person"} · ${r.agent ?? "no agent"} · ${r.requests} requests · ${percent(r.share)} · ${r.trigger ?? ""}`}
              cost={r.cost}
              href={`/chat/${r.conversationId}`}
              onDrill={() => onDrill("conversation", r.conversationId)}
            />
          ))}
        />
      ),
    },
    {
      cost: s.contextHeavy.cost,
      node: (
        <SignalCard
          key="context"
          icon={BookOpen}
          title="Context-heavy conversations"
          cost={s.contextHeavy.cost}
          total={total}
          n={s.contextHeavy.n}
          unit="conversations"
          line={`≥ ${compactNumber(s.contextHeavy.threshold)} tokens of context per model call`}
          meaning="Every model call re-sends the whole history, so cost grows with the square of the conversation's length. These are the sessions where each call re-read a novel. The fix is trimming or starting fresh, not a cheaper model."
          moreThanShown={Math.max(0, s.contextHeavy.n - s.contextHeavy.rows.length)}
          rows={s.contextHeavy.rows.map((r) => (
            <Row
              key={r.conversationId}
              primary={r.conversation ?? "Untitled conversation"}
              secondary={`${compactNumber(r.avgContext)} tokens per call · ${r.calls} calls over ${r.requests} requests · ${r.user ?? "no person"} · ${r.agent ?? "no agent"}`}
              cost={r.cost}
              href={`/chat/${r.conversationId}`}
              onDrill={() => onDrill("conversation", r.conversationId)}
            />
          ))}
        />
      ),
    },
    {
      cost: s.iterationHeavy.cost,
      node: (
        <SignalCard
          key="iterations"
          icon={Repeat}
          title="Requests that looped"
          cost={s.iterationHeavy.cost}
          total={total}
          n={s.iterationHeavy.n}
          unit="requests"
          line={`≥ ${s.iterationHeavy.threshold} model calls in one request`}
          meaning="One request that called the model this many times is a tool loop. Legitimate for agentic work; a defect when the same tool keeps failing and the agent keeps retrying."
          moreThanShown={Math.max(0, s.iterationHeavy.n - s.iterationHeavy.rows.length)}
          rows={s.iterationHeavy.rows.map((r) => (
            <Row
              key={r.requestId}
              primary={`${r.iterations} calls, ${r.toolCalls} tool calls — ${r.conversation ?? r.feature ?? "request"}`}
              secondary={`${timestamp(r.at)} · ${r.user ?? "no person"} · ${r.agent ?? "no agent"}`}
              cost={r.cost}
              href={r.conversationId ? `/chat/${r.conversationId}` : null}
              onDrill={r.conversationId ? () => onDrill("conversation", r.conversationId ?? "") : undefined}
            />
          ))}
        />
      ),
    },
    {
      cost: s.failedSpend.cost,
      node: (
        <SignalCard
          key="failed"
          icon={AlertTriangle}
          title="Spent and got nothing back"
          cost={s.failedSpend.cost}
          total={total}
          n={s.failedSpend.n}
          unit="requests"
          meaning="Requests that failed, were abandoned, or were cut off at the output limit. The money left; no usable answer came back. Truncations (max_tokens) on a $5 request mean the output cap is too low for the job."
          moreThanShown={Math.max(0, s.failedSpend.n - s.failedSpend.rows.length)}
          rows={s.failedSpend.rows.map((r) => (
            <Row
              key={r.requestId}
              primary={`${r.status ?? "?"}${r.finishReason ? ` (${r.finishReason})` : ""} — ${r.conversation ?? r.feature ?? "request"}`}
              secondary={`${timestamp(r.at)} · ${r.user ?? "no person"} · ${r.agent ?? "no agent"}`}
              cost={r.cost}
              href={r.conversationId ? `/chat/${r.conversationId}` : null}
              onDrill={r.conversationId ? () => onDrill("conversation", r.conversationId ?? "") : undefined}
            />
          ))}
        />
      ),
    },
    {
      cost: s.spikeHours.cost,
      node: (
        <SignalCard
          key="spikes"
          icon={TrendingUp}
          title="Hours that spiked"
          cost={s.spikeHours.cost}
          total={total}
          n={s.spikeHours.n}
          unit="hours"
          line={`> ${s.spikeHours.threshold}× the median hour (${usd(s.spikeHours.medianHour)})`}
          meaning="An hour far above the window's typical hour. A loop or a runaway job shows up here before anywhere else. Each row names who and what dominated that hour."
          moreThanShown={Math.max(0, s.spikeHours.n - s.spikeHours.rows.length)}
          rows={s.spikeHours.rows.map((r) => (
            <Row
              key={r.hour}
              primary={`${shortLocal(r.hour)} — ${r.multiple !== null ? `${r.multiple}× the median` : ""}`}
              secondary={`${r.topUser ?? "no person"} · ${r.topFeature ?? "no feature"} · ${r.n} executions`}
              cost={r.cost}
              onDrill={() => onDrill("hour", r.hour)}
            />
          ))}
        />
      ),
    },
    {
      cost: s.repeatBursts.cost,
      node: (
        <SignalCard
          key="bursts"
          icon={RotateCcw}
          title="Repeat bursts"
          cost={s.repeatBursts.cost}
          total={total}
          n={s.repeatBursts.n}
          unit="bursts"
          line={`≥ ${s.repeatBursts.threshold} requests from the same person + agent + feature in 10 minutes`}
          meaning="A person typing does not send this many requests to the same agent in ten minutes. A loop or a retry storm does. Automated bursts are expected for fan-out jobs; manual ones are worth a look."
          moreThanShown={Math.max(0, s.repeatBursts.n - s.repeatBursts.rows.length)}
          rows={s.repeatBursts.rows.map((r) => (
            <Row
              key={`${r.bucket}-${r.user}-${r.agent}-${r.feature}`}
              primary={`${r.requests} requests — ${r.agent ?? "no agent"} · ${r.feature ?? "no feature"}`}
              secondary={`${timestamp(r.bucket)} · ${r.user ?? "no person"} · ${r.trigger ?? ""}`}
              cost={r.cost}
            />
          ))}
        />
      ),
    },
  ];

  cards.sort((a, b) => b.cost - a.cost);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{cards.map((c) => c.node)}</div>
      {s.unpriced.n > 0 ? (
        <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-[11px] text-destructive">
          <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Unpriced calls: {s.unpriced.n} model calls across {s.unpriced.requests} requests have no
          price on file, so this window is under-counted by an unknown amount. The model needs a
          price in the AI catalog.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[11px] text-muted-foreground">
          <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Unpriced calls: none — every model call in this window had a price on file.
        </p>
      )}
    </div>
  );
}
