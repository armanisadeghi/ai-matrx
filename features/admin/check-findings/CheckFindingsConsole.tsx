"use client";

/**
 * CheckFindingsConsole — /administration/reporting/check-findings.
 *
 * Every static check's last run and its findings, from the checks store (`ops.proof_check`
 * `kind='static'`, `ops.check_run`, `ops.check_item` — common-docs/projects/checks-run-in-the-app/
 * P2-STORAGE-DESIGN.md). Two views on one URL: the per-check board (no `?check=`), and one
 * check's items (`?check=<proof_check id>&state=open|accepted|fixed|broken|retired`), grouped by
 * work unit.
 *
 * "Mark OK": every item the store can hold today has a REPO HOME — `proof_check` refuses a
 * static check without a `repo` (constraint `proof_check_static_identity`), and items only
 * exist for static checks. So an accept is always a commit to that check's own allowlist
 * (plan C1). The dialog's button asks the server (aidream POST /admin/checks/accept) to make
 * that commit on main with the CLI's own adapter; the item then reads "Marked OK — landing"
 * (`metadata.pending_accept`) until the next ingested run marks it accepted. The one-line
 * command stays as the secondary path.
 * `ops.check_item_db_accept` (the database accept for an item with no repo home) is
 * server-only and has no reachable item; this page offers no control for it (FEATURE.md).
 */

import { Suspense, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CircleSlash,
  Clock,
  Copy,
  ExternalLink,
  GitCommitHorizontal,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@ai-matrx/design-system";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import { formatCount, formatDurationMs, formatRelativeTime } from "@ai-matrx/kit/format";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNow } from "@/hooks/useNow";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_REPORTING_SURFACE_NAME,
  createAdminReportingScope,
} from "@/features/surfaces/manifests/admin-reporting.manifest";
import {
  repositoryCommitHref,
  repositoryFileHref,
} from "@/features/admin/reporting/source-links";
import {
  STATE_FILTER_LABELS,
  STATE_FILTER_STATES,
  acceptBasisLabel,
  acceptCommand,
  isCheckRepo,
  isReservedKey,
  isStateFilter,
  pendingAcceptView,
  summarizeChecks,
  type PendingAcceptView,
  type CheckRepo,
  type CheckSummaryRow,
  type StateFilter,
} from "./model";
import {
  liveCheckFindingsSource,
  type CheckFindingsSnapshot,
  type CheckFindingsSource,
  type CheckItem,
} from "./service";
import { markFindingOk } from "./acceptApi";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** What the server page knows about matrx-frontend's accept adapters (scripts/findings/registry.mjs). */
export interface FrontendAcceptInfo {
  /** Files the adapter writes; null when the check has no adapter. */
  files: string[] | null;
  /** How this check is accepted when it has no adapter, in the registry's own words. */
  noAccept: string | null;
}

export interface CheckFindingsConsoleProps {
  frontendAccept: Record<string, FrontendAcceptInfo>;
  /** Defaults to the live store. A dev demo passes a labelled fixture. */
  source?: CheckFindingsSource;
  /** Shown above everything when set — a fixture must say so on screen. */
  banner?: string;
}

export function CheckFindingsConsole(props: CheckFindingsConsoleProps) {
  return (
    <Suspense fallback={null}>
      <ConsoleBody {...props} />
    </Suspense>
  );
}

type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** THE copy primitive: on a refusal it opens the manual-copy dialog with the text selected. */
function copyText(text: string, label: string) {
  return copyToClipboard(text, {
    formatJson: false,
    onSuccess: () => toast.success(`${label} copied`),
  });
}

