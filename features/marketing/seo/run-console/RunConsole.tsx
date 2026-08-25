"use client";

/**
 * THE RUN CONSOLE — one component, three permission tiers.
 *
 * Arman's ruling, 2026-08-25 (KI-049, verbatim core): "Instead of running it
 * nightly, you create an admin dashboard for me where I can go, and I can
 * trigger it manually and indicate how many keywords per brand I want max and
 * put in my requirements, but then I want the UI to give me the results. So I
 * can look at those results, start poking holes… by building me that UI, you
 * have now essentially built a template that every organization can have…
 * they're going to see only the brands they control… the same UI that every
 * brand has with the difference that it only controls their brand. And in all
 * three of those UIs, which really should just be one UI, with slightly
 * different permissions… is where the schedule is set."
 *
 * So the tier is a PROP (`scope`), not a route fork and not a second component.
 * Only the system mount ships in v1; the organization and brand mounts are a
 * different value of the same prop.
 *
 * WHAT THIS FILE DOES NOT OWN, ON PURPOSE:
 *   • the coverage number — `seo.topic_placement_status`, the SAME read the
 *     topics screen renders (`../value-system/topics/data.ts`);
 *   • the keyword lists — the ONE keyword table, through the surfaces that
 *     already exist (`ProposedQueue`, `UnplacedQueue`). A hand-rolled row list
 *     here would be P26 broken twice in one screen;
 *   • the run — `useSeoCommandRun` straight to the deployed aidream command,
 *     no Next.js API route in between, streaming into the floating live-run
 *     window rather than a spinner.
 */

import { useEffect, useState , useRef} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  Gauge,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { fetchFeatureKnobValues } from "@/features/admin/limits/service";
import { formatCount } from "@/features/marketing/search-console/types";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";
import { getTopicPlacementStatus } from "@/features/marketing/seo/value-system/topics/data";
import type { TopicPlacementPassResult } from "@/features/marketing/seo/value-system/topics/types";
import { ProposedQueue } from "@/features/marketing/seo/value-system/topics/ProposedQueue";
import { UnplacedQueue } from "@/features/marketing/seo/value-system/topics/UnplacedQueue";
import { TOPIC_PLACEMENT_ENGINE, type ConsoleEngine } from "./engines";
import {
  listConsoleSites,
  listEngineSchedules,
  listRunPlacements,
} from "./data";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { ScheduleCascadePanel } from "./ScheduleCascadePanel";
import { extractErrorMessage } from "@/utils/errors";
import { useOpenKeywordWindow } from "@/features/overlays/openers/keywordWindow";
import type { ConsoleSiteRow, RunConsoleScope, RunOutcome } from "./types";

function pct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

function scopeHeadline(scope: RunConsoleScope): string {
  if (scope.tier === "system") return "Every brand on the platform";
  if (scope.tier === "organization") return "The brands this organization controls";
  return "This brand";
}

/**
 * One brand's row. It reads its OWN coverage through the shared status query
 * key, so the topics screen and this console are literally the same cache
 * entry — two surfaces, one truth.
 */
