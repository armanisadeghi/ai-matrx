"use client";

// features/hr/people/org-chart/HrOrgChart.tsx
//
// ROUTE 11 — `/hr/people/org-chart`. Paired with the directory as a route tab.
//
// THE FIVE RULES THIS SURFACE IS JUDGED ON (SPEC-EMPLOYEES §5.2):
//
//  1. NOBODY IS SILENTLY DROPPED. `unplaced[]` renders in an explicit "Not yet
//     placed" tray. A person with no manager on the as-of date is a fact about
//     the org, not a rendering problem to hide.
//  2. A CYCLE RENDERS A BADGE AND A DOOR TO FIX IT — never an infinite layout.
//     The badge comes from the server's `cycles[]`; the termination guarantee is
//     in `layout.ts`.
//  3. NO-MANAGER-DATA IS AN EXPLICIT SCREEN with a door to bulk manager
//     assignment — never an empty canvas that looks broken.
//  4. THE AS-OF CHIP IS PERSISTENT AND TRAVELS. It stays on screen, it goes into
//     the export filename and the export header, and changing it RE-FETCHES
//     WITHOUT RE-LAYING-OUT FROM SCRATCH — persisting nodes keep their slot, so
//     a reorg reads as a reorg.
//  5. THE HISTORY CONTROL IS ABSENT WHEN `history_available` IS FALSE. Not
//     disabled. An employee who may not see history does not learn that history
//     exists from a greyed date picker.
//
// The NL query box is specified to return A HIGHLIGHTED SET OF NODES ON THIS
// CHART, never a chat reply. The mandate `hr.employees.org_chart_query` is not
// registered, so the box renders honestly disabled with a registered promise
// behind it rather than pretending to work or silently vanishing.

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  BrainCircuit,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Download,
  Minus,
  Plus,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { HrPageState } from "../../shared/HrStates";
import { useHrContext } from "../../shared/useHrContext";
import { useHrPersona } from "../../shared/useHrPersona";
import { useHrRequest } from "../shared/useHrRequest";
import { fetchHrOrgChart } from "../../service";
import { hrEmployeeHref, hrOrgChartHref, hrPeopleHref } from "../../routes";
import type { HrDenied, HrFailed, HrOrgChart as HrOrgChartData } from "../../types";
import { formatFullDate } from "../shared/HrStatusChip";
import { HrWorkerClassChip } from "../shared/HrWorkerClassChip";
import { downloadOrgChartCsv, orgChartExportName } from "./orgChartExport";
import {
  LEVEL_GAP_Y,
  NODE_HEIGHT,
  NODE_WIDTH,
  ancestorsOf,
  layoutOrgChart,
  type OrgLayout,
} from "./layout";

// ── The fetch ───────────────────────────────────────────────────────────────

type ChartRequest = { organizationId: string; on: string | null };

/** Module-level, so the read hook's dependency array holds a stable reference. */
function runChart(args: ChartRequest) {
  return fetchHrOrgChart(args);
}

function useOrgChart(organizationId: string | null, on: string | null) {
  const request =
    organizationId === null
      ? null
      : JSON.stringify({ organizationId, on } satisfies ChartRequest);

  const state = useHrRequest<ChartRequest, HrOrgChartData>(request, runChart);

  return {
    data: state.data,
    isLoading: state.isLoading,
    isFetching: state.isFetching,
    error: (state.denied ?? state.error) as HrDenied | HrFailed | null,
    refresh: state.refresh,
  };
}

// ── Quick chips for the as-of date ──────────────────────────────────────────

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function quickAsOfChips(): { label: string; value: string }[] {
  const now = new Date();
  const janFirst = new Date(now.getFullYear(), 0, 1);
  // Last quarter end = the last day of the most recently COMPLETED quarter.
  const quarter = Math.floor(now.getMonth() / 3);
  const lastQuarterEnd = new Date(now.getFullYear(), quarter * 3, 0);
  return [
    { label: "Today", value: isoDay(now) },
    { label: `1 Jan ${now.getFullYear()}`, value: isoDay(janFirst) },
    { label: "Last quarter end", value: isoDay(lastQuarterEnd) },
  ];
}

// ── The surface ─────────────────────────────────────────────────────────────

