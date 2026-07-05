"use client";

// features/education/study/components/StudyTrends.tsx
//
// Phase 6 (Flashcards Competitive Parity Push) — cross-session analytics:
// accuracy-over-time, weekly time studied, and a per-topic mastery
// breakdown. Pure client-side aggregation over the study spine
// (study_attempt + study_session), same "moves to an RPC only once this
// outgrows a page load" posture as StudyProgress's own summarize().
//
// The per-topic breakdown is the one part that ISN'T mode-agnostic — the
// study spine has no topic column of its own (it's polymorphic by design).
// Flashcards is the only wired mode today, so `topicSource="fc_card"` is the
// only supported value; a second mode wanting this section adds its own
// case to `resolveTopics` rather than this component depending on every
// mode's feature package. `mastery` is REUSED from the parent (StudyProgress
// already fetched it) to avoid a duplicate query.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { studyService } from "../service/studyService";
import { displayMasteryPct } from "../utils/masteryFsrs";
import type { ItemMasteryRow, StudyAttemptRow, StudySessionRow } from "../types";

/** The only mode wired to a topic join today — see the header note above. */
type TopicSource = "fc_card";

export interface StudyTrendsProps {
  itemType: string;
  /** Already-loaded mastery rows from the parent — reused for the topic
   *  breakdown so this component never re-fetches what StudyProgress has. */
  mastery: ItemMasteryRow[];
  /** How many trailing weeks to show. Default 8 (~2 months). */
  weeks?: number;
  /** Which mode-specific topic join to use for the per-topic section. Omit
   *  to hide that section entirely (e.g. a mode with no topic concept). */
  topicSource?: TopicSource;
}

interface WeekBucket {
  label: string;
  weekStart: Date;
  attempts: number;
  correct: number;
  minutes: number;
}

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = copy.getDay(); // 0 = Sunday
  copy.setDate(copy.getDate() - day);
  return copy;
}

function weekLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function buildWeekBuckets(
  attempts: StudyAttemptRow[],
  sessions: StudySessionRow[],
  weeks: number,
): WeekBucket[] {
  const now = new Date();
  const firstWeekStart = startOfWeek(new Date(now.getTime() - (weeks - 1) * MS_PER_WEEK));
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(firstWeekStart.getTime() + i * MS_PER_WEEK);
    return { label: weekLabel(weekStart), weekStart, attempts: 0, correct: 0, minutes: 0 };
  });

  const bucketFor = (ts: number): WeekBucket | undefined => {
    if (ts < firstWeekStart.getTime()) return undefined;
    const idx = Math.floor((ts - firstWeekStart.getTime()) / MS_PER_WEEK);
    return buckets[idx];
  };

  for (const a of attempts) {
    if (!a.result) continue; // ungraded attempts don't count toward accuracy
    const b = bucketFor(new Date(a.created_at).getTime());
    if (!b) continue;
    b.attempts += 1;
    if (a.result === "correct") b.correct += 1;
  }

  for (const s of sessions) {
    const startedAt = s.started_at ?? s.created_at;
    if (!s.ended_at || !startedAt) continue;
    const start = new Date(startedAt).getTime();
    const end = new Date(s.ended_at).getTime();
    if (!(end > start)) continue;
    const b = bucketFor(start);
    if (!b) continue;
    b.minutes += (end - start) / 60_000;
  }

  return buckets;
}

interface TopicStat {
  topic: string;
  count: number;
  avgMasteryPct: number;
  struggling: number;
}

async function resolveTopics(
  source: TopicSource,
  itemIds: string[],
): Promise<Record<string, string | null>> {
  if (source === "fc_card") {
    // Dynamic import: StudyTrends is mode-agnostic infrastructure and must
    // not statically pull in a flashcards-specific module for every consumer
    // — only the fc_card path ever touches this.
    const { fcService } = await import("@/features/flashcards/data/fcService");
    const res = await fcService.getTopicsForCardIds(itemIds);
    return res.data ?? {};
  }
  return {};
}

function buildTopicStats(
  mastery: ItemMasteryRow[],
  topicsById: Record<string, string | null>,
): TopicStat[] {
  const now = new Date();
  const byTopic = new Map<string, { sum: number; count: number; struggling: number }>();
  for (const m of mastery) {
    const topic = topicsById[m.item_id]?.trim();
    if (!topic) continue;
    const pct = displayMasteryPct(m, now) ?? 0;
    const agg = byTopic.get(topic) ?? { sum: 0, count: 0, struggling: 0 };
    agg.sum += pct;
    agg.count += 1;
    if (m.struggle_flag || pct < 0.4) agg.struggling += 1;
    byTopic.set(topic, agg);
  }
  return Array.from(byTopic.entries())
    .map(([topic, agg]) => ({
      topic,
      count: agg.count,
      avgMasteryPct: Math.round((agg.sum / agg.count) * 100),
      struggling: agg.struggling,
    }))
    .sort((a, b) => a.avgMasteryPct - b.avgMasteryPct); // weakest topics first
}

