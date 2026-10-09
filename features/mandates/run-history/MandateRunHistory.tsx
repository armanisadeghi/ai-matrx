"use client";

// features/mandates/run-history/MandateRunHistory.tsx
//
// ONE MANDATE'S RUNS, newest first — the one table every seat mounts:
//   · the expanded Intelligence card (compact: the last few, "All runs" door),
//   · the member record page's Runs tab (person / organization seat),
//   · the admin record's Health tab (platform view, filter by org or person).
//
// Reference: Vercel's deployments list and Stripe's events list — one dense
// row per run, status dot + word, relative time with the exact time on hover,
// every name a door, filters in one top row, pagination at the foot, and the
// list's place in the URL so Back returns to it. Text never wraps: every cell
// is one line, truncated, with the full text in its tooltip; on a phone the
// table scrolls sideways inside its own box (never the page) and the less
// important columns step out.
//
// Workflows and agents are equal here: the Holder column is whichever filled
// the run, each with its peek and new-tab door; "Open" goes to the canonical
// viewer of what it produced — the conversation, or the workflow run page.

import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { NewTabLink } from "@/components/official/entity-ref/NewTabLink";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";
import { conversationHref } from "@/features/hindsight/subject-doors";
import { runHref } from "@/features/workflow-runtime/run-doors";
import {
  RUN_STATUSES,
  fetchRuns,
  type MandateRun,
  type MandateRunPage,
  type RunHistoryView,
  type RunSort,
  type RunStatus,
} from "./service";
import {
  STATUS_DOT,
  STATUS_WORDS,
  absoluteWhen,
  costWords,
  durationWords,
  outputWarningTitle,
  ranByWords,
  relativeWhen,
  rungTitle,
  rungWords,
} from "./format";
import { formatCount } from "@ai-matrx/kit/format";
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";

/** The list's place in the URL — Back returns to the same page and filters. */
export const RUN_URL_KEYS = {
  page: "runs_page",
  status: "runs_status",
  org: "runs_org",
  person: "runs_person",
  sort: "runs_sort",
  dir: "runs_dir",
} as const;

const PAGE_SIZE = 25;
const COMPACT_SIZE = 5;
const ALL = "__all__";

export interface MandateRunHistoryProps {
  mandateKey: AnyMandateKey;
  view: RunHistoryView;
  /** org view: the organization (required). mine: optional narrowing. */
  organizationId?: string | null;
  /** The card's short list: the last few runs, no filters, no URL state. */
  compact?: boolean;
  /** Compact only: where "All runs" goes. */
  seeAllHref?: string | null;
  /** Which doors a conversation opens through. */
  audience?: "admin" | "product";
  className?: string;
}

/** The columns the server orders by — the table's column id and the read's sort key. */
const SORT_COLUMNS: Record<string, RunSort> = {
  when: "started_at",
  status: "status",
  level: "level",
  cost: "cost",
  duration: "duration",
};

interface UrlState {
  page: number;
  status: RunStatus | null;
  org: string | null;
  person: string | null;
  sort: string | null;
  descending: boolean;
}

function isRunStatus(value: string | null): value is RunStatus {
  return value !== null && RUN_STATUSES.some((status) => status === value);
}

function readUrlState(params: URLSearchParams): UrlState {
  const page = Number.parseInt(params.get(RUN_URL_KEYS.page) ?? "1", 10);
  const status = params.get(RUN_URL_KEYS.status);
  return {
    page: Number.isFinite(page) && page > 0 ? page : 1,
    status: isRunStatus(status) ? status : null,
    org: params.get(RUN_URL_KEYS.org),
    person: params.get(RUN_URL_KEYS.person),
    sort: Object.keys(SORT_COLUMNS).includes(params.get(RUN_URL_KEYS.sort) ?? "") ? params.get(RUN_URL_KEYS.sort) : null,
    descending: params.get(RUN_URL_KEYS.dir) !== "asc",
  };
}

