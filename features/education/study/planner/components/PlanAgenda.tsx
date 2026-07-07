"use client";

// features/education/study/planner/components/PlanAgenda.tsx
//
// The calendar/agenda view of a generated study plan: one card per day, each
// showing its date, rest-day / today markers, an anti-burnout load bar (planned
// minutes vs the daily budget), the day's rationale, and its ordered study
// blocks. Each block deep-links into the right study surface and can be checked
// off (done/skip) — writing back to study_plan_block via the parent.
//
// React Compiler is on: no manual memo.

import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Coffee,
  SkipForward,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { blockHref, blockIcon, blockKindLabel } from "../blockLinks";
import type {
  PlanWithDays,
  StudyPlanBlockRow,
  StudyPlanDayRow,
} from "../types";

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface PlanAgendaProps {
  plan: PlanWithDays;
  onBlockStatus: (
    blockId: string,
    status: "pending" | "done" | "skipped",
  ) => void;
  busyBlockId?: string | null;
}

export function PlanAgenda({ plan, onBlockStatus, busyBlockId }: PlanAgendaProps) {
  const today = todayIso();
  const dailyMinutes = plan.plan.daily_minutes ?? 30;

  return (
    <div className="flex flex-col gap-3">
      {plan.days.map(({ day, blocks }) => (
        <DayCard
          key={day.id}
          day={day}
          blocks={blocks}
          isToday={day.day_date === today}
          isPast={day.day_date < today}
          dailyMinutes={dailyMinutes}
          onBlockStatus={onBlockStatus}
          busyBlockId={busyBlockId}
        />
      ))}
    </div>
  );
}

function DayCard({
  day,
  blocks,
  isToday,
  isPast,
  dailyMinutes,
  onBlockStatus,
  busyBlockId,
}: {
  day: StudyPlanDayRow;
  blocks: StudyPlanBlockRow[];
  isToday: boolean;
  isPast: boolean;
  dailyMinutes: number;
  onBlockStatus: PlanAgendaProps["onBlockStatus"];
  busyBlockId?: string | null;
}) {
  const date = parseLocalDate(day.day_date);
  const loadPct = Math.min(
    100,
    Math.round(((day.target_minutes ?? 0) / Math.max(1, dailyMinutes)) * 100),
  );

  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-4 transition-colors",
        isToday
          ? "border-primary/60 ring-1 ring-primary/30"
          : "border-border",
        isPast && !isToday && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-center",
              isToday
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-muted/40 text-muted-foreground",
            )}
          >
            <span className="text-[10px] uppercase leading-none">
              {WEEKDAY[date.getDay()]}
            </span>
            <span className="text-base font-semibold leading-tight text-foreground">
              {date.getDate()}
            </span>
            <span className="text-[9px] uppercase leading-none">
              {MONTH[date.getMonth()]}
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {isToday && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  Today
                </span>
              )}
              {day.is_rest_day && (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Coffee className="h-3 w-3" />
                  Rest day
                </span>
              )}
              {!day.is_rest_day && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {day.target_minutes} min planned
                </span>
              )}
            </div>
            {day.rationale && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {day.rationale}
              </p>
            )}
          </div>
        </div>
        {!day.is_rest_day && (
          <div className="hidden w-24 shrink-0 sm:block" title={`${loadPct}% of your daily budget`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  loadPct > 100
                    ? "bg-red-500"
                    : loadPct > 80
                      ? "bg-amber-500"
                      : "bg-primary",
                )}
                style={{ width: `${Math.max(4, loadPct)}%` }}
              />
            </div>
            <span className="mt-1 block text-right text-[10px] tabular-nums text-muted-foreground">
              {loadPct}% load
            </span>
          </div>
        )}
      </div>

      {!day.is_rest_day && blocks.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {blocks.map((b) => (
            <BlockRow
              key={b.id}
              block={b}
              busy={busyBlockId === b.id}
              onStatus={onBlockStatus}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function BlockRow({
  block,
  busy,
  onStatus,
}: {
  block: StudyPlanBlockRow;
  busy: boolean;
  onStatus: PlanAgendaProps["onBlockStatus"];
}) {
  const router = useRouter();
  const Icon = blockIcon(block.target_kind);
  const href = blockHref(
    block.target_kind,
    (block.target_ref as { topic?: string; href?: string } | null) ?? null,
  );
  const done = block.status === "done";
  const skipped = block.status === "skipped";

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-2.5",
        (done || skipped) && "opacity-60",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm font-medium text-foreground",
              done && "line-through",
            )}
          >
            {block.label}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            {blockKindLabel(block.target_kind)}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{block.estimated_minutes} min</span>
          {block.estimated_items != null && (
            <span className="tabular-nums">· {block.estimated_items} items</span>
          )}
          {block.rationale && <span className="italic">· {block.rationale}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {href && !done && !skipped && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => router.push(href)}
          >
            Start
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
        {done || skipped ? (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            disabled={busy}
            title="Reset"
            onClick={() => onStatus(block.id, "pending")}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-green-600 dark:text-green-400"
              disabled={busy}
              title="Mark done"
              onClick={() => onStatus(block.id, "done")}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              disabled={busy}
              title="Skip"
              onClick={() => onStatus(block.id, "skipped")}
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </li>
  );
}
