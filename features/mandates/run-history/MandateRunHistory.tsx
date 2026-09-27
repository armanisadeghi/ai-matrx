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

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { NewTabLink } from "@/components/official/entity-ref/NewTabLink";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";
import { conversationHref } from "@/features/hindsight/subject-doors";
import { runHref } from "@/features/workflow-runtime/run-doors";
import {
  RUN_STATUSES,
  fetchMandateRuns,
  type MandateRun,
  type MandateRunPage,
  type RunHistoryView,
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

/** The list's place in the URL — Back returns to the same page and filters. */
export const RUN_URL_KEYS = {
  page: "runs_page",
  status: "runs_status",
  org: "runs_org",
  person: "runs_person",
} as const;

const PAGE_SIZE = 25;
const COMPACT_SIZE = 5;
const ALL = "__all__";

export interface MandateRunHistoryProps {
  mandateKey: string;
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

interface UrlState {
  page: number;
  status: RunStatus | null;
  org: string | null;
  person: string | null;
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
    ? { page: 1, status: null, org: null, person: null }
    : readUrlState(new URLSearchParams(searchParams.toString()));
  const limit = compact ? COMPACT_SIZE : PAGE_SIZE;
  const offset = (url.page - 1) * limit;
  // mine never filters by person; org is pinned to its organization.
  const orgFilter = view === "org" ? organizationId : view === "platform" ? url.org : organizationId;
  const personFilter = view === "mine" ? null : url.person;

  const queryKey = [mandateKey, view, orgFilter, personFilter, url.status, limit, offset].join("|");
  const [state, setState] = useState<{
    key: string;
    page: MandateRunPage | null;
    error: Error | null;
  }>({ key: "", page: null, error: null });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchMandateRuns({
      mandateKey,
      view,
      organizationId: orgFilter,
      userId: personFilter,
      status: url.status,
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
  }, [mandateKey, view, orgFilter, personFilter, url.status, limit, offset, queryKey, reload]);

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

  const total = page?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / limit));
  const showOrg = view === "platform";

  return (
    <div className={cn("min-w-0 space-y-2", className)} data-mandate-runs={mandateKey}>
      {compact ? null : (
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="shrink-0 text-sm font-semibold text-foreground">Runs</h3>
          <span className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
            {page ? `${total.toLocaleString()} ${total === 1 ? "run" : "runs"}` : " "}
          </span>
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
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
              <SelectTrigger className="h-8 w-[9.5rem] text-xs" aria-label="Status">
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
        </div>
      )}

      {error ? (
        <div role="alert" className="flex min-w-0 items-center gap-2 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
          <span className="min-w-0 truncate" title={error.message}>
            Could not read the runs: {error.message}
          </span>
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
          <ErrorAlchemyMenu error={error.message} />
        </div>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-md border border-border">
          <Table wrap={false} className="min-w-[30rem] text-xs sm:min-w-[36rem] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[6.5rem]">When</TableHead>
                <TableHead className="hidden sm:table-cell">Ran by</TableHead>
                {showOrg ? <TableHead className="hidden lg:table-cell">Organization</TableHead> : null}
                <TableHead className="hidden sm:table-cell">Level</TableHead>
                <TableHead>Agent or workflow</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="hidden text-right md:table-cell">Duration</TableHead>
                <TableHead className="w-8" aria-label="Output warning" />
                <TableHead className="w-[5.5rem] text-right">Output</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: compact ? 3 : 6 }, (_, index) => (
                  <TableRow key={`loading-${index}`} aria-hidden>
                    <TableCell colSpan={10}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              ) : page && page.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-6 text-center text-muted-foreground">
                    {url.status || url.org || url.person
                      ? "No runs match these filters."
                      : view === "mine"
                        ? "You have not run this job yet."
                        : "This job has not run yet."}
                  </TableCell>
                </TableRow>
              ) : (
                page?.rows.map((run) => (
                  <RunRow
                    key={`${run.runKind}:${run.runId}`}
                    run={run}
                    view={view}
                    audience={audience}
                    showOrg={showOrg}
                    onPerson={
                      view !== "mine" && run.ranById && !compact
                        ? () => filter({ person: run.ranById })
                        : null
                    }
                    onOrg={
                      showOrg && run.organizationId && !compact
                        ? () => filter({ org: run.organizationId })
                        : null
                    }
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {compact ? (
        page && total > 0 && seeAllHref ? (
          <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              {total > page.rows.length ? `Last ${page.rows.length} of ${total.toLocaleString()}` : `${total} ${total === 1 ? "run" : "runs"}`}
            </span>
            <Link href={seeAllHref} className="shrink-0 font-medium text-primary hover:underline">
              All runs
            </Link>
          </div>
        ) : null
      ) : page && total > limit ? (
        <div className="flex min-w-0 items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>
            {offset + 1}–{Math.min(offset + limit, total)} of {total.toLocaleString()}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={url.page <= 1}
            aria-label="Newer runs"
            onClick={() => setUrl({ page: String(url.page - 1) })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={url.page >= lastPage}
            aria-label="Older runs"
            onClick={() => setUrl({ page: String(url.page + 1) })}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
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
      <SelectTrigger className="h-8 w-[11rem] text-xs" aria-label={label}>
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

function RunRow({
  run,
  view,
  audience,
  showOrg,
  onPerson,
  onOrg,
}: {
  run: MandateRun;
  view: RunHistoryView;
  audience: "admin" | "product";
  showOrg: boolean;
  onPerson: (() => void) | null;
  onOrg: (() => void) | null;
}) {
  const ranBy = ranByWords(run, view);
  const warning = outputWarningTitle(run);
  const outputHref =
    run.runKind === "workflow"
      ? runHref(run.runId)
      : run.conversationId && run.hasTranscript
        ? conversationHref(run.conversationId, audience)
        : null;
  const outputLabel = run.runKind === "workflow" ? "workflow run" : "conversation";
  return (
    <TableRow data-run-id={run.runId}>
      <TableCell title={absoluteWhen(run.startedAt)} className="text-muted-foreground">
        {relativeWhen(run.startedAt)}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        <FilterName
          text={ranBy}
          onClick={onPerson}
          title={onPerson ? `${ranBy} — show only this person's runs` : ranBy}
        />
      </TableCell>
      {showOrg ? (
        <TableCell className="hidden lg:table-cell">
          <FilterName
            text={run.organizationName ?? "—"}
            onClick={onOrg}
            title={onOrg ? `${run.organizationName ?? ""} — show only this organization's runs` : run.organizationName ?? ""}
          />
        </TableCell>
      ) : null}
      <TableCell className="hidden sm:table-cell" title={rungTitle(run.rung)}>
        <span className={cn(run.rung ? "text-foreground" : "text-muted-foreground")}>{rungWords(run.rung)}</span>
      </TableCell>
      <TableCell className="max-w-[8rem] sm:max-w-[16rem]">
        {run.holderId ? (
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
        )}
      </TableCell>
      <TableCell title={run.error ?? run.rawStatus ?? undefined}>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[run.status])} aria-hidden />
          {STATUS_WORDS[run.status]}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{costWords(run.cost)}</TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">{durationWords(run.durationMs)}</TableCell>
      <TableCell className="px-1">
        {warning ? (
          <span className="inline-flex" title={warning} role="img" aria-label={warning}>
            <TriangleAlert className="h-3.5 w-3.5 text-warning" aria-hidden />
          </span>
        ) : null}
      </TableCell>
      <TableCell className="text-right">
        {outputHref ? (
          <span className="inline-flex items-center justify-end gap-0.5">
            <Link
              href={outputHref}
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
              title={`Open this run's ${outputLabel}`}
            >
              Open
              <ArrowUpRight className="h-3 w-3" />
            </Link>
            <NewTabLink href={outputHref} label={`This run's ${outputLabel}`} />
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
        )}
      </TableCell>
    </TableRow>
  );
}
