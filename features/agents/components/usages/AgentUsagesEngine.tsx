/**
 * AgentUsagesEngine — ONE answer to "where is this agent used, and what did I
 * just risk?" behind the Find Usages window, the Find Usages (Admin) window,
 * and the drift-report detail pane. One component, two modes (user | admin).
 *
 * Layout, top to bottom:
 *   1. the counts strip — every dimension we watch, INCLUDING ZERO, so a
 *      person never wonders whether a dimension is empty or unshown;
 *   2. one status line — red flags in words, the withheld count, bulk doors;
 *   3. ONE table (the canonical `MatrxDataTable`) with one row per usage —
 *      name, holder, type, pinned → newest, risk, changed, owner, actions —
 *      and a side detail pane for the grader's own findings. Selection only
 *      when a visible row can be moved.
 *
 * Two graders feed it and neither is re-derived here: the `agx_usage_scan`
 * RPC (shortcuts, apps, derived agents, …) and the server's mandate impact
 * read (`POST /mandates/impact`, the ONE grader for mandates). Mandate pins
 * move through `useImpactAdvance` (the one write path, with its 72-hour put
 * back); other usages move through `updateUsageToActive`.
 */

"use client";

import { useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  FlaskConical,
  Loader2,
  RotateCw,
  Send,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxTableIconAction, MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { recordToast, toast } from "@/lib/toast";
import { useAgentUsages } from "@/features/agents/hooks/useAgentUsages";
import {
  updateAllUsagesToActive,
  updateUsageToActive,
} from "@/features/agents/redux/usages/usages.thunks";
import {
  selectBulkState,
} from "@/features/agents/redux/usages/usages.selectors";
import { rowMutationKey } from "@/features/agents/redux/usages/usages.slice";
import type { UsageScope } from "@/features/agents/redux/usages/usages.slice";
import type {
  AgentUsageAggregate,
  AgentUsageRow,
} from "@/features/agents/redux/usages/usages.types";
import { VerdictDetail } from "@/features/mandates/admin/impact-cells";
import { useImpactAdvance } from "@/features/mandates/admin/impact-advance";
import { useOpenImpactBatchWindow } from "@/features/overlays/openers/impactBatchWindow";
import { SetCandidateDialog } from "@/features/mandates/candidate-dialog/SetCandidateDialog";
import {
  rungOfImpactVerdict,
  targetOfImpactVerdict,
} from "@/features/mandates/candidate-dialog/target";
import { storedMandateKey } from "@ai-matrx/agents/mandates";
import { mandateDisplayName } from "@/features/mandates/mandate-words";
import {
  batchEligibilityOf,
  isBehindLatest,
  revertableRows,
  rungIdentityOf,
  type ImpactVerdict,
} from "@/features/mandates/admin/impact";
import { DIMENSION_ORDER, dimensionMeta, type UsageDimension } from "./dimensions";
import { NotifyOwnerDialog, type NotifyTarget } from "./NotifyOwnerDialog";
import { HistoryDetail, UsageKpiStrip, useHistoryCounts } from "./UsageKpiStrip";
import { UsageNameCell } from "./UsageNameCell";
import { UsageRowDetail } from "./UsageRowDetail";
import { useAgentMandateImpact } from "./useAgentMandateImpact";
import { usageTypeMeta } from "./usageTypeMeta";
import {
  RISK_META,
  RISK_ORDER,
  countByDimension,
  rowFromAggregate,
  rowFromUsage,
  rowFromVerdict,
  type UnifiedUsageRow,
} from "./unified-rows";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface AgentUsagesEngineProps {
  agentId: string;
  mode: UsageScope;
}

export function AgentUsagesEngine({ agentId, mode }: AgentUsagesEngineProps) {
  const dispatch = useAppDispatch();
  const scan = useAgentUsages(agentId, mode);
  const mandates = useAgentMandateImpact(agentId, mode);
  const history = useHistoryCounts(agentId);
  const [active, setActive] = useState<UsageDimension | "history" | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [notify, setNotify] = useState<NotifyTarget | null>(null);
  const bulk = useAppSelector(selectBulkState);
  const rowMutations = useAppSelector((state) => state.agentUsages.rowMutations);
  const [candidateVerdict, setCandidateVerdict] = useState<ImpactVerdict | null>(null);
  const bulkRunning = bulk.status === "running" && bulk.agentId === agentId;
  const openImpactBatchWindow = useOpenImpactBatchWindow();

  // React Compiler memoizes these; no hand-rolled useMemo.
  const usageRows = scan.groups.flatMap((group) => group.items);
  const verdicts = mandates.impact?.verdicts ?? [];

  const rows: UnifiedUsageRow[] = [
    ...verdicts.map((verdict) => rowFromVerdict(verdict, agentId)),
    ...usageRows.map(rowFromUsage),
    ...(mode === "user" ? scan.aggregates.map(rowFromAggregate) : []),
  ];

  const counts = countByDimension(rows, DIMENSION_ORDER);

  const verdictByRung = new Map<string, ImpactVerdict>();
  for (const verdict of verdicts) verdictByRung.set(rungIdentityOf(verdict.apply_token), verdict);

  const advanceApi = useImpactAdvance({
    verdictByRung,
    onWritten: () => {
      mandates.refresh();
      setSelected([]);
    },
  });

  const visibleRows = active && active !== "history"
    ? rows.filter((row) => row.dimension === active)
    : rows;

  const agentName =
    usageRows[0]?.agentName ??
    scan.aggregates[0]?.agentName ??
    verdicts.find((verdict) => verdict.agent_id === agentId)?.agent_name ??
    "this agent";

  // ---- what a row can do -------------------------------------------------

  const usageCanUpdate = (usage: AgentUsageRow) =>
    usage.managedByCaller && usage.stalePin && usageTypeMeta(usage.usageType).remediable;

  const mandateCanAdvance = (verdict: ImpactVerdict) =>
    batchEligibilityOf(verdict).batchable;

  const updateUsage = async (usage: AgentUsageRow) => {
    const meta = usageTypeMeta(usage.usageType);
    const ok = await confirm({
      title: `Move this ${meta.label.toLowerCase()} to v${usage.currentVersion}?`,
      description: `"${usage.label}" runs v${usage.pinnedVersionNumber ?? "?"} today and will be re-pinned to v${usage.currentVersion}, the agent's active version.`,
      confirmLabel: `Move to v${usage.currentVersion}`,
    });
    if (!ok) return;
    try {
      const result = await dispatch(
        updateUsageToActive({ agentId, scope: mode, usageType: usage.usageType, usageId: usage.usageId }),
      ).unwrap();
      if (result.success) {
        recordToast.success(
          { type: usage.usageType, id: usage.usageId, title: usage.label },
          `Moved "${usage.label}" to v${result.pinnedVersionNumber ?? usage.currentVersion}`,
        );
      } else {
        toast.error(result.message ?? result.error ?? "Could not move this usage");
      }
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The move failed");
    }
  };

  const updateAllUsages = async (count: number) => {
    const ok = await confirm({
      title: `Move ${count} usage${count === 1 ? "" : "s"} to the active version?`,
      description:
        "Stale pins you can manage move to the active version. Mandates and others' pins are not touched.",
      confirmLabel: `Move ${count}`,
    });
    if (!ok) return;
    try {
      const result = await dispatch(updateAllUsagesToActive({ agentId, scope: mode })).unwrap();
      const skipped = result.skipped?.length ?? 0;
      toast.success(
        `Moved ${result.updated} usage${result.updated === 1 ? "" : "s"}` +
          (skipped > 0 ? ` · ${skipped} skipped` : ""),
      );
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "The bulk move failed");
    }
  };

  const advanceMandates = async (chosen: readonly ImpactVerdict[]) => {
    await advanceApi.advance(chosen, `Find Usages — ${agentName}`);
  };

  const openNotify = (row: UnifiedUsageRow) => {
    if (row.kind === "usage" && row.usage) {
      const usage = row.usage;
      setNotify({
        recipientIds: usage.ownerUserId ? [usage.ownerUserId] : usage.orgManagerUserIds,
        contextLabel: agentName,
        drift: {
          agentId: usage.agentId,
          agentName: usage.agentName,
          currentVersion: usage.currentVersion,
          breakingCount: usage.worstSeverity === "breaking" ? 1 : 0,
          silentCount: usage.worstSeverity === "silent_breaking" ? 1 : 0,
          severity: usage.worstSeverity,
          usageType: usage.usageType,
          usageId: usage.usageId,
          usageLabel: usage.label,
        },
      });
    } else if (row.kind === "aggregate" && row.aggregate) {
      const aggregate: AgentUsageAggregate = row.aggregate;
      setNotify({
        recipientIds: aggregate.orgManagerUserIds,
        contextLabel: `${aggregate.organizationName ?? "an organization"} (${agentName})`,
        drift: {
          agentId: aggregate.agentId,
          agentName: aggregate.agentName,
          currentVersion: aggregate.currentVersion,
          breakingCount: aggregate.breaking,
          silentCount: aggregate.silentBreaking,
          warningCount: aggregate.warning,
          severity: aggregate.worstSeverity,
        },
      });
    }
  };

  // ---- the last write's result per mandate row (for "Put back") ----------

  const latestBatch = advanceApi.batches[0] ?? null;
  const revertableIds =
    !latestBatch || latestBatch.action === "revert"
      ? new Set<string>()
      : new Set(revertableRows(latestBatch).map((result) => rungIdentityOf(result.token)));

  // ---- summary line --------------------------------------------------------

  const flagged = rows.filter((row) => row.risk === "red" || row.risk === "orange");
  const redCount = rows.filter((row) => row.risk === "red").length;
  const orangeCount = rows.filter((row) => row.risk === "orange").length;
  const behindCount = rows.filter((row) => row.behind).length;
  const updatableUsages = usageRows.filter(usageCanUpdate);
  const safeMandates = verdicts.filter(
    (verdict) =>
      mandateCanAdvance(verdict) &&
      (verdict.grade === "green" || verdict.grade === "identical") &&
      isBehindLatest(verdict),
  );
  const withheldSentences = mandates.impact?.withheldSentences ?? [];

  // ---- columns -------------------------------------------------------------

  const columns: MatrxColumnDef<UnifiedUsageRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      filter: "text",
      minWidth: 220,
      cell: (row) => <UsageNameCell row={row} />,
    },
    {
      id: "holder",
      accessorFn: (row) => row.holderLabel ?? "",
      header: "Holder",
      filter: "select",
      width: 90,
      cell: (row) =>
        row.holderLabel ? (
          <span className="type-secondary text-muted-foreground">{row.holderLabel}</span>
        ) : (
          <span className="type-secondary text-muted-foreground/50">—</span>
        ),
    },
    {
      id: "dimension",
      accessorFn: (row) => dimensionMeta(row.dimension).label,
      header: "Type",
      filter: "select",
      width: 130,
      cell: (row) => {
        const meta = dimensionMeta(row.dimension);
        const Icon = meta.icon;
        return (
          <span className="inline-flex items-center gap-1 type-secondary text-muted-foreground">
            <Icon className="h-3 w-3" aria-hidden />
            {meta.label}
          </span>
        );
      },
    },
    {
      id: "versions",
      accessorFn: (row) => `${row.pinnedLabel} → ${row.newestLabel}`,
      sortValue: (row) => (row.behind ? 0 : 1),
      header: "Runs → newest",
      filter: "text",
      width: 130,
      cell: (row) => (
        <span
          className={cn(
            "inline-flex items-center gap-1 tabular-nums type-secondary",
            row.behind ? "text-foreground" : "text-muted-foreground",
          )}
          title={
            row.behind
              ? `Runs ${row.pinnedLabel}; the newest saved version is ${row.newestLabel}.`
              : "Already on the newest version."
          }
        >
          {row.pinnedLabel}
          <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
          {row.newestLabel}
        </span>
      ),
    },
    {
      id: "risk",
      accessorFn: (row) => RISK_META[row.risk].label,
      sortValue: (row) => row.riskRank,
      header: "Risk",
      filter: "select",
      filterOptions: RISK_ORDER.map((risk) => ({ value: RISK_META[risk].label, label: RISK_META[risk].label })),
      width: 90,
      cell: (row) => (
        <Badge
          variant="outline"
          className={cn("text-[11px]", RISK_META[row.risk].badgeClassName)}
          title={RISK_META[row.risk].meaning}
        >
          {RISK_META[row.risk].label}
        </Badge>
      ),
    },
    {
      id: "whatChanged",
      accessorKey: "whatChanged",
      header: "Changed",
      filter: "text",
      width: 140,
      cell: (row) => (
        <span className="truncate type-secondary text-muted-foreground" title={row.whatChanged}>
          {row.whatChanged}
        </span>
      ),
    },
    ...(mode === "admin"
      ? [
          {
            id: "owner",
            accessorFn: (row: UnifiedUsageRow) => row.organizationName ?? row.ownerText ?? "",
            header: "Owner",
            filter: "text",
            width: 170,
            cell: (row: UnifiedUsageRow) => (
              <span className="block max-w-[160px] truncate type-meta text-muted-foreground" title={row.organizationName ?? row.ownerText ?? undefined}>
                {row.organizationName ? `org: ${row.organizationName}` : null}
                {row.organizationName && row.ownerText ? " · " : null}
                {row.ownerText ? `owner: ${row.ownerText}` : null}
              </span>
            ),
          } satisfies MatrxColumnDef<UnifiedUsageRow>,
        ]
      : []),
  ];

  // ---- render --------------------------------------------------------------

  const scanLoading = scan.status === "loading" || scan.status === "idle";
  const mandatesLoading = mandates.status === "loading" || mandates.status === "idle";

  if (scan.status === "failed" && mandates.status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
        <p className="type-body text-muted-foreground">
          {scan.error ?? mandates.error ?? "Could not load usages."}
          <ErrorAlchemyMenu error={scan.error} />
        </p>
        <Button
          icon={<RotateCw />}
          variant="outline"
          onClick={() => {
            scan.refresh();
            mandates.refresh();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <UsageKpiStrip
        history={history}
        counts={counts}
        readState={(dimension) =>
          dimension === "mandate"
            ? mandates.status === "failed"
              ? "failed"
              : mandatesLoading
                ? "loading"
                : "ready"
            : scan.status === "failed"
              ? "failed"
              : scanLoading
                ? "loading"
                : "ready"
        }
        active={active}
        onActiveChange={setActive}
      />

      {active === "history" ? <HistoryDetail history={history} /> : null}

      <StatusLine
        loading={scanLoading || mandatesLoading}
        total={rows.length}
        flagged={flagged.length}
        red={redCount}
        orange={orangeCount}
        behind={behindCount}
        scanError={scan.status === "failed" ? (scan.error ?? "the usage scan failed") : null}
        mandateError={mandates.status === "failed" ? (mandates.error ?? "the mandate read failed") : null}
        withheldSentences={withheldSentences}
        actions={
          <>
            {verdicts.length > 0 ? (
              <Button
                icon={<FlaskConical />}
                variant="outline"
                onClick={() =>
                  openImpactBatchWindow({
                    agentIds: [agentId],
                    mode: "post_batch",
                    posture: mandates.posture,
                    focusAgentId: agentId,
                    batchLabel: `Find Usages — ${agentName}`,
                    sourceSentence: `The mandates ${agentName} serves — pinned version beside the newest, with a quick test.`,
                    surfaceName: "agent-find-usages",
                  })
                }
                title="Open the pinned and newest versions side by side, and run one of these mandates against each."
              >
                Compare versions & test
              </Button>
            ) : null}
            {safeMandates.length > 0 ? (
              <Button
                icon={advanceApi.busy === "advance" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCw />
                )}
                variant="primary"
                disabled={advanceApi.busy !== null}
                onClick={() => void advanceMandates(safeMandates)}
                title="Every green or identical mandate pin that is behind the newest version — moved in one batch, with a put-back door."
              >
                Move all green mandates ({safeMandates.length})
              </Button>
            ) : null}
            {updatableUsages.length > 0 ? (
              <Button
                icon={bulkRunning ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RotateCw />
                )}
                variant={safeMandates.length > 0 ? "outline" : "primary"}
                disabled={bulkRunning}
                onClick={() => void updateAllUsages(updatableUsages.length)}
                title="Every stale shortcut, app, and derived-agent pin you manage — re-pinned to the active version."
              >
                Move all stale usages ({updatableUsages.length})
              </Button>
            ) : null}
            {latestBatch && latestBatch.action !== "revert" && revertableIds.size > 0 ? (
              <Button
                icon={<Undo2 />}
                variant="quiet"
                disabled={advanceApi.busy !== null}
                onClick={() => void advanceApi.revert(latestBatch, null)}
                title="Put every pin the last batch moved back where it was."
              >
                Put back last batch ({revertableIds.size})
              </Button>
            ) : null}
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        <MatrxDataTable
          tableId={`agent-usages-${mode}`}
          data={visibleRows}
          columns={columns}
          getRowId={(row) => row.id}
          searchText={(row) => `${row.name} ${row.holderLabel ?? ""} ${row.subtitle ?? ""} ${row.whatChanged}`}
          isLoading={scanLoading && mandatesLoading && rows.length === 0}
          isFetching={scanLoading || mandatesLoading}
          defaultSort={{ id: "risk", direction: "asc" }}
          density="condensed"
          pageSize={50}
          toolbar={{ search: true, searchPlaceholder: "Search usages…" }}
          emptyState={{
            title: active && active !== "history"
              ? `No ${dimensionMeta(active).plural.toLowerCase()} use this agent`
              : "Nothing uses this agent yet",
            description: active && active !== "history"
              ? "Checked and empty; clear the tile to see all"
              // Every dimension (mandate, shortcut, app, scheduled task, workflow,
              // surface, SMS line, derived agent, code path) was checked.
              : "Checked every dimension; none point at it",
          }}
          // This engine already lives inside a WindowPanel, so a row opens its
          // detail in a second window (the table's own), never the page-level
          // side panel — which would render behind and beside the window.
          detail={{ enabled: false }}
          window={{
            enabled: true,
            openOnRowClick: true,
            title: (row) => `${dimensionMeta(row.dimension).label} · ${row.name}`,
            renderView: (row) => <RowDetail row={row} />,
            renderEdit: false,
            width: 560,
            height: 520,
          }}
          selection={{
            selectedIds: selected,
            onSelectedIdsChange: setSelected,
            noun: "usage",
            actions: (selectedRows) => {
              const chosenVerdicts = selectedRows
                .filter(
                  (row) =>
                    row.kind === "mandate" &&
                    !!row.verdict &&
                    mandateCanAdvance(row.verdict),
                )
                .map((row) => row.verdict as ImpactVerdict);
              const chosenUsages = selectedRows
                .filter(
                  (row) =>
                    row.kind === "usage" &&
                    !!row.usage &&
                    usageCanUpdate(row.usage),
                )
                .map((row) => row.usage as AgentUsageRow);
              return (
                <div className="flex items-center gap-1.5">
                  {chosenVerdicts.length > 0 ? (
                    <Button
                      icon={advanceApi.busy === "advance" ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <RotateCw />
                      )}
                      variant="primary"
                      disabled={advanceApi.busy !== null}
                      onClick={() => void advanceMandates(chosenVerdicts)}
                    >
                      Move {chosenVerdicts.length} mandate pin{chosenVerdicts.length === 1 ? "" : "s"}
                    </Button>
                  ) : null}
                  {chosenUsages.length > 0 ? (
                    <Button
                      icon={<RotateCw />}
                      variant="outline"
                      disabled={bulkRunning}
                      onClick={async () => {
                        for (const usage of chosenUsages) await updateUsage(usage);
                        setSelected([]);
                      }}
                    >
                      Move {chosenUsages.length} usage{chosenUsages.length === 1 ? "" : "s"}
                    </Button>
                  ) : null}
                </div>
              );
            },
          }}
          rowActions={(row) => {
            const actions: MatrxTableIconAction[] = [];
            const busy = advanceApi.busy !== null || bulkRunning;
            const revertable = row.verdict ? revertableIds.has(rungIdentityOf(row.verdict.apply_token)) : false;
            const updating = row.usage ? rowMutations[rowMutationKey(row.usage.usageType, row.usage.usageId)] === "updating" : false;
            if (revertable) actions.push({ id: "put-back", icon: Undo2, label: "Put back",
              tooltip: "Put this pin back where it was before the last move.", disabled: busy,
              onClick: () => { if (latestBatch && row.verdict) void advanceApi.revert(latestBatch, row.verdict.row_id); } });
            else if (row.kind === "mandate" && row.verdict && mandateCanAdvance(row.verdict) && isBehindLatest(row.verdict)) {
              actions.push({ id: "advance", icon: RotateCw, label: `Move to ${row.newestLabel}`,
                tooltip: `Move this mandate's pin to ${row.newestLabel}.`, disabled: busy,
                onClick: () => { if (row.verdict) void advanceMandates([row.verdict]); } });
              actions.push({ id: "candidate", icon: FlaskConical, label: "Try as candidate",
                tooltip: `Run ${row.newestLabel} beside the live one on the next real runs, then decide.`, disabled: busy,
                onClick: () => setCandidateVerdict(row.verdict ?? null) });
            } else if (row.kind === "usage" && row.usage && usageCanUpdate(row.usage)) {
              actions.push({ id: "update", icon: RotateCw, label: `Move to ${row.newestLabel}`,
                tooltip: `Re-pin this ${dimensionMeta(row.dimension).label.toLowerCase()} to ${row.newestLabel}.`, disabled: busy, loading: updating,
                onClick: () => { if (row.usage) void updateUsage(row.usage); } });
            }
            const canNotify = !row.managedByCaller && ((row.usage && (row.usage.ownerUserId || row.usage.orgManagerUserIds.length > 0)) || (row.aggregate && row.aggregate.orgManagerUserIds.length > 0));
            if (canNotify) actions.push({ id: "notify", icon: Send, label: "Notify",
              tooltip: "Tell the owner about this drift — it is theirs to move.", onClick: () => openNotify(row) });
            return actions;
          }}

        />
      </div>

      {candidateVerdict ? <SetCandidateDialog
        mandateKey={storedMandateKey(candidateVerdict.mandate_key)}
        mandateName={mandateDisplayName(storedMandateKey(candidateVerdict.mandate_key), null)}
        initialTarget={targetOfImpactVerdict(candidateVerdict)} rung={rungOfImpactVerdict(candidateVerdict)}
        onClose={() => setCandidateVerdict(null)}
      /> : null}
      <NotifyOwnerDialog open={!!notify} target={notify} onClose={() => setNotify(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatusLine({
  loading,
  total,
  flagged,
  red,
  orange,
  behind,
  scanError,
  mandateError,
  withheldSentences,
  actions,
}: {
  loading: boolean;
  total: number;
  flagged: number;
  red: number;
  orange: number;
  behind: number;
  scanError: string | null;
  mandateError: string | null;
  withheldSentences: string[];
  actions: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted/10 px-3 py-2 type-body">
      {scanError || mandateError ? (
        <span className="inline-flex items-center gap-1.5 text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span className="font-medium">Partial read.</span>
          <span className="type-secondary">
            {scanError ? `Usage scan: ${scanError}. ` : ""}
            {mandateError ? `Mandates: ${mandateError}.` : ""}{" "}
            <ErrorAlchemyMenu error={scanError ?? mandateError} />
          </span>
        </span>
      ) : flagged > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden />
          <span className="font-medium text-foreground">
            {flagged} of {total} need a look
          </span>
          <span className="type-secondary text-muted-foreground">
            {red > 0 ? `${red} red` : ""}
            {red > 0 && orange > 0 ? " · " : ""}
            {orange > 0 ? `${orange} orange` : ""}
            {behind > 0 ? ` · ${behind} behind the newest version` : ""}
          </span>
        </span>
      ) : loading && total === 0 ? (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Checking every dimension…
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <CircleCheck className="h-4 w-4 text-success" aria-hidden />
          <span className="font-medium text-foreground">No red flags.</span>
          <span className="type-secondary text-muted-foreground">
            {total === 0
              ? "Nothing uses this agent."
              : behind > 0
                ? `${total} usage${total === 1 ? "" : "s"}; ${behind} behind the newest version but only low-risk changes.`
                : `All ${total} usage${total === 1 ? "" : "s"} run the newest version.`}
          </span>
        </span>
      )}
      {withheldSentences.map((sentence) => (
        <span key={sentence} className="type-secondary text-muted-foreground" title="Counted, never listed — those pins belong to other people.">
          {sentence}
        </span>
      ))}
      <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>
    </div>
  );
}

function RowDetail({ row }: { row: UnifiedUsageRow }) {
  if (row.kind === "mandate" && row.verdict) {
    const verdict = row.verdict;
    return (
      <div className="space-y-3 p-3">
        <VerdictDetail verdict={verdict} />
        {verdict.lineage_path && verdict.lineage_path.length > 1 ? (
          <p className="type-secondary text-muted-foreground">
            Reached through lineage:{" "}
            {lineageNames(verdict.lineage_path).join(" → ")}
          </p>
        ) : null}
        {verdict.changed_columns && verdict.changed_columns.length > 0 ? (
          <p className="type-secondary text-muted-foreground">
            Changed columns:{" "}
            <code className="font-mono type-meta">{verdict.changed_columns.join(", ")}</code>
          </p>
        ) : null}
      </div>
    );
  }
  if (row.kind === "usage" && row.usage) {
    return <UsageRowDetail row={row.usage} />;
  }
  if (row.kind === "aggregate" && row.aggregate) {
    const aggregate = row.aggregate;
    return (
      <div className="space-y-2 p-3 type-secondary text-muted-foreground">
        <p>
          {aggregate.count} {dimensionMeta(aggregate.usageType).plural.toLowerCase()} of this agent belong to other people
          {aggregate.organizationName ? ` in ${aggregate.organizationName}` : ""}; counted, never listed or moved.
        </p>
        <p>
          {aggregate.breaking} breaking · {aggregate.silentBreaking} silent break · {aggregate.warning} behind · {aggregate.info} low-risk.
        </p>
      </div>
    );
  }
  return null;
}

/** Lineage names for a person — a `self` step repeats the last agent's name, so consecutive repeats collapse. */
function lineageNames(path: ReadonlyArray<{ agent_name: string }>): string[] {
  const names: string[] = [];
  for (const step of path) {
    if (names[names.length - 1] !== step.agent_name) names.push(step.agent_name);
  }
  return names;
}