function BrandRow({
  site,
  minImpressions,
  selected,
  focused,
  running,
  onToggle,
  onFocus,
  onRunOne,
}: {
  site: ConsoleSiteRow;
  minImpressions: number;
  selected: boolean;
  focused: boolean;
  running: boolean;
  onToggle: (checked: boolean) => void;
  onFocus: () => void;
  onRunOne: () => void;
}) {
  const status = useQuery({
    queryKey: ["seo", "topics", "placement-status", site.id, minImpressions],
    queryFn: ({ signal }) =>
      getTopicPlacementStatus(site.id, minImpressions, signal),
    staleTime: 30 * 1000,
  });

  const row = status.data;
  const owed = row ? row.queue_pending - row.queue_deferred : null;
  const clicksPlaced = row
    ? pct(row.demand_clicks_placed, row.demand_clicks)
    : null;

  return (
    <tr
      className={cn(
        "cursor-pointer border-t border-border/60 hover:bg-accent/40",
        focused && "bg-accent",
      )}
      onClick={onFocus}
    >
      <td className="w-8 px-2 py-1" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={(checked) => onToggle(checked === true)}
          aria-label={`Select ${site.name}`}
        />
      </td>
      <td className="px-2 py-1">
        <div className="truncate text-xs font-medium text-foreground">
          {site.name}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {site.domain}
        </div>
      </td>
      <td className="px-2 py-1">
        {status.isLoading ? (
          <span className="text-[10px] text-muted-foreground">reading…</span>
        ) : status.isError ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-warning">
            <AlertTriangle className="h-3 w-3" /> unreadable
          </span>
        ) : row ? (
          <div className="min-w-[7rem]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                {(clicksPlaced ?? 0).toFixed(clicksPlaced! >= 10 ? 0 : 1)}%
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {formatCount(row.demand_clicks_placed)} /{" "}
                {formatCount(row.demand_clicks)}
              </span>
            </div>
            <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(clicksPlaced ?? 0, 100)}%` }}
              />
            </div>
          </div>
        ) : null}
      </td>
      <td className="px-2 py-1 text-right text-[11px] tabular-nums text-foreground">
        {owed == null ? "—" : owed > 0 ? formatCount(owed) : "0"}
      </td>
      <td className="px-2 py-1 text-right text-[11px] tabular-nums">
        {row && row.proposals_pending > 0 ? (
          <span className="inline-flex items-center gap-1 text-warning">
            <UserCheck className="h-3 w-3" />
            {formatCount(row.proposals_pending)}
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td className="px-2 py-1 text-right text-[11px] tabular-nums">
        {row && row.queue_failed > 0 ? (
          <span className="text-destructive" title={row.last_error ?? undefined}>
            {formatCount(row.queue_failed)}
          </span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </td>
      <td
        className="w-16 px-2 py-1 text-right"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px]"
          disabled={running}
          onClick={onRunOne}
          title={`Run ${TOPIC_PLACEMENT_ENGINE.label} on ${site.name}`}
        >
          <Play className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

export function RunConsole({
  scope,
  engine = TOPIC_PLACEMENT_ENGINE,
}: {
  scope: RunConsoleScope;
  engine?: ConsoleEngine;
}) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [focusedSiteId, setFocusedSiteId] = useState<string | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<RunOutcome[]>([]);
  const [cap, setCap] = useState<number | null>(null);

  const knobs = useQuery({
    queryKey: ["seo", "run-console", "knobs", engine.knobFeature],
    queryFn: () => fetchFeatureKnobValues(engine.knobFeature),
    staleTime: 5 * 60 * 1000,
  });
  // Missing knob = missing row, never a frozen default: an admin turning the
  // knob has to change what this console does.
  const minImpressions = Number(knobs.data?.min_impressions ?? 0);
  const capCeiling = Number(knobs.data?.[engine.capKnobKey] ?? 0);
  const dailyCeiling = Number(knobs.data?.daily_keyword_ceiling ?? 0);
  const effectiveCap = Math.min(Math.max(cap ?? capCeiling, 1), capCeiling || 1);

  const sites = useQuery({
    queryKey: ["seo", "run-console", "sites", scope],
    queryFn: () => listConsoleSites(scope),
    staleTime: 60 * 1000,
  });

  const schedules = useQuery({
    queryKey: ["seo", "run-console", "schedules", engine.slug],
    queryFn: () => listEngineSchedules(engine.slug),
    staleTime: 60 * 1000,
  });

  // THE CONSOLE'S ORG (Arman's ruling, 2026-08-24): work done from the admin
  // panel travels under the Matrx System organization, EXPLICITLY — never the
  // operator's header org, and never a transport-invented one. The org tier
  // declares its own; the site tier (unmounted in v1) rides the operator's
  // selected org like any normal surface. This rides launch AND rejoin, so a
  // refreshed page can pick its run back up without a selected org.
  // Engine writes stay scoped by the SITE the pass runs over — the request
  // org is context, never row ownership (no-db-assigned-org law).
  const requestOrganizationId =
    scope.tier === "system"
      ? SYSTEM_ORGANIZATION_ID
      : scope.tier === "organization"
        ? scope.organizationId
        : undefined;

  const pass = useSeoCommandRun<TopicPlacementPassResult>({
    key: "run-console-topic-placement",
    path: engine.path,
    finalKind: engine.finalKind,
    stageLabels: engine.stageLabels,
    live: { label: engine.liveLabel },
    ...(requestOrganizationId
      ? { scopeOverrides: { organization_id: requestOrganizationId } }
      : {}),
  });

  // Stamped at launch so the decisions read asks for THIS pass's window.
  const runStartedAtRef = useRef<string>(new Date().toISOString());

  const siteRows = sites.data ?? [];
  const siteById = new Map(siteRows.map((site) => [site.id, site]));
  const visible = siteRows.filter((site) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    return (
      site.name.toLowerCase().includes(needle) ||
      site.domain.toLowerCase().includes(needle)
    );
  });

  /**
   * The run settles on the HANDLE, not on `launch()` — a durable run can also
   * arrive by rejoin after a refresh, and `launch` resolves the moment the
   * stream is handed over. Recording the outcome here is what makes the log
   * survive a reload of this page.
   */
  useEffect(() => {
    const result = pass.result;
    if (!result) return;
    const site = siteById.get(result.site_id);
    setOutcomes((current) =>
      current.some(
        (entry) => entry.siteId === result.site_id && entry.claimed === result.claimed,
      )
        ? current
        : [
            {
              siteId: result.site_id,
              siteName: site?.name ?? result.site_id,
              finishedAt: new Date().toISOString(),
              startedAt: runStartedAtRef.current,
              confidenceFloor: result.confidence_floor ?? 90,
              claimed: result.claimed,
              placed: result.placed,
              proposed: result.proposed,
              humanProtected: result.human_protected,
              quarantined: result.quarantined,
              returnedToQueue: result.returned_to_queue,
              placedToday: result.placed_today,
              dailyCeiling: result.daily_ceiling,
              ceilingReached: result.ceiling_reached,
              topicsCreated: result.topics_created ?? [],
              topPhrases: result.top_phrases ?? [],
              error: result.error,
            },
            ...current,
          ],
    );
    if (result.error) toast.error(result.error);
    setFocusedSiteId(result.site_id);
    void queryClient.invalidateQueries({ queryKey: ["seo", "topics"] });
    void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settle once per result
  }, [pass.result]);

  /** Drain the queue one brand at a time — the engine is a paid pass, not a fan-out. */
  useEffect(() => {
    if (pass.running || queue.length === 0) return;
    const [next, ...rest] = queue;
    const site = siteById.get(next);
    if (!site) {
      setQueue(rest);
      return;
    }
    setQueue(rest);
    pass.reset();
    runStartedAtRef.current = new Date().toISOString();
    void pass.launch(
      { site_id: site.id, refresh: true, limit: effectiveCap },
      site.name,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- driven by queue + running
  }, [queue, pass.running]);

  const startRun = (siteIds: string[]) => {
    if (siteIds.length === 0) return;
    setOutcomes([]);
    setQueue(siteIds);
    toast.success(
      `Running ${engine.label.toLowerCase()} on ${siteIds.length} brand${siteIds.length === 1 ? "" : "s"}`,
      {
        description: `Up to ${effectiveCap} keywords each, highest demand first. Watch it think in the live run window.`,
      },
    );
  };

  const focused = focusedSiteId ? siteById.get(focusedSiteId) : undefined;
  const running = pass.running || queue.length > 0;
  const knobsBroken = knobs.isSuccess && capCeiling === 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 bg-textured p-2">
      {/* ── Control bar ──────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5">
        <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold leading-tight text-foreground">
            Run console — {engine.label}
          </h1>
          <p className="truncate text-[10px] text-muted-foreground">
            {engine.what}
          </p>
        </div>

        <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" />
          {scopeHeadline(scope)}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            <Gauge className="h-3 w-3" />
            floor {minImpressions} impressions · ceiling{" "}
            {formatCount(dailyCeiling)}/day
            <Link
              href="/administration/users/limits"
              className="ml-1 text-primary underline-offset-2 hover:underline"
            >
              knobs
            </Link>
          </span>

          <div className="flex items-center gap-1.5">
            <Label
              htmlFor="run-cap"
              className="text-[10px] text-muted-foreground"
            >
              Max keywords per brand
            </Label>
            <Input
              id="run-cap"
              type="number"
              min={1}
              max={capCeiling || undefined}
              value={cap ?? (capCeiling || "")}
              onChange={(event) => setCap(Number(event.target.value))}
              className="h-7 w-20 text-xs tabular-nums"
              disabled={knobsBroken}
            />
          </div>

          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={running || selected.length === 0 || knobsBroken}
            onClick={() => startRun(selected)}
          >
            {running ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Play className="h-3 w-3" />
            )}
            {running
              ? queue.length > 0
                ? `Running… ${queue.length} queued`
                : "Running…"
              : `Run now (${selected.length})`}
          </Button>
        </div>
      </header>

      {knobsBroken ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          The <code>{engine.knobFeature}</code> knob{" "}
          <code>{engine.capKnobKey}</code> has no row, so this console cannot
          know its own ceiling and refuses to guess one. Add it in Limits &amp;
          Knobs before running anything.
        </p>
      ) : null}
      {pass.stage && running ? (
        <p className="rounded-md border border-primary/40 bg-accent/40 px-2.5 py-1 text-[11px] text-foreground">
          {pass.stage}
        </p>
      ) : null}
      {pass.error ? (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive">
          {pass.error}
        </p>
      ) : null}

      {/* ── Body: brands on the left, everything you poke holes in on the right ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-12">
        {/* LEFT — what you pick FROM. The brand list and the schedule both
            answer "which brands", so they live together here; the right side
            is always the SELECTED brand's data. Mixing a global schedule into
            brand-keyed tabs is what made the tab strip lie. */}
        <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card lg:col-span-5">
          <Tabs
            defaultValue="brands"
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="h-8 shrink-0 justify-start rounded-none border-b border-border bg-transparent px-1">
              <TabsTrigger value="brands" className="h-6 text-xs">
                Brands
              </TabsTrigger>
              <TabsTrigger value="schedule" className="h-6 text-xs">
                Schedule
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="schedule"
              className="m-0 flex min-h-0 flex-1 flex-col"
            >
              <ScheduleCascadePanel
                engine={engine}
                scope={scope}
                sites={siteRows}
                schedules={schedules.data ?? []}
                capCeiling={capCeiling || 1}
              />
            </TabsContent>

            <TabsContent
              value="brands"
              className="m-0 flex min-h-0 flex-1 flex-col"
            >
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a brand"
              className="h-7 flex-1 text-xs"
              aria-label="Find a brand"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px]"
              onClick={() =>
                setSelected(
                  selected.length === visible.length
                    ? []
                    : visible.map((site) => site.id),
                )
              }
            >
              {selected.length === visible.length && visible.length > 0
                ? "None"
                : "All"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-1.5"
              title="Re-read coverage"
              onClick={() =>
                void queryClient.invalidateQueries({
                  queryKey: ["seo", "topics", "placement-status"],
                })
              }
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {sites.isLoading ? (
              <p className="p-3 text-xs text-muted-foreground">
                Reading the brands you control…
              </p>
            ) : sites.isError ? (
              <p className="p-3 text-xs text-destructive">
                Could not read the brand list.
              </p>
            ) : visible.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                No brand matches “{search}”.
              </p>
            ) : (
              <table className="w-full table-fixed text-left">
                <thead className="sticky top-0 z-10 bg-muted/70 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-1" />
                    <th className="px-2 py-1 font-medium">Brand</th>
                    <th className="w-32 px-2 py-1 font-medium">Clicks placed</th>
                    <th className="w-16 px-2 py-1 text-right font-medium">
                      Owed
                    </th>
                    <th className="w-16 px-2 py-1 text-right font-medium">
                      Proposals
                    </th>
                    <th className="w-16 px-2 py-1 text-right font-medium">
                      Failed
                    </th>
                    <th className="w-16 px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((site) => (
                    <BrandRow
                      key={site.id}
                      site={site}
                      minImpressions={minImpressions}
                      selected={selected.includes(site.id)}
                      focused={focusedSiteId === site.id}
                      running={running}
                      onToggle={(checked) =>
                        setSelected((current) =>
                          checked
                            ? [...current, site.id]
                            : current.filter((id) => id !== site.id),
                        )
                      }
                      onFocus={() => setFocusedSiteId(site.id)}
                      onRunOne={() => startRun([site.id])}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
            </TabsContent>
          </Tabs>
        </section>

        <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card lg:col-span-7">
          <Tabs defaultValue="run" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="h-8 shrink-0 justify-start rounded-none border-b border-border bg-transparent px-1">
              <TabsTrigger value="run" className="h-6 text-xs">
                This run
              </TabsTrigger>
              <TabsTrigger value="proposals" className="h-6 text-xs">
                Proposals
              </TabsTrigger>
              <TabsTrigger value="unplaced" className="h-6 text-xs">
                Not placed
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="run"
              className="m-0 min-h-0 flex-1 overflow-y-auto p-2"
            >
              {outcomes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Pick one or more brands on the left, set the cap, and press Run
                  now. Every pass reports what it claimed, what it placed, what
                  it is not sure about, and what it refused to touch — right
                  here.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {outcomes.map((outcome) => (
                    <li
                      key={`${outcome.siteId}-${outcome.finishedAt}`}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5",
                        outcome.error
                          ? "border-destructive/50 bg-destructive/10"
                          : "border-border bg-muted/30",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {outcome.error ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-primary" />
                        )}
                        <button
                          type="button"
                          className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                          onClick={() => setFocusedSiteId(outcome.siteId)}
                        >
                          {outcome.siteName}
                        </button>
                        {outcome.claimed === 0 && !outcome.error ? (
                          // A zero-claim pass is a real answer, not a failure —
                          // say what it means or the run reads as a dead click
                          // (the "blank window on Blanca" incident, 2026-08-24).
                          <span className="text-[11px] text-muted-foreground">
                            nothing to place — this brand has no unplaced
                            keywords with Search Console demand yet
                          </span>
                        ) : (
                          <span className="text-[11px] tabular-nums text-muted-foreground">
                            placed {formatCount(outcome.placed)} of{" "}
                            {formatCount(outcome.claimed)} claimed
                          </span>
                        )}
                        {outcome.proposed > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded border border-warning/50 bg-warning/10 px-1 py-px text-[10px] tabular-nums text-warning">
                            <UserCheck className="h-3 w-3" />
                            {formatCount(outcome.proposed)} need confirming
                          </span>
                        ) : null}
                        {outcome.humanProtected > 0 ? (
                          <span className="rounded border border-border px-1 py-px text-[10px] tabular-nums text-muted-foreground">
                            {formatCount(outcome.humanProtected)} left alone
                            (yours)
                          </span>
                        ) : null}
                        {outcome.quarantined > 0 ? (
                          <span className="rounded border border-destructive/40 px-1 py-px text-[10px] tabular-nums text-destructive">
                            {formatCount(outcome.quarantined)} quarantined
                          </span>
                        ) : null}
                        {outcome.ceilingReached ? (
                          <span className="rounded border border-warning/50 px-1 py-px text-[10px] tabular-nums text-warning">
                            daily ceiling — {formatCount(outcome.placedToday)} /{" "}
                            {formatCount(outcome.dailyCeiling)}
                          </span>
                        ) : null}
                      </div>
                      {outcome.topPhrases.length > 0 ? (
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {outcome.topPhrases.slice(0, 6).join(" · ")}
                        </p>
                      ) : null}
                      {outcome.topicsCreated.length > 0 ? (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Created{" "}
                          <span className="text-foreground">
                            {outcome.topicsCreated.join(", ")}
                          </span>
                        </p>
                      ) : null}
                      {outcome.error ? (
                        <p className="mt-0.5 text-[10px] text-destructive">
                          {outcome.error}
                        </p>
                      ) : null}
                      {/* The counts are the headline; THIS is the run. Nothing
                          the machine decided stays hidden behind a total. */}
                      {outcome.claimed > 0 ? (
                        <div className="mt-1.5 rounded border border-border/70 bg-background/40 p-1">
                          <RunDecisions
                            siteId={outcome.siteId}
                            siteName={outcome.siteName}
                            brandId={siteById.get(outcome.siteId)?.brand_id ?? undefined}
                            since={outcome.startedAt}
                            confidenceFloor={outcome.confidenceFloor}
                          />
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent
              value="proposals"
              className="m-0 flex min-h-0 flex-1 flex-col p-2"
            >
              {focused ? (
                <ProposedQueue
                  siteId={focused.id}
                  siteDomain={focused.domain}
                  brandId={focused.brand_id ?? ""}
                  onChanged={() =>
                    void queryClient.invalidateQueries({
                      queryKey: ["seo", "topics"],
                    })
                  }
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Click a brand on the left to read what the assigner placed but
                  is not sure about.
                </p>
              )}
            </TabsContent>

            <TabsContent
              value="unplaced"
              className="m-0 flex min-h-0 flex-1 flex-col p-2"
            >
              {focused ? (
                <UnplacedQueue
                  siteId={focused.id}
                  siteDomain={focused.domain}
                  brandId={focused.brand_id ?? ""}
                  onChanged={() =>
                    void queryClient.invalidateQueries({
                      queryKey: ["seo", "topics"],
                    })
                  }
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Click a brand on the left to read what is still owed.
                </p>
              )}
            </TabsContent>

          </Tabs>
        </section>
      </div>
    </div>
  );
}


/**
 * WHAT THE AI ACTUALLY DID — the point of an admin console.
 *
 * One row per keyword the assigner touched: the phrase, the Offering it chose,
 * everything else it considered, and its own confidence. Read from the durable
 * placement rows, so this survives a reload and can be studied later — the
 * stream scrolls away, the record does not.
 */
function RunDecisions({
  siteId,
  siteName,
  brandId,
  since,
  confidenceFloor,
}: {
  siteId: string;
  siteName: string;
  brandId: string | undefined;
  since: string;
  confidenceFloor: number;
}) {
  const openKeywordWindow = useOpenKeywordWindow();
  const decisions = useQuery({
    queryKey: ["seo", "run-console", "decisions", siteId, since],
    queryFn: ({ signal }) =>
      listRunPlacements(siteId, since, confidenceFloor, signal),
    staleTime: 10 * 1000,
  });

  if (decisions.isPending)
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        Reading what the assigner decided…
      </p>
    );
  if (decisions.isError)
    return (
      <p className="px-1 py-2 text-xs text-destructive">
        {extractErrorMessage(decisions.error)}
      </p>
    );

  const rows = decisions.data ?? [];
  if (rows.length === 0)
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        This pass changed no placements on {siteName}.
      </p>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[11px]">
        <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-1.5 py-1 font-medium">Keyword</th>
            <th className="px-1.5 py-1 font-medium">Offering it chose</th>
            <th className="px-1.5 py-1 font-medium">Also considered</th>
            <th className="w-20 px-1.5 py-1 text-right font-medium">Sure</th>
            <th className="w-24 px-1.5 py-1 font-medium">Decided by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.keywordId} className="border-t border-border/60">
              <td className="max-w-[16rem] truncate px-1.5 py-1">
                {/* NO DEAD ENDS: every keyword named here opens. */}
                <button
                  type="button"
                  className="truncate text-left text-foreground underline-offset-2 hover:underline"
                  onClick={() =>
                    openKeywordWindow({
                      phrase: row.phrase,
                      siteId,
                      ...(brandId ? { brandId } : {}),
                    })
                  }
                >
                  {row.phrase}
                </button>
              </td>
              <td className="max-w-[14rem] truncate px-1.5 py-1 text-foreground">
                {row.offering}
                {row.proposal ? (
                  <span className="ml-1 rounded border border-warning/50 bg-warning/10 px-1 py-px text-[9px] text-warning">
                    proposal
                  </span>
                ) : null}
              </td>
              <td className="max-w-[12rem] truncate px-1.5 py-1 text-muted-foreground">
                {row.secondary.length > 0 ? row.secondary.join(" · ") : "—"}
              </td>
              <td className="px-1.5 py-1 text-right tabular-nums text-muted-foreground">
                {row.confidence === null ? "—" : `${row.confidence}%`}
              </td>
              <td className="px-1.5 py-1 text-muted-foreground">
                {row.decidedBy}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
