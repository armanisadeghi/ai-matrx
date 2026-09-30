"use client";

// features/marketing/pr/calendar/PrCalendarPage.tsx
//
// THE BRAND'S PR CALENDAR (BRIEFS-STRATEGY-AND-ORG-CHART §3.2) — the reserved calendar route,
// filled. The six-month plan of moments worth pitching, on a real month calendar: every
// pitch-ready, watch and avoid moment on its day, with its source, its lead-time windows per
// outlet tier, the proof it still needs, and a "Draft angles" action that hands it to the PR
// Director. Refresh runs the same pipeline the Director's planner member runs.
//
// Every date here was computed by code on the server from a sourced moment; this screen
// arranges them and never writes one.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Megaphone,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import { ReadGate } from "@/components/read-state/ReadGate";
import { useRead } from "@/components/read-state/useRead";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { getComingSoon } from "@/lib/coming-soon/registry";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { DIRECTOR_ASK_PARAM } from "@/features/marketing/pr/director/director-context";

import { listBrandMoments, readBrandCalendarMetadata, runBrandCalendar } from "./api";
import {
  BUCKET_LABEL,
  PITCH_STATUS_LABEL,
  dayKey,
  draftAnglesAsk,
  monthGrid,
  momentsByDay,
  parseDay,
  readCalendarPlan,
  type PlannedMoment,
  type PrBucket,
  type PrMomentRow,
} from "./calendar-model";