function ConsoleBody({ frontendAccept, source = liveCheckFindingsSource, banner }: CheckFindingsConsoleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const now = useNow();

  const selectedId = params.get("check");
  const stateParam = params.get("state");
  const stateFilter: StateFilter = isStateFilter(stateParam) ? stateParam : "open";

  const [snapshot, setSnapshot] = useState<Load<CheckFindingsSnapshot>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState<Load<CheckItem[]>>({ status: "loading" });
  const [accepting, setAccepting] = useState<CheckItem | null>(null);

  useEffect(() => {
    let live = true;
    setSnapshot({ status: "loading" });
    source.loadSnapshot().then(
      (data) => live && setSnapshot({ status: "ready", data }),
      (error: unknown) => live && setSnapshot({ status: "error", message: messageOf(error) }),
    );
    return () => {
      live = false;
    };
  }, [source, reloadKey]);

  useEffect(() => {
    if (!selectedId) return;
    let live = true;
    setItems({ status: "loading" });
    source.loadItems(selectedId, STATE_FILTER_STATES[stateFilter]).then(
      (data) => live && setItems({ status: "ready", data }),
      (error: unknown) => live && setItems({ status: "error", message: messageOf(error) }),
    );
    return () => {
      live = false;
    };
  }, [source, selectedId, stateFilter, reloadKey]);

  const navigate = (next: { check?: string | null; state?: StateFilter | null }, push: boolean) => {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value == null) query.delete(key);
      else query.set(key, value);
    }
    const href = query.size ? `${pathname}?${query.toString()}` : pathname;
    startTransition(() => (push ? router.push(href) : router.replace(href)));
  };

  const rows =
    snapshot.status === "ready" ? summarizeChecks(snapshot.data.checks, snapshot.data.liveItems, now || Date.now()) : [];
  const selected = selectedId ? rows.find((row) => row.check.id === selectedId) ?? null : null;

  const totals = {
    checks: rows.length,
    open: rows.reduce((n, r) => n + r.openCount, 0),
    broken: rows.filter((r) => r.brokenReasons.length > 0).length,
    overdue: rows.filter((r) => r.overdue).length,
    neverRan: rows.filter((r) => r.run == null).length,
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_REPORTING_SURFACE_NAME}
      getScope={() =>
        createAdminReportingScope({
          reporting_section: "check_findings",
          check_findings_totals: { ...totals },
          check_findings_selected_check: selected
            ? { id: selected.check.id, stable_id: selected.check.stable_id, repo: selected.check.repo }
            : undefined,
          check_findings_state_filter: selectedId ? stateFilter : undefined,
        })
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2 p-2 sm:p-3">
        {banner ? (
          <div className="rounded-md border border-warning/50 bg-warning/10 px-3 py-1.5 text-xs font-medium text-foreground">
            {banner}
          </div>
        ) : null}

        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
          <h1 className="text-sm font-semibold">Check findings</h1>
          {snapshot.status === "ready" ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatCount(totals.checks)} checks</span>
              <span className={totals.open ? "font-medium text-foreground" : undefined}>
                {formatCount(totals.open)} open
              </span>
              {totals.broken ? (
                <span className="font-medium text-destructive">{totals.broken} check broken</span>
              ) : null}
              {totals.overdue ? <span className="font-medium text-warning">{totals.overdue} overdue</span> : null}
              {totals.neverRan ? <span>{totals.neverRan} never ran</span> : null}
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-xs"
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={snapshot.status === "loading"}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${snapshot.status === "loading" ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </header>

        {snapshot.status === "error" ? (
          <LoadError
            what="the checks store"
            message={snapshot.message}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        ) : selectedId ? (
          <CheckDetail
            row={selected}
            loadingSnapshot={snapshot.status === "loading"}
            checkId={selectedId}
            stateFilter={stateFilter}
            items={items}
            now={now || Date.now()}
            onState={(state) => navigate({ state }, false)}
            onAllChecks={() => navigate({ check: null, state: null }, true)}
            onRetry={() => setReloadKey((k) => k + 1)}
            onAccept={setAccepting}
            frontendAccept={frontendAccept}
          />
        ) : (
          <CheckBoard
            rows={rows}
            loading={snapshot.status === "loading"}
            onOpen={(row) => navigate({ check: row.check.id, state: "open" }, true)}
          />
        )}

        <AcceptDialog
          item={accepting}
          row={accepting ? rows.find((r) => r.check.id === accepting.check_id) ?? null : null}
          frontendAccept={frontendAccept}
          latestRunStartedAt={
            accepting ? (rows.find((r) => r.check.id === accepting.check_id)?.run?.started_at ?? null) : null
          }
          onClose={() => setAccepting(null)}
          onAccepted={() => setReloadKey((k) => k + 1)}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}

function LoadError({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-destructive">Could not read {what}.</p>
        <p className="break-words text-muted-foreground">
          {message}
          <ErrorAlchemyMenu error={message} operation={`Read ${what}`} />
        </p>
        <p className="text-muted-foreground">
          These tables are readable only by a platform admin on an /administration page. If you are one,
          retry; a permission error here means the admin lane did not reach the database.
        </p>
      </div>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// ── The board: one row per check ──────────────────────────────────────────────────────────────

function VerdictBadge({ row }: { row: CheckSummaryRow }) {
  const run = row.run;
  if (!run) return <Badge variant="outline" className="text-muted-foreground">never ran</Badge>;
  if (row.brokenReasons.length > 0 || run.status === "errored" || run.status === "timed_out") {
    const why = row.brokenReasons.length
      ? row.brokenReasons.join("\n")
      : run.status === "timed_out"
        ? "The check ran out of time before it finished."
        : `The check errored${run.exit_code != null ? ` (exit ${run.exit_code})` : ""} without naming a reason.`;
    return (
      <Badge variant="destructive" className="gap-1" title={why}>
        <AlertTriangle className="h-3 w-3" />
        {run.status === "timed_out" ? "timed out" : "broken"}
      </Badge>
    );
  }
  if (run.status === "skipped") {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <CircleSlash className="h-3 w-3" />
        skipped
      </Badge>
    );
  }
  if (run.verdict === "pass") {
    return (
      <Badge variant="outline" className="gap-1 border-success/40 text-success">
        <CheckCircle2 className="h-3 w-3" />
        pass
      </Badge>
    );
  }
  if (run.verdict === "fail") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
        <XCircle className="h-3 w-3" />
        fail
      </Badge>
    );
  }
  return <Badge variant="outline">{run.status}</Badge>;
}

