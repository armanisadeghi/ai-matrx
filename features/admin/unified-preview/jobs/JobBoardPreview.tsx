"use client";

/**
 * THE JOB BOARD — the unified-management preview (ruling R13).
 *
 * ONE board, four altitudes. Mandates, surface bindings and shortcuts are the
 * same record here, because in THE MODEL they are: a named job with a goal, an
 * output kind and an input contract, met by a place either by REFERENCE or by
 * DISCOVERY.
 *
 * Non-functional by design. No database, no server, no writes. What is real is
 * the STRUCTURE and the house components — `MatrxDataTable` for the board and
 * its drawer, `MandateResolutionRibbon` for precedence, the surfaces readiness
 * rollup's tile grammar for the scoreboard.
 */

import { useMemo, useState } from "react";
import { Building2, Globe, LayoutGrid, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { cn } from "@/lib/utils";
import { CoverageScoreboard } from "./CoverageScoreboard";
import { JobWorkbench } from "./JobWorkbench";
import {
  coverageCounts,
  jobsAtScope,
  PREVIEW_DOMAIN,
  PREVIEW_ORG_NAME,
  type CoverageState,
  type JobAtAltitude,
  type PreviewJob,
  type PrincipalScope,
} from "./mock-data";
import { CoverageBadge, HolderChip, previewToast } from "./preview-ui";

interface BoardRow extends PreviewJob {
  at: JobAtAltitude;
  coverage: CoverageState;
  holderName: string;
  discoveryLabel: string;
  originLabel: string;
}

const SCOPE_OPTIONS = [
  { value: "system", label: "System", icon: Globe },
  { value: "organization", label: `Org — ${PREVIEW_ORG_NAME}`, icon: Building2 },
  { value: "user", label: "User", icon: User },
] as const;

const SCOPE_BLURB: Record<PrincipalScope, string> = {
  system:
    "Every job the platform declares. The system's own screams — these are ours to answer.",
  organization: `Every job ${PREVIEW_ORG_NAME} can decide, with ${PREVIEW_ORG_NAME}'s own coverage. An org override wins over the system default and loses to the member's own.`,
  user: "Every job this person can decide for themselves, including the ones they invented. Their override wins over everything below it.",
};

export function JobBoardPreview() {
  const [scope, setScope] = useState<PrincipalScope>("system");
  const [domainOnly, setDomainOnly] = useState(false);
  const [coverageFilter, setCoverageFilter] = useState<CoverageState | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const scopedJobs = useMemo(
    () => jobsAtScope(scope, domainOnly ? PREVIEW_DOMAIN : null),
    [scope, domainOnly],
  );

  const counts = useMemo(
    () => coverageCounts(scopedJobs, scope),
    [scopedJobs, scope],
  );

  const rows = useMemo((): BoardRow[] => {
    return scopedJobs
      .filter((job) => {
        if (!coverageFilter) return true;
        return job.altitudes[scope]?.coverage === coverageFilter;
      })
      .map((job) => {
        const at = job.altitudes[scope];
        // `jobsAtScope` already dropped rows without this altitude; the guard
        // is here so the type narrows without a non-null assertion.
        if (!at) throw new Error(`job ${job.id} has no ${scope} altitude`);
        return {
          ...job,
          at,
          coverage: at.coverage,
          holderName: at.holder_name ?? "— unheld —",
          discoveryLabel:
            job.discovery === "both"
              ? "referenced + discovered"
              : job.discovery,
          originLabel: job.origin === "code" ? "code" : "user-created",
        };
      });
  }, [scopedJobs, scope, coverageFilter]);

  const selectedJob = rows.find((r) => r.id === selectedId) ?? null;

  const columns = useMemo((): MatrxColumnDef<BoardRow>[] => {
    return [
      {
        id: "mandate_key",
        accessorKey: "mandate_key",
        header: "Key",
        width: 210,
        cell: (r) => (
          <span className="whitespace-nowrap font-mono text-xs">
            {r.mandate_key}
          </span>
        ),
      },
      {
        // GOAL is the widest, most prominent column on this board — a job is
        // its goal. Today no surface shows it at all.
        id: "goal",
        accessorKey: "goal",
        header: "Goal",
        width: 420,
        // `width` is only a hint — min-content wins, and a wrapped paragraph's
        // min-content is one word. The explicit min-width is what actually
        // keeps the goal the widest thing on the board.
        cell: (r) => (
          <p className="min-w-[300px] whitespace-normal text-[13px] leading-snug text-foreground">
            {r.goal}
          </p>
        ),
      },
      {
        id: "holderName",
        accessorKey: "holderName",
        header: "Held by",
        filter: "select",
        width: 230,
        cell: (r) => <HolderChip at={r.at} />,
      },
      {
        id: "coverage",
        accessorKey: "coverage",
        header: "Coverage",
        filter: "select",
        width: 180,
        cell: (r) => (
          <div className="flex flex-col items-start gap-1">
            <CoverageBadge state={r.coverage} />
            {r.at.fallback_mandate_key ? (
              <span className="font-mono text-[10px] text-amber-700 dark:text-amber-400">
                via {r.at.fallback_mandate_key}
              </span>
            ) : null}
            {r.at.follower_keys.length > 0 ? (
              <span className="text-[10px] text-muted-foreground">
                {r.at.follower_keys.length} follower
                {r.at.follower_keys.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "originLabel",
        accessorKey: "originLabel",
        header: "Origin",
        filter: "select",
        width: 120,
        cell: (r) => (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              r.origin === "user" &&
                "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400",
            )}
            title={
              r.origin === "code"
                ? "The carrying code is ours. This job's screams are the platform's to answer."
                : "A person created this job. Its screams are theirs."
            }
          >
            {r.originLabel}
          </Badge>
        ),
      },
      {
        id: "discoveryLabel",
        accessorKey: "discoveryLabel",
        header: "Meets a place by",
        filter: "select",
        width: 190,
        cell: (r) => (
          <div className="flex flex-wrap gap-1">
            {(r.discovery === "referenced" || r.discovery === "both") && (
              <Badge
                variant="outline"
                className="border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-700 dark:text-sky-400"
                title="A position in code or a surface slot names this key."
              >
                referenced
              </Badge>
            )}
            {(r.discovery === "discovered" || r.discovery === "both") && (
              <Badge
                variant="outline"
                className="border-teal-500/40 bg-teal-500/10 text-[10px] text-teal-700 dark:text-teal-400"
                title="Nothing names it. It appears wherever the keys it needs exist."
              >
                discovered
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "domain",
        accessorKey: "domain",
        header: "Domain",
        filter: "select",
        width: 130,
        cell: (r) => (
          <span className="text-xs text-muted-foreground">{r.domain}</span>
        ),
      },
      {
        id: "output_kind",
        accessorKey: "output_kind",
        header: "Output kind",
        filter: "select",
        width: 190,
        cell: (r) => (
          <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
            {r.output_kind}
          </span>
        ),
      },
    ];
  }, []);

  return (
    // The scoreboard names every red and orange row inline, so its height is
    // data-driven. The page scrolls; the board below it keeps a real, bounded
    // height of its own so the table owns its scroll instead of collapsing.
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      {/* ── ONE BOARD, FOUR ALTITUDES ─────────────────────────────────────── */}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h1 className="text-base font-semibold">The Job Board</h1>
            <Badge variant="outline" className="text-[10px] uppercase">
              preview
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              size="sm"
              value={scope}
              onValueChange={(v) => {
                setScope(v as PrincipalScope);
                setSelectedId(null);
              }}
              data={SCOPE_OPTIONS.map((o) => ({
                value: o.value,
                label: (
                  <span className="flex items-center gap-1.5">
                    <o.icon className="h-3.5 w-3.5" />
                    {o.label}
                  </span>
                ),
              }))}
            />
            <button
              type="button"
              aria-pressed={domainOnly}
              onClick={() => setDomainOnly((v) => !v)}
              title={`The domain door — the same board, sliced to the ${PREVIEW_DOMAIN} feature's own jobs.`}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                domainOnly
                  ? "border-primary bg-primary/10 font-medium text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent",
              )}
            >
              Domain: {PREVIEW_DOMAIN}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{SCOPE_BLURB[scope]}</p>
      </header>

      {/* ── THE SCOREBOARD ───────────────────────────────────────────────── */}
      <CoverageScoreboard
        jobs={scopedJobs}
        scope={scope}
        counts={counts}
        activeFilter={coverageFilter}
        onFilterChange={setCoverageFilter}
        onOpenJob={setSelectedId}
      />

      {/* ── THE BOARD ────────────────────────────────────────────────────── */}
      <div className="h-[620px] shrink-0">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.mandate_key} ${r.goal} ${r.holderName}`}
          pageSize={25}
          selectedId={selectedId}
          onSelectedIdChange={setSelectedId}
          emptyState={{
            title: "No jobs match this view",
            description:
              "Clear the coverage tile or the domain slice to see the whole board at this altitude.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search jobs by key, goal or holder…",
            actions: (
              <button
                type="button"
                onClick={() =>
                  previewToast(
                    "Would open the batch grid — the three-level cascade, fill-down, copy a row and paste it to many.",
                  )
                }
                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs transition-colors hover:bg-accent"
              >
                Batch edit…
              </button>
            ),
          }}
          copy={{
            label: "Job",
            listLabel: "Jobs (this view)",
            location: "/administration/preview/unified-management/jobs",
            rowKind: "job",
            listKind: "jobs",
            humanRow: (r) =>
              `${r.mandate_key} — goal: ${r.goal} · held by: ${r.holderName}` +
              ` · coverage: ${r.coverage}` +
              (r.at.fallback_mandate_key
                ? ` (via ${r.at.fallback_mandate_key})`
                : "") +
              ` · origin: ${r.originLabel} · meets a place by: ${r.discoveryLabel}` +
              ` · domain: ${r.domain} · output kind: ${r.output_kind}`,
            rowAttributes: (r) => ({
              mandate_key: r.mandate_key,
              goal: r.goal,
              coverage: r.coverage,
              held_by: r.holderName,
              fallback: r.at.fallback_mandate_key,
              origin: r.origin,
              discovery: r.discovery,
              domain: r.domain,
              output_kind: r.output_kind,
            }),
          }}
          detail={{
            defaultWidth: 640,
            title: (r) => (
              <span className="font-mono text-sm">{r.mandate_key}</span>
            ),
            description: (r) => r.domain,
            render: (r) => (
              <JobWorkbench
                job={r}
                scope={scope}
                onOpenJobKey={(key) => {
                  const target = rows.find((row) => row.mandate_key === key);
                  if (target) {
                    setSelectedId(target.id);
                  } else {
                    previewToast(
                      `“${key}” is not on the board at this altitude — the real board would switch altitude and open it.`,
                    );
                  }
                }}
              />
            ),
          }}
        />
      </div>

      {selectedJob ? null : (
        <p className="shrink-0 pb-2 text-[11px] italic text-muted-foreground">
          Click any row to open the workbench. Nothing on this page writes
          anything — every control reports what it would do.
        </p>
      )}
    </div>
  );
}