const accuracyChartConfig = {
  accuracy: { label: "Accuracy", color: "hsl(var(--primary))" },
} satisfies ChartConfig;

const timeChartConfig = {
  minutes: { label: "Minutes studied", color: "hsl(var(--secondary))" },
} satisfies ChartConfig;

export function StudyTrends({
  itemType,
  mastery,
  weeks = 8,
  topicSource,
}: StudyTrendsProps) {
  const [buckets, setBuckets] = useState<WeekBucket[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [topicStats, setTopicStats] = useState<TopicStat[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBuckets(null);
      setLoadError(null);
      const since = new Date(Date.now() - weeks * MS_PER_WEEK).toISOString();
      const [attemptsRes, sessionsRes] = await Promise.all([
        studyService.listAttempts(itemType, { since }),
        studyService.listSessions({ since, limit: 1000 }),
      ]);
      if (cancelled) return;
      if (attemptsRes.error || sessionsRes.error) {
        setLoadError(attemptsRes.error ?? sessionsRes.error ?? "Failed to load trends");
        return;
      }
      setBuckets(
        buildWeekBuckets(attemptsRes.data ?? [], sessionsRes.data ?? [], weeks),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [itemType, weeks]);

  useEffect(() => {
    if (!topicSource || mastery.length === 0) {
      setTopicStats(topicSource ? [] : null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const itemIds = mastery.map((m) => m.item_id);
      const topicsById = await resolveTopics(topicSource, itemIds);
      if (cancelled) return;
      setTopicStats(buildTopicStats(mastery, topicsById));
    })();
    return () => {
      cancelled = true;
    };
  }, [topicSource, mastery]);

  const accuracyData = (buckets ?? []).map((b) => ({
    label: b.label,
    accuracy: b.attempts > 0 ? Math.round((b.correct / b.attempts) * 100) : null,
  }));
  const timeData = (buckets ?? []).map((b) => ({
    label: b.label,
    minutes: Math.round(b.minutes),
  }));
  const hasAnyActivity = (buckets ?? []).some((b) => b.attempts > 0 || b.minutes > 0);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-medium text-foreground">
            Accuracy trend
          </h2>
          {buckets === null ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : loadError ? (
            <p className="py-8 text-center text-xs text-destructive">{loadError}</p>
          ) : !hasAnyActivity ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Not enough recent activity yet.
            </p>
          ) : (
            <ChartContainer config={accuracyChartConfig} className="aspect-auto h-40 w-full">
              <LineChart data={accuracyData} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  minTickGap={20}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  domain={[0, 100]}
                  width={32}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (value == null ? "No data" : `${value}%`)}
                    />
                  }
                />
                <Line
                  dataKey="accuracy"
                  type="monotone"
                  stroke="var(--color-accuracy)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ChartContainer>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-sm font-medium text-foreground">
            Weekly time studied
          </h2>
          {buckets === null ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : loadError ? (
            <p className="py-8 text-center text-xs text-destructive">{loadError}</p>
          ) : !hasAnyActivity ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Not enough recent activity yet.
            </p>
          ) : (
            <ChartContainer config={timeChartConfig} className="aspect-auto h-40 w-full">
              <BarChart data={timeData} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  minTickGap={20}
                />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent formatter={(value) => `${value} min`} />
                  }
                />
                <Bar dataKey="minutes" fill="var(--color-minutes)" radius={4} />
              </BarChart>
            </ChartContainer>
          )}
        </section>
      </div>

      {topicSource && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground">By topic</h2>
          {topicStats === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-lg" />
              ))}
            </div>
          ) : topicStats.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Tag cards with a topic to see a per-topic breakdown here.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topicStats.map((t) => (
                <li key={t.topic} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-xs text-foreground" title={t.topic}>
                    {t.topic}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        t.avgMasteryPct >= 80
                          ? "bg-green-500"
                          : t.avgMasteryPct >= 40
                            ? "bg-amber-500"
                            : "bg-red-500",
                      )}
                      style={{ width: `${Math.max(4, t.avgMasteryPct)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {t.avgMasteryPct}%
                  </span>
                  <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {t.count} card{t.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