export function HrOrgChart() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { active, orgRef } = useHrContext();
  const { can } = useHrPersona();
  const organizationId = active?.organization_id ?? null;

  const asOfParam = searchParams?.get("as_of") ?? null;
  const focusParam = searchParams?.get("focus") ?? null;

  const chart = useOrgChart(organizationId, asOfParam);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showDotted, setShowDotted] = useState(false);
  const [zoom, setZoom] = useState(1);
  // The NL query's answer, when the mandate is wired: a highlighted set of
  // nodes ON THIS CHART, never a chat reply. Held here so the chart owns it.
  const [highlighted] = useState<Set<string>>(new Set());

  const data = chart.data;
  const nodes = data?.nodes ?? [];
  const managerOf = new Map(
    nodes.map((node) => [node.employment_id, node.manager_employment_id]),
  );
  const employmentToEmployee = new Map(
    nodes.map((node) => [node.employment_id, node.employee_id]),
  );
  const focusEmployment = focusParam
    ? (nodes.find((node) => node.employee_id === focusParam)?.employment_id ?? null)
    : null;

  // Focus expands ancestry: a focused node inside a collapsed branch is a node
  // the user cannot see, which is the opposite of focusing it.
  const effectiveCollapsed = new Set(collapsed);
  if (focusEmployment) {
    for (const ancestor of ancestorsOf(focusEmployment, managerOf)) {
      effectiveCollapsed.delete(ancestor);
    }
  }

  // 🚨 THE LAYOUT IS PURE, AND THAT IS WHAT KEEPS NODES IN PLACE ACROSS AN
  // AS-OF CHANGE. Sibling order is a function of the people (their names), not
  // of what was on screen a moment ago — so anyone under the same manager on
  // both dates occupies the same slot on both, and the only thing that moves is
  // the thing that actually changed. See `layout.ts` rule 2 for why the
  // remember-last-render alternative was rejected.
  const layout: OrgLayout = layoutOrgChart({
    nodes: nodes.map((node) => ({
      id: node.employment_id,
      managerId: node.manager_employment_id,
      sortKey: node.display_name,
    })),
    collapsed: effectiveCollapsed,
    dottedLines: showDotted
      ? (data?.dotted_lines ?? []).map((line) => ({
          from: line.manager_employment_id,
          to: line.employment_id,
        }))
      : [],
  });

  const cycleEmployments = new Set(data?.cycles ?? []);
  const setAsOf = (value: string | null) => {
    router.push(hrOrgChartHref({ org: orgRef, focus: focusParam, asOf: value }));
  };

  const historyAvailable = data?.history_available ?? false;
  const asOf = data?.as_of ?? null;
  const isHistorical = Boolean(asOf && data?.requested_on && asOf !== data.requested_on);

  return (
    <HrPageState
      loading={chart.isLoading}
      error={chart.error?.kind === "failed" ? chart.error : null}
      granted={chart.error?.kind !== "denied"}
      operation="The org chart"
      variant="panel"
      noAccessSentence="The org chart isn't yours here."
      onRetry={chart.refresh}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Controls ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
          {/* 🚨 ABSENT when history is not available for this viewer. */}
          {historyAvailable ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <CalendarClock
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="date"
                aria-label="Show the chart as it was on this date"
                value={asOfParam ?? asOf ?? ""}
                min={data?.earliest_known_on ?? undefined}
                onChange={(event) => setAsOf(event.target.value || null)}
                className="h-9 w-[10.5rem]"
              />
              {quickAsOfChips().map((chip) => (
                <Button
                  key={chip.label}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-11 text-xs sm:min-h-8"
                  onClick={() => setAsOf(chip.value)}
                >
                  {chip.label}
                </Button>
              ))}
            </div>
          ) : null}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Switch
                id="hr-dotted-lines"
                checked={showDotted}
                onCheckedChange={setShowDotted}
                aria-label="Show dotted-line reporting"
              />
              <Label
                htmlFor="hr-dotted-lines"
                className="text-xs text-muted-foreground"
              >
                Dotted lines
              </Label>
            </div>

            <div className="inline-flex items-center rounded-md border border-border">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Zoom out"
                className="h-11 w-11 sm:h-8 sm:w-8"
                onClick={() => setZoom((z) => Math.max(0.4, z - 0.15))}
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </Button>
              <span className="w-11 text-center text-xs text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Zoom in"
                className="h-11 w-11 sm:h-8 sm:w-8"
                onClick={() => setZoom((z) => Math.min(1.6, z + 0.15))}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11 sm:min-h-8"
              onClick={() =>
                setCollapsed(
                  collapsed.size > 0
                    ? new Set()
                    : new Set(
                        layout.nodes
                          .filter((node) => node.depth >= 1 && node.hasChildren)
                          .map((node) => node.id),
                      ),
                )
              }
            >
              {collapsed.size > 0 ? "Expand all" : "Collapse to top two levels"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 sm:min-h-8"
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    if (!data) return;
                    downloadOrgChartCsv(data);
                    toast.success(
                      `Exported ${orgChartExportName(data.as_of, "csv")}`,
                    );
                  }}
                >
                  CSV — the chart&apos;s rows, with the as-of date
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void announceComingSoon("hr.people.chart-image-export")
                  }
                >
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void announceComingSoon("hr.people.chart-image-export")
                  }
                >
                  PNG
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── The persistent as-of chip. It travels into every export. ───── */}
        {asOf ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 sm:px-4">
            <Badge
              variant={isHistorical ? "default" : "secondary"}
              className="shrink-0"
            >
              As of {formatFullDate(asOf)}
            </Badge>
            {isHistorical ? (
              <span className="text-xs text-muted-foreground">
                This is the chart as it was on that date, not today&apos;s.
              </span>
            ) : null}
            {data?.earliest_known_on && isHistorical ? (
              <span className="text-xs text-muted-foreground">
                Earliest date we hold: {formatFullDate(data.earliest_known_on)}.
              </span>
            ) : null}
            {chart.isFetching ? (
              <span className="text-xs text-muted-foreground">Updating…</span>
            ) : null}
          </div>
        ) : null}

        {/* ── The natural-language query box ────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
          <BrainCircuit className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            disabled
            placeholder="Ask this chart a question — “who reports to Dana two levels down”"
            aria-label="Ask the org chart a question"
            className="h-9 max-w-md"
          />
          <button
            type="button"
            onClick={() => void announceComingSoon("hr.people.org-chart-query")}
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Why is this off?
          </button>
        </div>

        {/* ── The canvas, or the honest screen that replaces it ─────────── */}
        {nodes.length === 0 ? (
          <NoManagerData org={orgRef} canFix={can("identity.write")} />
        ) : focusEmployment === null && focusParam ? (
          <NotEmployedOnDate
            asOf={asOf}
            employeeId={focusParam}
            org={orgRef}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div
              style={{
                width: layout.width * zoom,
                height: (layout.height + NODE_HEIGHT) * zoom,
              }}
            >
              <div
                className="relative origin-top-left"
                style={{
                  width: layout.width,
                  height: layout.height + NODE_HEIGHT,
                  transform: `scale(${zoom})`,
                }}
              >
                <ChartEdges layout={layout} />
                {layout.nodes.map((placed) => {
                  const node = nodes.find(
                    (n) => n.employment_id === placed.id,
                  );
                  if (!node) return null;
                  const employeeId = employmentToEmployee.get(placed.id) ?? "";
                  return (
                    <ChartNode
                      key={placed.id}
                      x={placed.x}
                      y={placed.y}
                      focused={placed.id === focusEmployment}
                      highlighted={highlighted.has(placed.id)}
                      inCycle={cycleEmployments.has(placed.id)}
                      collapsed={placed.collapsed}
                      childCount={placed.childCount}
                      onToggle={() =>
                        setCollapsed((current) => {
                          const next = new Set(current);
                          if (next.has(placed.id)) next.delete(placed.id);
                          else next.add(placed.id);
                          return next;
                        })
                      }
                      name={node.display_name}
                      jobTitle={node.job_title}
                      department={node.department}
                      workerClass={node.worker_class}
                      href={hrEmployeeHref(employeeId, null, { org: orgRef })}
                      reportsHref={hrPeopleHref({
                        org: orgRef,
                        managerEmployeeId: employeeId,
                      })}
                      canFixCycle={can("identity.write")}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Nobody is silently dropped ─────────────────────────────────── */}
        <UnplacedTray
          unplaced={data?.unplaced ?? []}
          org={orgRef}
          employmentToEmployee={employmentToEmployee}
        />
      </div>
    </HrPageState>
  );
}

// ── Canvas pieces ───────────────────────────────────────────────────────────

function ChartEdges({ layout }: { layout: OrgLayout }) {
  const byId = new Map(layout.nodes.map((node) => [node.id, node]));
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={layout.width}
      height={layout.height + NODE_HEIGHT}
      aria-hidden
    >
      {layout.edges.map((edge) => {
        const from = byId.get(edge.from);
        const to = byId.get(edge.to);
        if (!from || !to) return null;
        const x1 = from.x + NODE_WIDTH / 2;
        const y1 = from.y + NODE_HEIGHT;
        const x2 = to.x + NODE_WIDTH / 2;
        const y2 = to.y;
        const midY = y1 + (LEVEL_GAP_Y - NODE_HEIGHT) / 2;
        return (
          <path
            key={`${edge.from}->${edge.to}${edge.dotted ? "-dotted" : ""}`}
            d={`M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={1.5}
            strokeDasharray={edge.dotted ? "4 3" : undefined}
          />
        );
      })}
    </svg>
  );
}

function ChartNode(props: {
  x: number;
  y: number;
  focused: boolean;
  highlighted: boolean;
  inCycle: boolean;
  collapsed: boolean;
  childCount: number;
  onToggle: () => void;
  name: string;
  jobTitle: string | null;
  department: string | null;
  workerClass: string | null;
  href: string;
  reportsHref: string;
  canFixCycle: boolean;
}) {
  return (
    <div
      className={cn(
        // The transition is what makes an as-of change LEGIBLE AS A CHANGE:
        // a person who moved slides to their new place instead of the whole
        // chart blinking into a different arrangement.
        "absolute flex flex-col justify-center rounded-lg border bg-card px-2.5 py-1.5 transition-[left,top] duration-300",
        props.focused
          ? "border-primary ring-2 ring-primary/30"
          : props.highlighted
            ? "border-primary/60"
            : "border-border",
      )}
      style={{
        left: props.x,
        top: props.y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        <Link
          href={props.href}
          className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline"
        >
          {props.name}
        </Link>
        <HrWorkerClassChip workerClass={props.workerClass} />
      </div>
      <div className="truncate text-[0.6875rem] text-muted-foreground">
        {[props.jobTitle, props.department].filter(Boolean).join(" · ")}
      </div>

      <div className="flex items-center gap-1">
        {props.childCount > 0 ? (
          <>
            <button
              type="button"
              onClick={props.onToggle}
              aria-label={
                props.collapsed
                  ? `Expand ${props.name}'s team`
                  : `Collapse ${props.name}'s team`
              }
              className="inline-flex items-center gap-0.5 rounded-sm text-[0.6875rem] text-muted-foreground hover:text-foreground"
            >
              {props.collapsed ? (
                <ChevronRight className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronDown className="h-3 w-3" aria-hidden />
              )}
            </button>
            {/* A COUNT IS A DOOR. */}
            <Link
              href={props.reportsHref}
              className="text-[0.6875rem] text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
            >
              {props.childCount} {props.childCount === 1 ? "report" : "reports"}
            </Link>
          </>
        ) : null}

        {/* 🚨 A CYCLE IS SHOWN AND HAS A DOOR, never an infinite layout. */}
        {props.inCycle ? (
          <button
            type="button"
            onClick={() =>
              void announceComingSoon("hr.people.bulk-manager-assignment")
            }
            className="ml-auto inline-flex items-center gap-1 rounded-sm text-[0.6875rem] text-warning underline-offset-2 hover:underline"
            title="This person's reporting line loops back on itself."
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            Loop
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * `unplaced[]` — employments with no primary assignment or no manager on the
 * as-of date. An explicit tray, always, because a chart that quietly omits
 * people is a chart that gets believed.
 */
function UnplacedTray({
  unplaced,
  org,
  employmentToEmployee,
}: {
  unplaced: { employment_id: string; employee_id: string; display_name: string; reason: string }[];
  org: string | null;
  employmentToEmployee: Map<string, string>;
}) {
  if (unplaced.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border bg-muted/20 px-3 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-foreground">
          Not yet placed ({unplaced.length})
        </span>
        <span className="text-xs text-muted-foreground">
          These people are employed here but have no reporting line on this date.
        </span>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {unplaced.map((person) => (
          <li key={person.employment_id}>
            <Link
              href={hrEmployeeHref(
                person.employee_id ||
                  employmentToEmployee.get(person.employment_id) ||
                  "",
                "job",
                { org },
              )}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground hover:bg-accent"
              title={person.reason}
            >
              {person.display_name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Never an empty canvas. */
function NoManagerData({ org, canFix }: { org: string | null; canFix: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-4 sm:p-6">
        <Users className="h-5 w-5 text-muted-foreground" aria-hidden />
        <h2 className="mt-2 text-sm font-semibold text-foreground">
          No managers assigned yet
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The chart draws itself from who reports to whom. Once people have
          managers, this fills in — nothing here has to be drawn by hand.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
            <Link href={hrPeopleHref({ org })}>Open the directory</Link>
          </Button>
          {canFix ? (
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-9"
              onClick={() =>
                void announceComingSoon("hr.people.bulk-manager-assignment")
              }
            >
              Assign managers
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A focused node whose employment did not exist on the as-of date. It says so,
 * and it opens their actual spell dates — never an empty canvas and never a
 * silent drop of the thing the URL asked for.
 */
function NotEmployedOnDate({
  asOf,
  employeeId,
  org,
}: {
  asOf: string | null;
  employeeId: string;
  org: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-4 sm:p-6">
        <h2 className="text-sm font-semibold text-foreground">
          Not employed on {asOf ? formatFullDate(asOf) : "that date"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The person you focused wasn&apos;t on the chart on this date. Their
          employment dates are on their Job &amp; reporting tab.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" className="min-h-11 sm:min-h-9">
            <Link href={hrEmployeeHref(employeeId, "job", { org })}>
              See their employment dates
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="min-h-11 sm:min-h-9">
            <Link href={hrOrgChartHref({ org, focus: employeeId })}>
              Show today&apos;s chart
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