export function MandateRunHistory({
  mandateKey,
  view,
  organizationId = null,
  compact = false,
  seeAllHref = null,
  audience = "product",
  className,
}: MandateRunHistoryProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = compact
    ? { page: 1, status: null, org: null, person: null, sort: null, descending: true }
    : readUrlState(new URLSearchParams(searchParams.toString()));
  const limit = compact ? COMPACT_SIZE : PAGE_SIZE;
  const offset = (url.page - 1) * limit;
  // mine never filters by person; org is pinned to its organization.
  const orgFilter = view === "org" ? organizationId : view === "platform" ? url.org : organizationId;
  const personFilter = view === "mine" ? null : url.person;

  const queryKey = [mandateKey, view, orgFilter, personFilter, url.status, url.sort, url.descending, limit, offset].join("|");
  const [state, setState] = useState<{
    key: string;
    page: MandateRunPage | null;
    error: Error | null;
  }>({ key: "", page: null, error: null });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchRuns({
      scope: { mandateKey },
      view,
      organizationId: orgFilter,
      userId: personFilter,
      status: url.status,
      sort: url.sort ? SORT_COLUMNS[url.sort] : "started_at",
      descending: url.descending,
      limit,
      offset,
    })
      .then((page) => {
        if (!cancelled) setState({ key: queryKey, page, error: null });
      })
      .catch((error: unknown) => {
        console.error("[mandate-run-history] read failed", error);
        if (!cancelled) {
          setState({
            key: queryKey,
            page: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mandateKey, view, orgFilter, personFilter, url.status, url.sort, url.descending, limit, offset, queryKey, reload]);

  const loading = state.key !== queryKey;
  const page = loading ? null : state.page;
  const error = loading ? null : state.error;

  const setUrl = (patch: Partial<Record<keyof typeof RUN_URL_KEYS, string | null>>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [name, value] of Object.entries(patch)) {
      const key = RUN_URL_KEYS[name as keyof typeof RUN_URL_KEYS];
      if (value === null || value === "" || (name === "page" && value === "1")) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    // A push, so browser Back returns to the previous page of runs.
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const filter = (patch: Partial<Record<"status" | "org" | "person", string | null>>) =>
    setUrl({ ...patch, page: null });

  // The table reports page and sort moves; the URL owns them (filters live in the toolbar row).
  const tableState: MatrxDataTableQueryState = {
    page: url.page,
    pageSize: limit,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: url.sort ? { id: url.sort, direction: url.descending ? "desc" : "asc" } : null,
  };
  const onTableState = (next: MatrxDataTableQueryState) => {
    const nextSort = next.sort?.id ?? null;
    if (nextSort !== url.sort || (nextSort && (next.sort?.direction === "desc") !== url.descending)) {
      setUrl({ sort: nextSort, dir: nextSort && next.sort?.direction === "asc" ? "asc" : null, page: null });
    } else if (next.page !== url.page) {
      setUrl({ page: String(next.page) });
    }
  };

  const total = page?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const showOrg = view === "platform";
  // Only the filters this seat applies count — a stray `runs_person` on a
  // member's own list is ignored by the read, so it must not say "filtered".
  const filtering = Boolean(url.status || (view === "platform" && url.org) || (view !== "mine" && url.person));

  const { unit: costUnit, rate: costRate } = useCostDisplay();
  const columns = runColumns({
    view,
    audience,
    showOrg,
    costUnit,
    costRate,
    onPerson: (id) => (view !== "mine" && !compact ? () => filter({ person: id }) : null),
    onOrg: (id) => (showOrg && !compact ? () => filter({ org: id }) : null),
  });

  const filters = compact ? null : (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {view === "platform" ? (
        <FacetSelect
          label="Organization"
          allLabel="All organizations"
          value={url.org}
          options={page?.facets?.organizations ?? []}
          onChange={(value) => filter({ org: value })}
        />
      ) : null}
      {view !== "mine" ? (
        <FacetSelect
          label="Person"
          allLabel="Everyone"
          value={url.person}
          options={page?.facets?.people ?? []}
          onChange={(value) => filter({ person: value })}
        />
      ) : null}
      <Select
        value={url.status ?? ALL}
        onValueChange={(value) => filter({ status: value === ALL ? null : value })}
      >
        <SelectTrigger className="w-[9.5rem]" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {RUN_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_WORDS[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className={cn("min-w-0 space-y-2", className)} data-mandate-runs={mandateKey}>
      {error ? (
        <div role="alert" className="flex min-w-0 items-center gap-2 rounded-md border border-destructive/30 px-3 py-2 type-body text-destructive">
          <span className="min-w-0 truncate" title={error.message}>
            Could not read the runs: {error.message}
          </span>
          <Button variant="outline" className="ml-auto shrink-0" onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
          <ErrorAlchemyMenu error={error.message} />
        </div>
      ) : (
        <MatrxDataTable<MandateRun>
          tableId="mandates/run-history"
          data={page?.rows ?? []}
          columns={columns}
          getRowId={(run) => `${run.runKind}:${run.runId}`}
          isLoading={loading}
          loadingRows={compact ? 3 : 6}
          viewTabs={false}
          pageSize={compact ? 0 : PAGE_SIZE}
          pageSizeOptions={[PAGE_SIZE]}
          {...(compact
            ? { toolbar: { search: false } }
            : {
                toolbar: {
                  title: "Runs",
                  search: false,
                  ...(page ? { titleCount: { value: total, label: total === 1 ? "run" : "runs" } } : {}),
                  ...(filters ? { leading: filters } : {}),
                },
                query: {
                  mode: "controlled" as const,
                  state: tableState,
                  onStateChange: onTableState,
                  totalItems: total,
                  sourceProcessing: { search: "source" as const, sort: "source" as const, columnFilters: "source" as const },
                },
              })}
          emptyState={{
            title: filtering
              ? "No runs match these filters."
              : view === "mine"
                ? "You have not run this job yet."
                : "This job has not run yet.",
          }}
        />
      )}

      {compact && !error && page && total > 0 && seeAllHref ? (
        <div className="flex min-w-0 items-center justify-between gap-2 type-secondary">
          <span className="text-muted-foreground">
            {total > page.rows.length ? `Last ${page.rows.length} of ${formatCount(total)}` : `${total} ${total === 1 ? "run" : "runs"}`}
          </span>
          <Link href={seeAllHref} className="shrink-0 font-medium text-primary hover:underline">
            All runs
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function FacetSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string | null;
  options: readonly { id: string; name: string | null; count: number }[];
  onChange: (value: string | null) => void;
}) {
  // A filter set from a row click may name someone outside the facet list.
  const known = value === null || options.some((option) => option.id === value);
  return (
    <Select value={value ?? ALL} onValueChange={(next) => onChange(next === ALL ? null : next)}>
      <SelectTrigger className="w-[11rem]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {known ? null : <SelectItem value={value}>{`Selected ${label.toLowerCase()}`}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {`${option.name ?? "Unnamed"} (${option.count})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FilterName({
  text,
  onClick,
  title,
}: {
  text: string;
  onClick: (() => void) | null;
  title: string;
}): ReactNode {
  if (!onClick) {
    return (
      <span className="block max-w-[11rem] truncate" title={title}>
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="block max-w-[11rem] truncate text-left hover:text-primary hover:underline"
    >
      {text}
    </button>
  );
}

function runColumns({
  view,
  audience,
  showOrg,
  costUnit,
  costRate,
  onPerson,
  onOrg,
}: {
  view: RunHistoryView;
  audience: "admin" | "product";
  showOrg: boolean;
  costUnit: ReturnType<typeof useCostDisplay>["unit"];
  costRate: ReturnType<typeof useCostDisplay>["rate"];
  onPerson: (id: string | null) => (() => void) | null;
  onOrg: (id: string | null) => (() => void) | null;
}): MatrxColumnDef<MandateRun>[] {
  const outputOf = (run: MandateRun) => {
    const href =
      run.runKind === "workflow"
        ? runHref(run.runId)
        : run.conversationId && run.hasTranscript
          ? conversationHref(run.conversationId, audience)
          : null;
    const label =
      run.runKind === "workflow" ? "workflow run" : run.runKind === "agent_run" ? "agent run" : "conversation";
    return { href, label };
  };
  return [
    {
      id: "when",
      header: "When",
      accessorFn: (run) => run.startedAt,
      filter: false,
      width: 110,
      defaultSortDirection: "desc",
      cell: (run) => (
        <span title={absoluteWhen(run.startedAt)} className="text-muted-foreground">
          {relativeWhen(run.startedAt)}
        </span>
      ),
    },
    {
      id: "ran-by",
      header: "Ran by",
      accessorFn: (run) => ranByWords(run, view),
      filter: false,
      sortable: false,
      width: 160,
      mobileHidden: true,
      cell: (run) => {
        const ranBy = ranByWords(run, view);
        const onClick = onPerson(run.ranById);
        return (
          <FilterName
            text={ranBy}
            onClick={run.ranById ? onClick : null}
            title={onClick && run.ranById ? `${ranBy} — show only this person's runs` : ranBy}
          />
        );
      },
    },
    ...(showOrg
      ? [
          {
            id: "organization",
            header: "Organization",
            accessorFn: (run) => run.organizationName ?? "",
            filter: false,
            sortable: false,
            width: 160,
            mobileHidden: true,
            cell: (run) => {
              const onClick = onOrg(run.organizationId);
              return (
                <FilterName
                  text={run.organizationName ?? "—"}
                  onClick={run.organizationId ? onClick : null}
                  title={
                    onClick && run.organizationId
                      ? `${run.organizationName ?? ""} — show only this organization's runs`
                      : (run.organizationName ?? "")
                  }
                />
              );
            },
          } satisfies MatrxColumnDef<MandateRun>,
        ]
      : []),
    {
      id: "level",
      header: "Level",
      accessorFn: (run) => rungWords(run.rung),
      filter: false,
      width: 110,
      mobileHidden: true,
      cell: (run) => (
        <span title={rungTitle(run.rung)} className={cn(run.rung ? "text-foreground" : "text-muted-foreground")}>
          {rungWords(run.rung)}
        </span>
      ),
    },
    {
      id: "holder",
      header: "Agent or workflow",
      accessorFn: (run) => run.holderName ?? "",
      filter: false,
      sortable: false,
      width: 220,
      cell: (run) =>
        run.holderId ? (
          <EntityRef
            token={run.holderType}
            id={run.holderId}
            name={run.holderName ?? (run.holderType === "workflow" ? "Workflow" : "Agent")}
            className="min-w-0 max-w-full"
          />
        ) : (
          <span className="text-muted-foreground" title="No agent or workflow was recorded for this run.">
            Not recorded
          </span>
        ),
    },
    {
      id: "status",
      header: "Status",
      accessorFn: (run) => STATUS_WORDS[run.status],
      filter: false,
      width: 130,
      cell: (run) => (
        <span className="inline-flex items-center gap-1.5" title={run.error ?? run.rawStatus ?? undefined}>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[run.status])} aria-hidden />
          {STATUS_WORDS[run.status]}
          {run.error ? <ErrorAlchemyMenu error={run.error} size="xs" /> : null}
        </span>
      ),
    },
    {
      id: "cost",
      header: "Cost",
      accessorFn: (run) => run.cost,
      copyValue: (run) => costWords(run.cost, costRate, costUnit),
      filter: false,
      width: 90,
      align: "right",
      cell: (run) => <span className="tabular-nums">{costWords(run.cost, costRate, costUnit)}</span>,
    },
    {
      id: "duration",
      header: "Duration",
      accessorFn: (run) => run.durationMs,
      copyValue: (run) => durationWords(run.durationMs),
      filter: false,
      width: 100,
      align: "right",
      mobileHidden: true,
      cell: (run) => <span className="tabular-nums">{durationWords(run.durationMs)}</span>,
    },
    {
      id: "output-warning",
      header: "Output check",
      accessorFn: (run) => outputWarningTitle(run) ?? "",
      filter: false,
      sortable: false,
      width: 60,
      align: "center",
      cell: (run) => {
        const warning = outputWarningTitle(run);
        return warning ? (
          <span className="inline-flex" title={warning} role="img" aria-label={warning}>
            <TriangleAlert className="h-3.5 w-3.5 text-warning" aria-hidden />
          </span>
        ) : null;
      },
    },
    {
      id: "output",
      header: "Output",
      accessorFn: (run) => outputOf(run).href ?? "",
      filter: false,
      sortable: false,
      width: 110,
      align: "right",
      cell: (run) => {
        const { href, label } = outputOf(run);
        return href ? (
          <span className="inline-flex items-center justify-end gap-0.5">
            <Link
              href={href}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              title={`Open this run's ${label}`}
            >
              Open
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <NewTabLink href={href} label={`this run's ${label}`} />
          </span>
        ) : (
          <span
            className="text-muted-foreground"
            title={
              run.conversationId
                ? "A background run: it kept no transcript to open. Its cost, status and output check are above."
                : "This run left no conversation to open."
            }
          >
            —
          </span>
        );
      },
    },
  ];
}