const BUCKET_TONE: Record<PrBucket, string> = {
  pitch_ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  watch: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200",
  avoid: "border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200",
};
const BUCKET_ORDER: PrBucket[] = ["pitch_ready", "watch", "avoid"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDay(day: string): string {
  const d = parseDay(day);
  return d ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : day;
}

export function PrCalendarPage() {
  const brand = useMarketingBrand();
  const dispatch = useAppDispatch();
  const read = useRead(
    async () => {
      const [metadata, feed] = await Promise.all([
        readBrandCalendarMetadata(brand.id),
        listBrandMoments(brand.id),
      ]);
      return { plan: readCalendarPlan(metadata), feed };
    },
    [brand.id],
  );
  const plan = read.data?.plan ?? null;
  const feed = useMemo(
    () => new Map((read.data?.feed ?? []).map((row) => [row.id, row] as const)),
    [read.data?.feed],
  );

  const [month, setMonth] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [research, setResearch] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);

  const byDay = useMemo(() => momentsByDay(plan?.moments ?? [], feed), [plan, feed]);
  const selected =
    plan?.moments.find((m) => m.momentId === selectedId) ??
    plan?.moments.find((m) => plan.actThisWeek.includes(m.momentId)) ??
    null;
  const pressRoom = marketingRoutes.brandSection(brand.seg, "pr");
  const promise = getComingSoon("marketing.calendar");

  async function refresh() {
    setRunning(true);
    setProgress([]);
    try {
      await runBrandCalendar(dispatch, brand.id, brand.organizationId, { research }, (message) =>
        setProgress((prev) => [...prev, message]),
      );
      toast.success("The PR calendar is up to date.");
      read.retry();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The calendar could not be refreshed.");
    } finally {
      setRunning(false);
    }
  }

  const today = dayKey(new Date());
  const grid = monthGrid(month);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
        {/* Header: what this is, how fresh, and the one piece of work */}
        <section className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">PR calendar for {brand.name}</h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              The dated moments worth pitching over the next six months — holidays, awareness days, regulatory
              dates, industry events and earnings — each with its source, sorted into pitch-ready, watch and avoid,
              with the pitch window for every kind of outlet.
            </p>
            {plan ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Planned {new Date(plan.generatedAt).toLocaleString()} · window {formatDay(plan.windowStart)} –{" "}
                {formatDay(plan.windowEnd)} · {plan.feedSize} sourced moments considered, {plan.droppedCount} dropped
                as not worth pitching
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={research}
                onChange={(e) => setResearch(e.target.checked)}
                disabled={running}
              />
              Research events and earnings
            </label>
            <Button size="sm" onClick={() => void refresh()} disabled={running}>
              {running ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
              {plan ? "Refresh the calendar" : "Build the calendar"}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href={pressRoom}>
                <Megaphone className="mr-1.5 size-3.5" />
                Press Room
              </Link>
            </Button>
          </div>
        </section>

        {running || progress.length ? (
          <section aria-live="polite" className="rounded-md border bg-muted/30 p-2 text-[11px] text-muted-foreground">
            {progress.length === 0 ? "Starting…" : progress.map((line, i) => <p key={i}>{line}</p>)}
          </section>
        ) : null}

        <ReadGate
          status={read.status}
          error={read.error}
          onRetry={read.retry}
          what="the PR calendar"
          isEmpty={!plan}
          empty={
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              <p>No PR calendar for {brand.name} yet.</p>
              <p className="mt-1 text-xs">
                Build it once: the platform collects the sourced dates, the planner keeps the ones {brand.name} has
                real standing to own, and code works out every pitch window.
              </p>
            </div>
          }
        >
          {plan ? (
            <>
              {plan.notices.length ? (
                <section className="flex flex-col gap-1.5">
                  {plan.notices.map((n) => (
                    <div key={n.code + n.message} className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" aria-hidden />
                      <div>
                        <p>{n.message}</p>
                        {n.remedy ? <p className="text-muted-foreground">{n.remedy}</p> : null}
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              {plan.actThisWeek.length ? (
                <section className="rounded-md border p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Act this week</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {plan.actThisWeek.map((id) => {
                      const m = plan.moments.find((x) => x.momentId === id);
                      if (!m) return null;
                      return (
                        <MomentChip key={id} moment={m} row={feed.get(id)} onSelect={setSelectedId} withDate />
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                {/* The month */}
                <section className="rounded-md border" aria-label="Month calendar">
                  <header className="flex items-center justify-between border-b px-3 py-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Previous month"
                      onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    >
                      <ChevronLeft className="size-4" />
                    </Button>
                    <h3 className="text-sm font-medium">
                      {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                    </h3>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label="Next month"
                      onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  </header>
                  <div className="grid grid-cols-7 border-b text-center text-[10px] uppercase text-muted-foreground">
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="py-1">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {grid.map((day) => {
                      const key = dayKey(day);
                      const inMonth = day.getMonth() === month.getMonth();
                      const moments = byDay.get(key) ?? [];
                      return (
                        <div
                          key={key}
                          data-day={key}
                          className={cn(
                            "min-h-[76px] border-b border-r p-1 text-[10px]",
                            !inMonth && "bg-muted/30 text-muted-foreground/60",
                          )}
                        >
                          <div
                            className={cn(
                              "mb-0.5 flex size-5 items-center justify-center rounded-full",
                              key === today && "bg-primary text-primary-foreground",
                            )}
                          >
                            {day.getDate()}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            {moments.slice(0, 3).map((m) => (
                              <MomentChip
                                key={m.momentId}
                                moment={m}
                                row={feed.get(m.momentId)}
                                onSelect={setSelectedId}
                                selected={selected?.momentId === m.momentId}
                                compact
                              />
                            ))}
                            {moments.length > 3 ? (
                              <span className="text-muted-foreground">+{moments.length - 3} more</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <footer className="flex flex-wrap items-center gap-3 px-3 py-2 text-[10px] text-muted-foreground">
                    {BUCKET_ORDER.map((b) => (
                      <span key={b} className="flex items-center gap-1">
                        <span className={cn("inline-block size-2.5 rounded-sm border", BUCKET_TONE[b])} />
                        {BUCKET_LABEL[b]}
                      </span>
                    ))}
                  </footer>
                </section>

                {/* The selected moment */}
                <MomentDetail
                  moment={selected}
                  row={selected ? feed.get(selected.momentId) : undefined}
                  tierWindows={selected ? (plan.tierWindows[selected.momentId] ?? []) : []}
                  pressRoom={pressRoom}
                />
              </div>

              {/* Every kept moment by bucket — the list view of the same plan */}
              <section className="grid gap-3 md:grid-cols-3">
                {BUCKET_ORDER.map((bucket) => {
                  const list = plan.moments.filter((m) => m.bucket === bucket);
                  return (
                    <div key={bucket} className="rounded-md border p-3">
                      <h3 className="text-xs font-semibold">
                        {BUCKET_LABEL[bucket]} <span className="text-muted-foreground">({list.length})</span>
                      </h3>
                      <ul className="mt-2 flex flex-col gap-1">
                        {list.length === 0 ? (
                          <li className="text-[11px] text-muted-foreground">None in this window.</li>
                        ) : (
                          list.map((m) => (
                            <li key={m.momentId}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedId(m.momentId);
                                  const d = parseDay(m.startsOn);
                                  if (d) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                                }}
                                className="w-full rounded px-1.5 py-1 text-left text-xs hover:bg-muted"
                              >
                                <span className="font-medium">{feed.get(m.momentId)?.title ?? "Untitled moment"}</span>
                                <span className="ml-1 text-muted-foreground">· {formatDay(m.startsOn)}</span>
                                {m.pitchStatus ? (
                                  <span className="ml-1 text-muted-foreground">· {PITCH_STATUS_LABEL[m.pitchStatus]}</span>
                                ) : null}
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  );
                })}
              </section>

              {plan.gapsAndClusters.length || plan.coveragePatterns.length ? (
                <section className="grid gap-3 md:grid-cols-2">
                  {plan.gapsAndClusters.length ? (
                    <NoteList title="Gaps and clusters" items={plan.gapsAndClusters} />
                  ) : null}
                  {plan.coveragePatterns.length ? (
                    <NoteList title="What coverage looked like last time" items={plan.coveragePatterns} />
                  ) : null}
                </section>
              ) : null}

              {plan.couldNotVerify.length ? (
                <section className="rounded-md border p-3">
                  <h3 className="text-xs font-semibold">Could not verify ({plan.couldNotVerify.length})</h3>
                  <p className="text-[11px] text-muted-foreground">
                    Dates the researcher proposed that code could not find on the source page. They stay off the
                    calendar until they can be read there.
                  </p>
                  <ul className="mt-2 flex flex-col gap-1 text-xs">
                    {plan.couldNotVerify.map((c, i) => (
                      <li key={i}>
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                            {c.title || c.url}
                          </a>
                        ) : (
                          c.title
                        )}{" "}
                        <span className="text-muted-foreground">— {c.reason}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}
        </ReadGate>

        {promise ? (
          <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <ComingSoonBadge />
            {promise.promise}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MomentChip({
  moment,
  row,
  onSelect,
  selected = false,
  compact = false,
  withDate = false,
}: {
  moment: PlannedMoment;
  row: PrMomentRow | undefined;
  onSelect: (id: string) => void;
  selected?: boolean;
  compact?: boolean;
  withDate?: boolean;
}) {
  const title = row?.title ?? "Untitled moment";
  return (
    <button
      type="button"
      onClick={() => onSelect(moment.momentId)}
      title={`${BUCKET_LABEL[moment.bucket]}: ${title}`}
      className={cn(
        "truncate rounded border px-1.5 text-left",
        compact ? "py-0 text-[10px]" : "py-1 text-xs",
        BUCKET_TONE[moment.bucket],
        selected && "ring-2 ring-primary",
      )}
    >
      {title}
      {withDate ? <span className="ml-1 opacity-70">· {formatDay(moment.startsOn)}</span> : null}
    </button>
  );
}

function MomentDetail({
  moment,
  row,
  tierWindows,
  pressRoom,
}: {
  moment: PlannedMoment | null;
  row: PrMomentRow | undefined;
  tierWindows: { tier: string; label: string; windowOpensOn: string; deadlineOn: string; pitchStatus: string | null }[];
  pressRoom: string;
}) {
  if (!moment) {
    return (
      <aside className="rounded-md border p-3 text-xs text-muted-foreground">
        Pick a moment on the calendar to see its source, its pitch windows and what it still needs.
      </aside>
    );
  }
  const draftHref = `${pressRoom}?${DIRECTOR_ASK_PARAM}=${encodeURIComponent(draftAnglesAsk(moment, row))}`;
  return (
    <aside className="flex flex-col gap-3 rounded-md border p-3" aria-label="Selected moment">
      <div>
        <span className={cn("inline-block rounded border px-1.5 text-[10px]", BUCKET_TONE[moment.bucket])}>
          {BUCKET_LABEL[moment.bucket]}
        </span>
        <h3 className="mt-1 text-sm font-semibold">{row?.title ?? "Untitled moment"}</h3>
        <p className="text-xs text-muted-foreground">
          {formatDay(moment.startsOn)}
          {row?.ends_on && row.ends_on !== row.starts_on ? ` – ${formatDay(row.ends_on)}` : ""}
          {moment.pitchStatus ? ` · ${PITCH_STATUS_LABEL[moment.pitchStatus]}` : ""}
        </p>
      </div>

      {moment.bucket !== "avoid" ? (
        <Button size="sm" asChild>
          <Link href={draftHref}>
            <Megaphone className="mr-1.5 size-3.5" />
            Draft angles with the PR Director
          </Link>
        </Button>
      ) : null}

      <Field label="Source">
        {row?.source_url ? (
          <a href={row.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
            {row.organizer || new URL(row.source_url).hostname}
            <ArrowUpRight className="size-3" />
          </a>
        ) : (
          <span>{row?.organizer || "No link on file"}</span>
        )}
        <span className="text-muted-foreground">
          {" "}
          · {row?.date_basis === "provider"
            ? "public-holiday provider"
            : row?.date_basis === "catalog_rule"
              ? "observance catalog"
              : row?.date_basis === "source_page"
                ? "date read on the source page"
                : row?.date_basis === "user_supplied"
                  ? "entered by your team"
                  : (row?.date_basis ?? "unknown basis")}
          {row?.verification ? ` · "${row.verification}"` : ""}
        </span>
      </Field>

      <Field label="Standing">
        <span className="capitalize">{moment.standing}</span>
        {moment.standingReason ? <span className="text-muted-foreground"> — {moment.standingReason}</span> : null}
      </Field>

      {moment.safetyReason ? <Field label="Why avoid">{moment.safetyReason}</Field> : null}

      {moment.angleSeed ? <Field label="Angle seed">{moment.angleSeed}</Field> : null}

      {moment.proofNeeded.length ? (
        <Field label="Proof it still needs">
          <ul className="list-disc pl-4">
            {moment.proofNeeded.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Field>
      ) : null}

      {tierWindows.length ? (
        <Field label="Pitch windows (lead times)">
          <table className="w-full text-[11px]">
            <tbody>
              {tierWindows.map((w) => (
                <tr key={w.tier} className="border-t first:border-t-0">
                  <td className="py-0.5 pr-2">{w.label}</td>
                  <td className="py-0.5 pr-2 whitespace-nowrap text-muted-foreground">
                    {formatDay(w.windowOpensOn)} – {formatDay(w.deadlineOn)}
                  </td>
                  <td className="py-0.5 whitespace-nowrap">
                    {w.pitchStatus && w.pitchStatus in PITCH_STATUS_LABEL
                      ? PITCH_STATUS_LABEL[w.pitchStatus as keyof typeof PITCH_STATUS_LABEL]
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Field>
      ) : null}

      {moment.coveragePattern ? <Field label="Last time">{moment.coveragePattern}</Field> : null}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-xs">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function NoteList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border p-3">
      <h3 className="text-xs font-semibold">{title}</h3>
      <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