function verdictSortKey(row: CheckSummaryRow): string {
  if (!row.run) return "never ran";
  if (row.brokenReasons.length > 0 || row.run.status === "errored") return "broken";
  if (row.run.status === "timed_out") return "timed out";
  if (row.run.status === "skipped") return "skipped";
  return row.run.verdict ?? row.run.status;
}

function CheckBoard({
  rows,
  loading,
  onOpen,
}: {
  rows: CheckSummaryRow[];
  loading: boolean;
  onOpen: (row: CheckSummaryRow) => void;
}) {
  const columns: MatrxColumnDef<CheckSummaryRow>[] = [
    {
      id: "check",
      header: "Check",
      accessorFn: (r) => r.check.label,
      filter: "text",
      width: 260,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate font-medium" title={r.check.label}>
            {r.check.label}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={r.check.stable_id ?? ""}>
            {r.check.stable_id ?? "—"}
            {r.check.is_active ? "" : " · retired"}
          </div>
        </div>
      ),
    },
    {
      id: "verdict",
      header: "Verdict",
      accessorFn: verdictSortKey,
      filter: "select",
      width: 110,
      cell: (r) => <VerdictBadge row={r} />,
    },
    {
      id: "broken-reason",
      header: "Why broken",
      accessorFn: (r) => r.brokenReasons.join(" · "),
      filter: "text",
      width: 260,
      // Never `hidden` from the data: the table reads `hidden` once, at its
      // first render — while the board is still loading and every row looks
      // healthy — so a broken check's reason never appeared (RC-B12 round 7).
      cell: (r) =>
        r.brokenReasons.length ? (
          <span className="relative block truncate pr-7 text-destructive" title={r.brokenReasons.join("\n")}>
            {r.brokenReasons.join(" · ")}
            <ErrorAlchemyMenu error={r.brokenReasons.join("\n")} operation={`Run the check ${r.check.label}`} />
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "open",
      header: "Open",
      accessorFn: (r) => r.openCount,
      filter: "number",
      width: 120,
      align: "right",
      cell: (r) => (
        <span
          className={`whitespace-nowrap ${r.openCount ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          title={r.handedOffCount ? `${r.handedOffCount} of these are claimed by an agent` : undefined}
        >
          {formatCount(r.openCount)}
          {r.handedOffCount ? <span className="font-normal text-muted-foreground"> · {r.handedOffCount} claimed</span> : null}
        </span>
      ),
    },
    {
      id: "oldest-open",
      header: "Oldest open",
      accessorFn: (r) => r.oldestOpenAt,
      filter: "number",
      width: 110,
      cell: (r) =>
        r.oldestOpenAt != null ? (
          <span title={new Date(r.oldestOpenAt).toLocaleString()}>
            {formatRelativeTime(r.oldestOpenAt, { suffix: false })}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "last-run",
      header: "Last run",
      accessorFn: (r) => (r.run ? r.run.started_at : ""),
      filter: "date",
      width: 120,
      cell: (r) =>
        r.run ? (
          <span className={r.overdue ? "text-warning" : undefined} title={new Date(r.run.started_at).toLocaleString()}>
            {formatRelativeTime(r.run.started_at)}
            {r.overdue ? " · overdue" : ""}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "duration",
      header: "Duration",
      accessorFn: (r) => r.run?.duration_ms ?? null,
      filter: "number",
      width: 90,
      align: "right",
      mobileHidden: true,
      cell: (r) => (r.run?.duration_ms != null ? formatDurationMs(r.run.duration_ms, { style: "compact" }) : "—"),
    },
    {
      id: "scan-complete",
      header: "Scan complete",
      accessorFn: (r) => (r.run ? r.run.scan_complete : null),
      filter: "boolean",
      width: 110,
      mobileHidden: true,
      cell: (r) =>
        !r.run ? (
          "—"
        ) : r.run.scan_complete ? (
          <span className="text-success">complete</span>
        ) : (
          <span className="text-warning" title="Without the end-of-scan marker, absent items are never marked fixed.">
            partial
          </span>
        ),
    },
    { id: "repo", header: "Repo", accessorFn: (r) => r.check.repo ?? "", filter: "select", width: 120 },
    { id: "level", header: "Level", accessorFn: (r) => r.check.level ?? "", filter: "select", width: 90, mobileHidden: true },
    {
      id: "accepted",
      header: "Accepted",
      accessorFn: (r) => r.acceptedCount,
      filter: "number",
      width: 90,
      align: "right",
      mobileHidden: true,
      cell: (r) => <span className="text-muted-foreground">{formatCount(r.acceptedCount)}</span>,
    },
  ];

  return (
    <div className="min-h-0 flex-1">
      <MatrxDataTable
        tableId="admin-check-findings-board"
        data={rows}
        columns={columns}
        getRowId={(r) => r.check.id}
        isLoading={loading}
        stickyHeader
        density="condensed"
        pageSize={100}
        localPagination={{ mode: "progressive" }}
        defaultSort={{ id: "open", direction: "desc" }}
        onRowOpen={onOpen}
        mobileCards={(r, _index, controls) => (
          <div className="space-y-1 p-2 text-xs">
          <button type="button" className="block w-full space-y-1 text-left" onClick={() => onOpen(r)}>
            {controls.renderCell("check")}
            <div className="flex flex-wrap items-center gap-2">
              {controls.renderCell("verdict")}
              <span className="flex items-center gap-1"><span className="text-muted-foreground">open</span> {controls.renderCell("open")}</span>
              {r.oldestOpenAt != null ? <span className="text-muted-foreground">oldest {controls.renderCell("oldest-open")}</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{r.check.repo}</span>
              <span>last run {controls.renderCell("last-run")}</span>
              <span>{controls.renderCell("scan-complete")}</span>
            </div>
          </button>
          {/* The reason a check is broken, on the card that says "broken" —
              outside the card's button so its Alchemy Menu is not a button
              inside a button. */}
          {r.brokenReasons.length ? <div className="min-w-0">{controls.renderCell("broken-reason")}</div> : null}
          </div>
        )}
        coverage={{ noun: "check", answeredBy: "client", total: loading ? undefined : rows.length }}
        toolbar={{ title: "Checks", search: true }}
        rowActions={(r) => (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onOpen(r)}>
            Findings
          </Button>
        )}
        emptyState={{
          icon: <Clock className="h-5 w-5" />,
          title: "No check has reported to this database yet",
          description:
            "The store is live but empty. Findings arrive when a check run is ingested (aidream scripts/checks/ingest.py — hand-run today; no schedule is approved yet). An empty board means nothing has been ingested, not that every check passes.",
        }}
      />
    </div>
  );
}

// ── One check: its last run and its items ─────────────────────────────────────────────────────

function CheckDetail({
  row,
  loadingSnapshot,
  checkId,
  stateFilter,
  items,
  now,
  onState,
  onAllChecks,
  onRetry,
  onAccept,
  frontendAccept,
}: {
  frontendAccept: Record<string, FrontendAcceptInfo>;
  row: CheckSummaryRow | null;
  loadingSnapshot: boolean;
  checkId: string;
  stateFilter: StateFilter;
  items: Load<CheckItem[]>;
  now: number;
  onState: (state: StateFilter) => void;
  onAllChecks: () => void;
  onRetry: () => void;
  onAccept: (item: CheckItem) => void;
}) {
  const repo: CheckRepo | null = row && isCheckRepo(row.check.repo) ? row.check.repo : null;
  const run = row?.run ?? null;
  // A matrx-frontend check with no accept adapter gets an honest "why" instead of "Mark OK".
  // aidream's adapters are not visible from here; its command refuses by name when absent.
  const acceptable = !(
    repo === "matrx-frontend" &&
    row?.check.stable_id != null &&
    frontendAccept[row.check.stable_id]?.files === null
  );

  const columns: MatrxColumnDef<CheckItem>[] = [
    {
      id: "unit",
      header: "Work unit",
      accessorKey: "unit_key",
      filter: "text",
      hidden: true,
    },
    {
      id: "title",
      header: "Finding",
      accessorFn: (item) => item.title ?? item.item_key,
      filter: "text",
      width: 340,
      cell: (item) => (
        <div className="min-w-0">
          <div className="truncate" title={item.title ?? ""}>
            {item.title ?? <span className="text-muted-foreground">(no title)</span>}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={item.item_key}>
            {item.item_key}
          </div>
        </div>
      ),
    },
    // State sits right after the identity column and carries the item's one decision
    // (Mark OK) with it, so the control is on screen at every width without scrolling
    // sideways — a trailing Actions column fell off the right edge below ~1500px.
    {
      id: "state",
      header: "State",
      accessorKey: "state",
      filter: "select",
      width: 130,
      cell: (item) => {
        const view = pendingAcceptView(item.state, item.pending_accept, run?.started_at ?? null, now);
        return (
          <div className="flex flex-col items-start gap-1">
            <Badge variant="outline" className="text-[11px]">
              {item.state.replace("_", " ")}
            </Badge>
            <PendingAcceptBadge view={view} />
            <ItemDecision item={item} view={view} acceptable={acceptable} onAccept={onAccept} />
          </div>
        );
      },
    },
    {
      id: "location",
      header: "File",
      accessorFn: (item) => (item.file ? `${item.file}${item.line ? `:${item.line}` : ""}` : ""),
      filter: "text",
      width: 300,
      cell: (item) =>
        item.file && repo ? (
          <a
            href={repositoryFileHref(repo, item.file, item.line)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1 truncate font-mono text-[11px] text-primary hover:underline"
            title={`Open ${item.file}${item.line ? `:${item.line}` : ""} on GitHub (main)`}
          >
            <span className="truncate">
              {item.file}
              {item.line ? `:${item.line}` : ""}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">{item.file ?? "—"}</span>
        ),
    },
    { id: "rule", header: "Rule", accessorFn: (item) => item.rule ?? "", filter: "select", width: 140, mobileHidden: true },
    {
      id: "first-seen",
      header: "First seen",
      accessorKey: "created_at",
      filter: "date",
      width: 100,
      cell: (item) => <span title={new Date(item.created_at).toLocaleString()}>{formatRelativeTime(item.created_at)}</span>,
    },
    {
      id: "last-change",
      header: "Last change",
      accessorKey: "updated_at",
      filter: "date",
      width: 100,
      mobileHidden: true,
      cell: (item) => <span title={new Date(item.updated_at).toLocaleString()}>{formatRelativeTime(item.updated_at)}</span>,
    },
    {
      id: "claimed-by",
      header: "Claimed by",
      accessorFn: (item) => item.handed_off_to ?? "",
      filter: "text",
      width: 140,
      hidden: stateFilter !== "open",
    },
    {
      id: "basis",
      header: "Accepted as",
      accessorFn: (item) => acceptBasisLabel(item.accept_basis),
      filter: "select",
      width: 140,
      hidden: stateFilter !== "accepted",
    },
    {
      id: "reason",
      header: "Reason",
      accessorFn: (item) => item.db_accept_reason ?? "",
      filter: "text",
      width: 260,
      hidden: stateFilter !== "accepted",
      cell: (item) =>
        item.accept_basis === "db" ? (
          <span className="block truncate" title={item.db_accept_reason ?? ""}>
            {item.db_accept_reason}
          </span>
        ) : (
          <span className="text-muted-foreground" title="An allowlist accept keeps its reason, who and when in the check's own allowlist file.">
            in the {repo ?? "repo"} allowlist
          </span>
        ),
    },
    {
      id: "accepted-by",
      header: "Who / when",
      accessorFn: (item) => (item.accept_basis === "db" ? item.updated_at : ""),
      filter: "date",
      width: 170,
      hidden: stateFilter !== "accepted",
      cell: (item) =>
        item.accept_basis === "db" ? (
          <span className="flex min-w-0 items-center gap-1">
            {item.updated_by ? <MatrxUuidCell value={item.updated_by} label="Accepted by" token="user" /> : null}
            <span className="text-muted-foreground">{formatRelativeTime(item.updated_at)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">allowlist entry</span>
        ),
    },
    {
      id: "review",
      header: "Review on",
      accessorFn: (item) => item.review_after ?? "",
      filter: "date",
      width: 110,
      hidden: stateFilter !== "accepted",
      cell: (item) =>
        item.review_after ? (
          <span className={Date.parse(item.review_after) < now ? "text-warning" : undefined}>
            {new Date(item.review_after).toLocaleDateString()}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "fixed-at",
      header: "Fixed",
      accessorFn: (item) => item.fixed_at ?? "",
      filter: "date",
      width: 110,
      hidden: stateFilter !== "fixed",
      cell: (item) => (item.fixed_at ? formatRelativeTime(item.fixed_at) : "—"),
    },
  ];

  const data = items.status === "ready" ? items.data : [];
  const stateOptions = (Object.keys(STATE_FILTER_LABELS) as StateFilter[]).map((value) => ({
    value,
    label: STATE_FILTER_LABELS[value],
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <section className="rounded-md border border-border bg-card px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-xs" onClick={onAllChecks}>
            <ChevronLeft className="h-3.5 w-3.5" />
            All checks
          </Button>
          {row ? (
            <>
              <span className="text-sm font-semibold">{row.check.label}</span>
              <span className="font-mono text-muted-foreground">
                {row.check.repo}:{row.check.stable_id}
              </span>
              <VerdictBadge row={row} />
            </>
          ) : loadingSnapshot ? (
            <span className="text-muted-foreground">Reading the check…</span>
          ) : (
            <span className="text-destructive">No static check has id {checkId}.</span>
          )}
        </div>
        {row ? (
          <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
            <span>
              Last run:{" "}
              {run ? (
                <span className={row.overdue ? "text-warning" : "text-foreground"}>
                  {new Date(run.started_at).toLocaleString()} ({formatRelativeTime(run.started_at)}
                  {row.overdue ? ", overdue" : ""})
                </span>
              ) : (
                "never"
              )}
            </span>
            <span className="hidden sm:inline">
              Duration:{" "}
              <span className="text-foreground">
                {run?.duration_ms != null ? formatDurationMs(run.duration_ms, { style: "compact" }) : "—"}
              </span>
              {run ? ` · ${run.status}${run.skipped_reason ? ` (${run.skipped_reason})` : ""} · ${run.run_scope}` : ""}
            </span>
            <span>
              Scan:{" "}
              <span className={run?.scan_complete ? "text-success" : "text-warning"}>
                {run ? (run.scan_complete ? "complete" : "not complete — absent items are not marked fixed") : "—"}
              </span>
            </span>
            <span className="hidden min-w-0 items-center gap-1 sm:flex">
              Commit:{" "}
              {run?.git_sha && repo ? (
                <a
                  href={repositoryCommitHref(repo, run.git_sha)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
                >
                  <GitCommitHorizontal className="h-3 w-3" />
                  {run.git_sha.slice(0, 10)}
                </a>
              ) : (
                "—"
              )}
              {run?.host ? ` · ${run.host}` : ""}
            </span>
            {run ? (
              <span className="hidden sm:col-span-2 sm:inline lg:col-span-4">
                {formatCount(run.new_count)} new · {formatCount(run.known_count)} known
                {run.malformed_count ? ` · ${run.malformed_count} malformed item lines` : ""}
                {run.headline ? ` — ${run.headline}` : ""}
              </span>
            ) : null}
            {run?.apply_note ? (
              <span className="text-warning sm:col-span-2 lg:col-span-4">Apply note: {run.apply_note}</span>
            ) : null}
            {row.brokenReasons.length ? (
              <span className="text-destructive sm:col-span-2 lg:col-span-4">
                The check itself needs repair: {row.brokenReasons.join(" · ")}
                <ErrorAlchemyMenu error={row.brokenReasons.join("\n")} operation={`Run the check ${row.check.label}`} />
              </span>
            ) : null}
            {row.check.command ? (
              <span className="hidden min-w-0 items-center gap-1 sm:col-span-2 sm:flex lg:col-span-4">
                Re-run: <code className="truncate font-mono text-foreground">{row.check.command}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label="Copy the check's command"
                  onClick={() => void copyText(row.check.command ?? "", "Check command")}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      {items.status === "error" ? (
        <LoadError what="this check's findings" message={items.message} onRetry={onRetry} />
      ) : (
        <div className="min-h-0 flex-1">
          <MatrxDataTable
            // Columns hide by state filter, and the table reads `hidden` only
            // when it mounts — a new filter is a new table.
            key={stateFilter}
            tableId="admin-check-findings-items"
            data={data}
            columns={columns}
            getRowId={(item) => item.id}
            isLoading={items.status === "loading"}
            stickyHeader
            density="condensed"
            pageSize={100}
            localPagination={{ mode: "progressive" }}
            defaultSort={{ id: "first-seen", direction: "asc" }}
            coverage={{ noun: "finding", answeredBy: "client", total: items.status === "ready" ? data.length : undefined }}
            mobileCards={(item, _index, controls) => (
              <div className="space-y-1 p-2 text-xs">
                <div className="flex items-start gap-2">
                  {controls.renderCell("state")}
                  <div className="min-w-0 flex-1">{controls.renderCell("title")}</div>
                </div>
                {item.file ? <div className="min-w-0">{controls.renderCell("location")}</div> : null}
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span>first seen {formatRelativeTime(item.created_at)}</span>
                  {controls.actions}
                </div>
              </div>
            )}
            grouping={{
              columnId: "unit",
              groupableColumnIds: ["unit", "rule", "state"],
              rowNoun: "finding",
              emptyLabel: "(no unit)",
              order: "count-desc",
              renderLabel: (group) => (
                <span className="block max-w-[20rem] truncate font-mono text-[11px]" title={group.label}>
                  {unitLabel(group.label)}
                </span>
              ),
            }}
            toolbar={{
              title: "Findings",
              search: true,
              facets: [
                {
                  type: "button-group",
                  id: "state",
                  label: "State",
                  value: stateFilter,
                  defaultValue: "open",
                  options: stateOptions,
                  onChange: (value) => {
                    if (isStateFilter(value)) onState(value);
                  },
                },
              ],
            }}
            emptyState={{
              icon: <CheckCircle2 className="h-5 w-5" />,
              title: `No ${STATE_FILTER_LABELS[stateFilter].toLowerCase()} findings for this check`,
              description:
                stateFilter === "open"
                  ? run
                    ? "Nothing open as of the last ingested run."
                    : "This check has never reported a run to this database, so there is nothing to show yet — not a clean bill of health."
                  : "Switch the State filter to see other findings.",
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The one decision an open finding offers, drawn inside the State cell (never a trailing
 * column a narrow window scrolls away). While a Mark OK is committing or landing the State
 * cell's PendingAcceptBadge already says so, so no control is drawn.
 */
function ItemDecision({
  item,
  view,
  acceptable,
  onAccept,
}: {
  item: CheckItem;
  view: PendingAcceptView;
  acceptable: boolean;
  onAccept: (item: CheckItem) => void;
}) {
  if (item.state !== "open" && item.state !== "handed_off") return null;
  if (isReservedKey(item.item_key)) {
    return (
      <span
        className="text-[11px] text-muted-foreground"
        title="A record about the check itself — fix the check; it closes on the next whole run."
      >
        fix the check
      </span>
    );
  }
  if (acceptable && (view.kind === "landing" || view.kind === "committing")) return null;
  if (acceptable) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={(event) => {
          event.stopPropagation();
          onAccept(item);
        }}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Mark OK
      </Button>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
      onClick={(event) => {
        event.stopPropagation();
        onAccept(item);
      }}
    >
      <CircleSlash className="h-3.5 w-3.5" />
      No accept — why?
    </Button>
  );
}

/** A unit key is `<repo>:<check>|<area>`; inside one check only the area says anything. */
function unitLabel(unitKey: string): string {
  const bar = unitKey.indexOf("|");
  return bar >= 0 ? unitKey.slice(bar + 1) : unitKey;
}

// ── Mark OK ───────────────────────────────────────────────────────────────────────────────────

/** The one honest line for an item carrying a Mark OK marker (model.ts pendingAcceptView). */
function PendingAcceptBadge({ view }: { view: PendingAcceptView }) {
  switch (view.kind) {
    case "none":
      return null;
    case "committing":
      return <span className="text-[10px] text-muted-foreground">Marking OK…</span>;
    case "landing":
      return (
        <span className="text-[10px] text-success" title={view.pending.reason ?? undefined}>
          Marked OK — landing
          {view.pending.commitUrl ? (
            <>
              {" · "}
              <a href={view.pending.commitUrl} target="_blank" rel="noreferrer" className="underline">
                {view.pending.commitSha?.slice(0, 7) ?? "commit"}
              </a>
            </>
          ) : null}
        </span>
      );
    case "still_reported":
      return (
        <span className="text-[10px] text-destructive" title="A run that started after the accept landed still reports this finding.">
          Accept landed, still reported
        </span>
      );
    case "failed":
      return (
        <span className="text-[10px] text-destructive" title={view.pending.error ?? undefined}>
          Mark OK failed
          <ErrorAlchemyMenu error={view.pending.error ?? "Mark OK failed"} operation="Mark this finding OK" />
        </span>
      );
    case "interrupted":
      return <span className="text-[10px] text-warning">Mark OK interrupted — try again</span>;
  }
}

type AcceptResult =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "error"; title: string; message: string; remedy: string | null };

function AcceptDialog({
  item,
  row,
  frontendAccept,
  latestRunStartedAt,
  onClose,
  onAccepted,
}: {
  item: CheckItem | null;
  row: CheckSummaryRow | null;
  frontendAccept: Record<string, FrontendAcceptInfo>;
  latestRunStartedAt: string | null;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const isMobile = useIsMobile();
  const now = useNow();
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<AcceptResult>({ kind: "idle" });
  const [showCommand, setShowCommand] = useState(false);
  const open = item != null;
  const repo: CheckRepo | null = row && isCheckRepo(row.check.repo) ? row.check.repo : null;
  const checkId = row?.check.stable_id ?? null;
  const fe = repo === "matrx-frontend" && checkId ? frontendAccept[checkId] : undefined;
  const noAdapter = fe != null && fe.files == null;
  const command = item && repo && checkId ? acceptCommand(repo, checkId, item.item_key, reason) : null;
  const pending = item ? pendingAcceptView(item.state, item.pending_accept, latestRunStartedAt, now || Date.now()) : null;

  const title = noAdapter ? "This check has no accept command" : "Mark this finding OK";
  const subtitle = noAdapter
    ? "Its findings clear when they are fixed."
    : "Accepted once, with a reason, so it never raises again.";

  const close = () => {
    setReason("");
    setResult({ kind: "idle" });
    setShowCommand(false);
    onClose();
  };

  const markOk = async () => {
    if (!item || !reason.trim()) return;
    setResult({ kind: "working" });
    const outcome = await markFindingOk(item.id, reason.trim());
    if (outcome.ok) {
      toast.success(outcome.message || "Marked OK");
      onAccepted();
      close();
      return;
    }
    const titleFor = {
      refused: "Not marked OK — nothing was written",
      failed: "Mark OK failed — nothing reached main",
      unreachable: "Could not reach the server",
    } as const;
    setResult({ kind: "error", title: titleFor[outcome.kind], message: outcome.message, remedy: outcome.remedy });
    toast.error(titleFor[outcome.kind]);
  };

  const body = (
    <div className="space-y-3 text-xs">
      {item ? (
        <div className="rounded-md border border-border bg-muted/40 p-2">
          <div className="font-medium">{item.title ?? item.item_key}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{item.item_key}</div>
        </div>
      ) : null}
      {pending?.kind === "failed" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <p className="font-medium text-destructive">The last Mark OK for this finding failed.</p>
          <p className="break-words text-muted-foreground">
            {pending.pending.error}
            <ErrorAlchemyMenu error={pending.pending.error} operation="Mark this finding OK" />
          </p>
          {pending.pending.remedy ? <p className="text-muted-foreground">{pending.pending.remedy}</p> : null}
        </div>
      ) : null}
      {pending?.kind === "still_reported" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
          <p className="font-medium text-destructive">The accept landed, but the check still reports this finding.</p>
          <p className="text-muted-foreground">
            A run that started after the commit ({pending.pending.commitSha?.slice(0, 7)}) still lists it, so the allowlist
            entry did not cover it. Run the command below in a checkout — it re-runs the check and says why.
          </p>
        </div>
      ) : null}
      {!repo || !checkId ? (
        <p className="text-destructive">
          This finding&apos;s check has no repository and id on record, so there is no accept to offer. The
          checks store requires both for every static check; this row breaks that rule — report it.
        </p>
      ) : noAdapter ? (
        <div className="space-y-1">
          <p className="text-muted-foreground">{fe?.noAccept}</p>
          <p className="text-muted-foreground">
            So the only way to clear this finding is to fix it (or give the check an allowlist first).
          </p>
        </div>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="font-medium">Why is this fine? (required)</span>
            <Input
              autoFocus
              value={reason}
              maxLength={500}
              placeholder="e.g. intentional: the admin page reads every row by design"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <p className="text-muted-foreground">
            Mark OK writes this finding into the check&apos;s own allowlist in {repo}
            {fe?.files ? ` (${fe.files.join(", ")})` : ""} with your reason, name and date, and commits it to main — so CI,
            hand runs and this page all agree. The finding reads &ldquo;Marked OK — landing&rdquo; until the next checks run
            confirms it, then moves to Accepted.
          </p>
          {result.kind === "error" ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
              <p className="font-medium text-destructive">{result.title}</p>
              <p className="break-words text-muted-foreground">
                {result.message}
                <ErrorAlchemyMenu error={result.message} input={{ title: result.title, message: result.message, source: "alert" }} />
              </p>
              {result.remedy ? <p className="text-muted-foreground">{result.remedy}</p> : null}
            </div>
          ) : null}
          <div className="space-y-1">
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => setShowCommand((v) => !v)}
            >
              {showCommand ? "Hide the command" : "Prefer a terminal? Show the command"}
            </button>
            {showCommand ? (
              <pre className="whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px]">
                {command}
              </pre>
            ) : null}
          </div>
        </>
      )}
    </div>
  );

  const hasReason = reason.trim().length > 0;
  const canCopy = command != null && !noAdapter && hasReason;
  const working = result.kind === "working";
  const footer = (
    <>
      <Button variant="ghost" size="sm" onClick={close}>
        Close
      </Button>
      {command && !noAdapter && showCommand ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={!canCopy}
          title={canCopy ? undefined : "Write the reason first — it goes into the allowlist entry."}
          onClick={() => void copyText(command, "Accept command")}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy command
        </Button>
      ) : null}
      {command && !noAdapter ? (
        <Button
          size="sm"
          className="gap-1"
          disabled={!hasReason || working}
          title={hasReason ? undefined : "Write the reason first — it goes into the allowlist entry."}
          onClick={() => void markOk()}
        >
          {working ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {working ? "Committing to main…" : "Mark OK"}
        </Button>
      ) : null}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && close()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{subtitle}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{body}</div>
          <DrawerFooter className="pb-safe">{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
