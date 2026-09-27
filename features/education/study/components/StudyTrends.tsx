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
import Link from "next/link";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import {
  CartesianGrid,
  Line,
  LineChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { studyService } from "../service/studyService";
import { displayMasteryPct } from "../utils/masteryFsrs";
import {
  lastAttemptAtBySession,
  sessionStudyMs,
} from "../utils/sessionStudyTime";
import type {
  ItemMasteryRow,
  StudyAttemptRow,
  StudySessionRow,
} from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { topicLabel } from "../utils/topicLabel";

/** The only mode wired to a topic join today — see the header note above. */
type TopicSource = "fc_card";

export interface StudyTrendsProps {
  /** One mode's attempts (e.g. "fc_card"). Omit → accuracy across EVERY mode. */
  itemType?: string;
  /** Receives the weekly series once loaded (the page's agent context uses it). */
  onSeries?: (series: StudyWeekSeries[]) => void;
  /** Already-loaded mastery rows from the parent — reused for the topic
   *  breakdown so this component never re-fetches what StudyProgress has. */
  mastery: ItemMasteryRow[];
  /** How many trailing weeks to show. Default 8 (~2 months). */
  weeks?: number;
  /** Which mode-specific topic join to use for the per-topic section. Omit
   *  to hide that section entirely (e.g. a mode with no topic concept). */
  topicSource?: TopicSource;
  /** Where a topic row opens (e.g. a drill of that topic). Omit → rows are plain. */
  topicHref?: (topic: string) => string;
}

/** One week of the charts, as drawn. */
export interface StudyWeekSeries {
  week: string;
  week_start: string;
  graded_answers: number;
  accuracy_pct: number | null;
  minutes: number;
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
  // Short numeric form ("8/16") so all 8 weeks fit on a phone and BOTH
  // charts show every week at the same x positions.
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function buildWeekBuckets(
  attempts: StudyAttemptRow[],
  sessions: StudySessionRow[],
  weeks: number,
  allAttempts: StudyAttemptRow[] = attempts,
): WeekBucket[] {
  const now = new Date();
  const firstWeekStart = startOfWeek(
    new Date(now.getTime() - (weeks - 1) * MS_PER_WEEK),
  );
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const weekStart = new Date(firstWeekStart.getTime() + i * MS_PER_WEEK);
    return {
      label: weekLabel(weekStart),
      weekStart,
      attempts: 0,
      correct: 0,
      minutes: 0,
    };
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

  // Minutes come from EVERY mode's attempts (a session's last attempt bounds
  // an abandoned session) — never an abandoned session's wall-clock span.
  const lastAttemptAt = lastAttemptAtBySession(allAttempts);
  for (const s of sessions) {
    const startedAt = s.started_at ?? s.created_at;
    if (!startedAt) continue;
    const ms = sessionStudyMs(s, lastAttemptAt.get(s.id));
    if (ms <= 0) continue;
    const b = bucketFor(new Date(startedAt).getTime());
    if (!b) continue;
    b.minutes += ms / 60_000;
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
  const byTopic = new Map<
    string,
    { sum: number; count: number; struggling: number }
  >();
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
  topicHref,
  onSeries,
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
        studyService.listAllAttempts({ since }),
        studyService.listSessions({ since, limit: 1000 }),
      ]);
      if (cancelled) return;
      if (attemptsRes.error || sessionsRes.error) {
        setLoadError(
          attemptsRes.error ?? sessionsRes.error ?? "Failed to load trends",
        );
        return;
      }
      const allAttempts = attemptsRes.data ?? [];
      const built = buildWeekBuckets(
        itemType
          ? allAttempts.filter((a) => a.item_type === itemType)
          : allAttempts,
        sessionsRes.data ?? [],
        weeks,
        allAttempts,
      );
      setBuckets(built);
      onSeries?.(
        built.map((b) => ({
          week: b.label,
          week_start: b.weekStart.toISOString().slice(0, 10),
          graded_answers: b.attempts,
          accuracy_pct:
            b.attempts > 0 ? Math.round((b.correct / b.attempts) * 100) : null,
          minutes: Math.round(b.minutes),
        })),
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
    answers: b.attempts,
    accuracy:
      b.attempts > 0 ? Math.round((b.correct / b.attempts) * 100) : null,
  }));
  const emptyWeeks = new Set(
    accuracyData.filter((d) => d.accuracy == null).map((d) => d.label),
  );
  const timeData = (buckets ?? []).map((b) => ({
    label: b.label,
    minutes: Math.round(b.minutes),
  }));
  const hasAnyActivity = (buckets ?? []).some(
    (b) => b.attempts > 0 || b.minutes > 0,
  );

  const location = "Study progress › Trends";
  const accuracyText = () =>
    [
      `Accuracy trend (last ${weeks} weeks, by week)`,
      ...accuracyData.map(
        (d) => `${d.label}: ${d.accuracy == null ? "no graded answers" : `${d.accuracy}%`}`,
      ),
    ].join("\n");
  const timeText = () =>
    [
      `Weekly time studied (last ${weeks} weeks, minutes)`,
      ...timeData.map((d) => `${d.label}: ${d.minutes} min`),
    ].join("\n");
  const topicRows = (topicStats ?? []).map((t) => ({
    topic: topicLabel(t.topic),
    raw_topic: t.topic,
    mastery_pct: t.avgMasteryPct,
    cards: t.count,
    needs_work: t.struggling,
  }));
  const topicText = () =>
    [
      "Mastery by topic (weakest first)",
      ...topicRows.map(
        (t) => `${t.topic}: ${t.mastery_pct}% mastery · ${t.cards} card${t.cards === 1 ? "" : "s"}`,
      ),
    ].join("\n");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">
              Accuracy trend
            </h2>
            {hasAnyActivity && (
              <CopyButtons
                size="xs"
                unified
                label="Accuracy trend"
                human={accuracyText}
                agent={() => ({
                  kind: "study-accuracy-trend",
                  location,
                  description: `Weekly accuracy (percent of graded answers correct, ${itemType ? `${itemType} only` : "every study mode"}) over the last ${weeks} weeks, as drawn on the chart; null = no graded answers that week.`,
                  data: accuracyData,
                  summary: accuracyText(),
                  attributes: { weeks },
                })}
              />
            )}
          </div>
          {buckets === null ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : loadError ? (
            <p className="py-8 text-center text-xs text-destructive">
              {loadError}
              <ErrorAlchemyMenu error={loadError} />
            </p>
          ) : !hasAnyActivity ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Not enough recent activity yet.
            </p>
          ) : (
            <ChartContainer
              config={accuracyChartConfig}
              className="aspect-auto h-40 w-full"
            >
              <LineChart
                data={accuracyData}
                margin={{ left: 0, right: 8, top: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  interval={0}
                  height={34}
                  tick={(props) => (
                    <WeekTick {...props} empty={emptyWeeks.has(String(props.payload?.value))} />
                  )}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  width={40}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => {
                        const answers = (item?.payload as { answers?: number } | undefined)?.answers ?? 0;
                        return value == null
                          ? "No graded answers this week"
                          : `${value}% of ${answers} graded answer${answers === 1 ? "" : "s"}`;
                      }}
                    />
                  }
                />
                {/* Real weeks only: no curve invented between them, no line
                    drawn across a week with no graded answers. */}
                <Line
                  dataKey="accuracy"
                  type="linear"
                  stroke="var(--color-accuracy)"
                  strokeWidth={2}
                  dot={{ r: 3.5 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">
              Weekly time studied
            </h2>
            {hasAnyActivity && (
              <CopyButtons
                size="xs"
                unified
                label="Weekly time studied"
                human={timeText}
                agent={() => ({
                  kind: "study-weekly-time",
                  location,
                  description: `Minutes actually studied per week over the last ${weeks} weeks (abandoned sessions count only up to their last answer), as drawn on the chart.`,
                  data: timeData,
                  summary: timeText(),
                  attributes: {
                    weeks,
                    total_minutes: timeData.reduce((n, d) => n + d.minutes, 0),
                  },
                })}
              />
            )}
          </div>
          {buckets === null ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : loadError ? (
            <p className="py-8 text-center text-xs text-destructive">
              {loadError}
              <ErrorAlchemyMenu error={loadError} />
            </p>
          ) : !hasAnyActivity ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Not enough recent activity yet.
            </p>
          ) : (
            <ChartContainer
              config={timeChartConfig}
              className="aspect-auto h-40 w-full"
            >
              <BarChart
                data={timeData}
                margin={{ left: 0, right: 8, top: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  interval={0}
                  height={34}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  allowDecimals={false}
                  tickFormatter={(v: number) => `${v}m`}
                  width={40}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${value} min studied`}
                    />
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
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-foreground">By topic</h2>
            {topicRows.length > 0 && (
              <CopyButtons
                size="xs"
                unified
                label="Mastery by topic"
                human={topicText}
                agent={() => ({
                  kind: "study-topic-mastery",
                  location,
                  description:
                    "Average mastery per flashcard topic, weakest first — every topic, as listed on the page.",
                  data: topicRows,
                  summary: topicText(),
                  attributes: { topics: topicRows.length },
                })}
              />
            )}
          </div>
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
              {topicStats.map((t) => {
                const href = topicHref?.(t.topic);
                const row = (
                  <>
                  <span
                    className="w-40 shrink-0 truncate text-xs text-foreground sm:w-56"
                    title={t.topic}
                  >
                    {topicLabel(t.topic)}
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
                      style={{ width: `${t.avgMasteryPct}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {t.avgMasteryPct}%
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {t.count} card{t.count === 1 ? "" : "s"}
                  </span>
                  </>
                );
                return (
                  <li key={t.topic}>
                    {href ? (
                      <Link
                        href={href}
                        title={`Drill ${topicLabel(t.topic)}`}
                        className="-mx-1 flex items-center gap-3 rounded-md px-1 py-0.5 hover:bg-muted/60"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3">{row}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** An x-axis week label; a week with no graded answers reads muted, with a dash. */
function WeekTick({
  x,
  y,
  payload,
  empty,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  empty: boolean;
}) {
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text
        dy={12}
        textAnchor="middle"
        fontSize={11}
        className={empty ? "fill-muted-foreground/50" : "fill-muted-foreground"}
      >
        {String(payload?.value ?? "")}
      </text>
      {/* Outside the plot, under the date — never on the 0% line, where it
          would read as a score. */}
      {empty && (
        <circle cx={0} cy={22} r={2} className="fill-none stroke-muted-foreground/60" strokeWidth={1}>
          <title>No graded answers this week</title>
        </circle>
      )}
    </g>
  );
}
