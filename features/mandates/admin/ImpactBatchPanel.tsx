"use client";

/**
 * THE BATCH PANEL BODY (Agent Change Impact, I5) — Arman's 90% case.
 *
 * ONE body, two moments, the same rules:
 *   • BEFORE a write (`mode="dry_run"`): the impact read with the proposed
 *     delta (R14, R23) grades every pin the change would touch as if it had
 *     already landed — "N agents, M mandates: x safe / y to check / z red" —
 *     and the person picks which pins to move once the write is real. Nothing
 *     can be advanced from a preview: every dry-run token has no target.
 *   • AFTER a write (`mode="post_batch"`): the same body scoped to the agents
 *     the writer touched (descendants walked, R4), in three piles — safe →
 *     one button; check settings → click through or advance anyway; red →
 *     open one, or advance anyway. Per-row grade stays visible inside the
 *     batch (the Dependabot lesson).
 *
 * Blocked rows and other people's pins are NAMED with the reason and never
 * selectable (R17, I12/R27); what the read withheld is said by count and
 * sentence (R31). Every grade word is the server's; every result sentence is
 * the server's; this file only lays them out.
 *
 * 🚨 A PANEL WRAPS THE CANONICAL COMPONENT: the deprecated-models bulk replace
 * embeds this body in its confirm step and opens it again in the window after
 * the write; the single-agent post-edit badge (I6) opens the same window. No
 * second renderer of a grade exists — the cells are `./impact-cells`.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FastForward,
  FlaskConical,
  History,
  ListChecks,
  Loader2,
  RefreshCw,
  UserRound,
  Wrench,
} from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { AdminUserRef } from "@/features/admin/users/components/AdminUserRef";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenMandateWindow } from "@/features/overlays/openers/mandateWindow";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin, selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import {
  selectAccessToken,
  selectAuthReady,
} from "@/lib/redux/selectors/userSelectors";
import { fetchUserDisplayNames } from "@/features/mandates/notes";
import { toast } from "@/lib/toast";
import { agentHref } from "./mandate-health";
import {
  BATCH_TIER_META,
  BATCH_TIER_ORDER,
  BLOCKER_META,
  GRADE_META,
  IMPACT_GRADE_ORDER,
  batchEligibilityOf,
  batchTierOf,
  countBatchTiers,
  describeBatch,
  fetchImpact,
  isBatchActionable,
  isOwnPin,
  mergeStandingImpacts,
  rungIdentityOf,
  newestLabelOf,
  pinnedLabelOf,
  settingsSignalOf,
  tooYoungReasonOf,
  type BatchTier,
  type ImpactDelta,
  type ImpactGrade,
  type ImpactPosture,
  type ImpactVerdict,
  type StandingImpact,
  type WriteContext,
  ADMIN_WRITE_CONTEXT,
} from "./impact";
import { adminDoorOpen } from "@/lib/api/adminDoor";
import { ImpactAgentCompanion, type CompanionSection } from "./ImpactAgentCompanion";
import { useImpactAdvance } from "./impact-advance";
import { useImpactSettingsFix, type SettingsFixOutcome } from "./impact-settings-fix";
import { SettingsFixReportCard, settleSettingsFix, type SettingsFixReport } from "./impact-settings-fix-report";
import {
  AdvanceResultBadge,
  AdvanceResultsCard,
  VerdictDetail,
} from "./impact-cells";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export type ImpactBatchMode = "dry_run" | "post_batch";

/** One read: these agents, graded against this hypothetical change (or none). */
export interface ImpactBatchScope {
  agentIds: readonly string[];
  delta: ImpactDelta | null;
}

export interface ImpactBatchPanelProps {
  /** The agents the change touches (dry run) or touched (post batch). */
  agentIds: readonly string[];
  mode: ImpactBatchMode;
  /** The hypothetical change, dry run only (R23). */
  delta?: ImpactDelta | null;
  /**
   * Several reads at once — a dry run of a bulk model swap has one delta PER
   * replaced model. When given, `agentIds`/`delta` are ignored for the read
   * (they still name the scope). Each scope is read through the one paged,
   * bounded reader and the results are summed.
   */
  scopes?: ReadonlyArray<ImpactBatchScope>;
  /** Stamped on every batch this panel writes, and shown in the header. */
  batchLabel: string;
  /** One sentence naming the change, for a person: "Replace GPT-4 with GPT-5 in 12 agents". */
  sourceSentence?: string | null;
  /**
   * Controlled selection by rung identity (`holder_kind:row_id`). The dry-run
   * host lifts it so the choice made before the write carries into the
   * post-batch panel as `preselectedRungIds`.
   */
  selectedRungIds?: readonly string[];
  onSelectedRungIdsChange?: (ids: string[]) => void;
  /** Post batch: rows chosen during the dry run start selected. */
  preselectedRungIds?: readonly string[];
  /** Walk duplicated descendants (R4). Default: on after a write, off before. */
  includeDescendants?: boolean;
  /** Where the panel was opened from — stamped on notes written from the mandate window. */
  surfaceName?: string | null;
  /** Tighter chrome when embedded in a dialog rather than a window. */
  compact?: boolean;
  /** Which door the read goes through (R31). Default: the console's super-admin door. */
  posture?: ImpactPosture;
  /**
   * The single-agent case (I6): the agent a person just edited. The panel
   * then carries two more sections beside the pins — the version history
   * (pinned vs newest, `AgentDiffViewer`) and the quick test
   * (`MandateTestBench`) — and names each descendant's lineage in full.
   */
  focusAgentId?: string | null;
}

interface BatchRow {
  id: string;
  verdict: ImpactVerdict;
  tier: BatchTier;
  grade: ImpactGrade;
  mandateKey: string;
  agentName: string;
  rungLabel: string;
  ownerUserId: string | null;
  versions: string;
  settingsState: "clean" | "changed" | "unmeasured";
  resultStatus: string;
}

const TIER_FILTER_OPTIONS = BATCH_TIER_ORDER.map((tier) => ({
  value: tier,
  label: BATCH_TIER_META[tier].label,
}));

function GradeHover({ verdict }: { verdict: ImpactVerdict }) {
  return (
    <HoverCard openDelay={150} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          aria-label={`What changed for ${verdict.mandate_key}`}
          className="inline-flex items-center gap-1 rounded text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Badge variant="outline" className={GRADE_META[verdict.grade].toneClassName}>
            {GRADE_META[verdict.grade].label}
          </Badge>
          {verdict.findings && verdict.findings.length > 0 ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {verdict.findings.length}
            </span>
          ) : null}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        className="w-[min(28rem,96vw)] space-y-2 p-3"
      >
        <div className="text-xs font-medium">{verdict.agent_name} — what changed</div>
        <VerdictDetail verdict={verdict} />
        {verdict.lineage_path && verdict.lineage_path.length > 1 ? (
          <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">
            Reached through lineage:{" "}
            {verdict.lineage_path
              .map((step) =>
                step.relation === "self" ? step.agent_name : `duplicate → ${step.agent_name}`,
              )
              .join(" ")}
          </p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

export function ImpactBatchPanel({
  agentIds,
  mode,
  delta = null,
  batchLabel,
  sourceSentence = null,
  scopes,
  selectedRungIds,
  onSelectedRungIdsChange,
  preselectedRungIds,
  includeDescendants,
  surfaceName = null,
  compact = false,
  posture = "admin",
  focusAgentId = null,
}: ImpactBatchPanelProps) {
  const [section, setSection] = useState<"pins" | CompanionSection>("pins");
  const dispatch = useAppDispatch();
  const openMandateWindow = useOpenMandateWindow();
  const walkDescendants = includeDescendants ?? mode === "post_batch";
  // THE WRITE DOORS (I12): the actor's OWN personal pins always go through
  // the owner lane; the rest through the admin lane for a super admin and the
  // owner lane for anyone else (the server judges). Never on behalf.
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const actorUserId = useAppSelector(selectUserId);
  // THE ADMIN SEAT (Arman, 2026-09-26): opened from the admin section, the
  // panel never treats the signed-in admin's pins as "your own".
  const writeContext: WriteContext = adminDoorOpen()
    ? ADMIN_WRITE_CONTEXT
    : { posture: isSuperAdmin ? "admin" : "mine", actorUserId: actorUserId ?? null };
  // THE ORG GATE (D2) — the same one MandatesConsole has. A window restored on
  // a full page load mounts before app-context and auth hydrate; `callApi`
  // then fails its own preflight ("Select an organization…") and the panel
  // sat on that error until a manual Re-grade. Wait for the same Redux
  // authority the transport reads, and re-read when it arrives.
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  // 🚨 THE FOURTH STATE (R37): `orgBootstrapResolved` is TRUE when the read
  // FAILED too, so it can never be the refusal on its own.
  const { organizationState } = useOrganizationRequired();
  const accessToken = useAppSelector(selectAccessToken);
  const authReady = useAppSelector(selectAuthReady);
  const sessionReady = Boolean(authReady && accessToken && selectedOrganizationId);
  const organizationUnanswered = Boolean(
    authReady &&
      accessToken &&
      (organizationState === "required" || organizationState === "unavailable"),
  );

  const [impact, setImpact] = useState<StandingImpact | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [epoch, setEpoch] = useState(0);
  // R13 — fixes waiting for the read AFTER their own to say what they changed
  // (the ref is what the read's callback consults; the state is the screen),
  // and the settled reports, kept on screen: a fix that changed no pile says so.
  const pendingFixesRef = useRef<SettingsFixReport[]>([]);
  const [pendingFixes, setPendingFixes] = useState<SettingsFixReport[]>([]);
  const [fixReports, setFixReports] = useState<SettingsFixReport[]>([]);
  // React Compiler memoizes — no manual useMemo anywhere in this file.
  // The read identity is a STRING so a new array with the same contents never
  // re-fires it.
  const readScopes: ImpactBatchScope[] = (scopes ?? [{ agentIds, delta }])
    .map((scope) => ({
      agentIds: Array.from(new Set(scope.agentIds)).sort(),
      delta: mode === "dry_run" ? (scope.delta ?? null) : null,
    }))
    .filter((scope) => scope.agentIds.length > 0);
  const scopeKey = JSON.stringify(readScopes);

  useEffect(() => {
    const parsed = JSON.parse(scopeKey) as ImpactBatchScope[];
    if (parsed.length === 0) {
      setImpact(null);
      return;
    }
    // Not "failed" — not yet. The header says it is waiting for the session.
    if (!sessionReady) return;
    let cancelled = false;
    setLoading(true);
    // `epoch` is the re-read trigger after a write.
    void epoch;
    Promise.all(
      parsed.map((scope) =>
        fetchImpact(dispatch, scope.agentIds, {
          delta: scope.delta,
          includeDescendants: walkDescendants,
          posture,
        }),
      ),
    )
      .then((parts) => mergeStandingImpacts(parts))
      .then((report) => {
        if (cancelled) return;
        setImpact(report);
        setError(null);
        // R13 — settle every fix this read was waited for: the row's pile
        // before → after, in words, on screen and in a toast.
        const ready = pendingFixesRef.current.filter((fix) => epoch >= fix.settleEpoch);
        if (ready.length === 0) return;
        const settled = ready.map((fix) =>
          settleSettingsFix(fix, report.verdicts, {
            dryRun: mode === "dry_run",
            context: { posture: isSuperAdmin ? "admin" : "mine", actorUserId: actorUserId ?? null },
          }),
        );
        pendingFixesRef.current = pendingFixesRef.current.filter((fix) => !ready.includes(fix));
        setPendingFixes(pendingFixesRef.current);
        setFixReports((prev) => [...settled, ...prev]);
        for (const settledFix of settled) {
          if (settledFix.changedPile) toast.success(settledFix.sentence, { duration: 15_000 });
          else toast.info(settledFix.sentence, { duration: 15_000 });
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, epoch, posture, scopeKey, sessionReady, walkDescendants, mode, isSuperAdmin, actorUserId]);

  // Owners of personal pins, by name (I12) — best effort, one lookup.
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(() => new Map());
  const ownerIdsKey = Array.from(
    new Set(
      (impact?.verdicts ?? [])
        .map((v) => v.principal.subject_user_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  )
    .sort()
    .join("|");
  useEffect(() => {
    if (!ownerIdsKey) return;
    let cancelled = false;
    fetchUserDisplayNames(ownerIdsKey.split("|")).then((names) => {
      if (!cancelled) setOwnerNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [ownerIdsKey]);

  // One row per rung (a rung reached through two lineage paths counts once).
  const rows = ((): BatchRow[] => {
    const seen = new Set<string>();
    const out: BatchRow[] = [];
    for (const verdict of impact?.verdicts ?? []) {
      const id = rungIdentityOf(verdict.apply_token);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        verdict,
        tier: batchTierOf(verdict, { dryRun: mode === "dry_run", context: writeContext }),
        grade: verdict.grade,
        mandateKey: verdict.mandate_key,
        agentName: verdict.agent_name,
        rungLabel:
          verdict.holder_kind === "binding"
            ? isOwnPin(verdict, writeContext)
              ? "your own pin"
              : `${verdict.principal.kind} binding`
            : "mandate default",
        ownerUserId:
          verdict.principal.kind === "user" && !isOwnPin(verdict, writeContext)
            ? (verdict.principal.subject_user_id ?? null)
            : null,
        versions: `${pinnedLabelOf(verdict)} → ${mode === "dry_run" ? "proposed" : newestLabelOf(verdict)}`,
        settingsState: settingsSignalOf(verdict).state,
        resultStatus: "",
      });
    }
    return out;
  })();

  const verdictByRung = new Map<string, ImpactVerdict>();
  for (const row of rows) verdictByRung.set(row.id, row.verdict);

  const counts = countBatchTiers(
    rows.map((row) => row.verdict),
    { dryRun: mode === "dry_run", context: writeContext },
  );

  // Selection: controlled by the host (dry run lifts it) or local.
  const [localSelected, setLocalSelected] = useState<string[]>(() =>
    Array.from(preselectedRungIds ?? []),
  );
  const selected = selectedRungIds ? Array.from(selectedRungIds) : localSelected;
  const setSelected = (ids: string[]) => {
    onSelectedRungIdsChange?.(ids);
    if (!selectedRungIds) setLocalSelected(ids);
  };

  const writes = useImpactAdvance({
    verdictByRung,
    context: writeContext,
    onWritten: () => {
      setSelected([]);
      setEpoch((value) => value + 1);
    },
  });
  const settingsFix = useImpactSettingsFix({
    onFixed: (outcomes: SettingsFixOutcome[]) => {
      const settleEpoch = epoch + 1;
      pendingFixesRef.current = [
        ...pendingFixesRef.current,
        ...outcomes.map((outcome) => ({
          outcome,
          settleEpoch,
          before: rows
            .filter((row) => row.verdict.agent_id === outcome.agentId)
            .map((row) => ({ rungId: row.id, mandateKey: row.mandateKey, tier: row.tier, versions: row.versions })),
        })),
      ];
      setPendingFixes(pendingFixesRef.current);
      setEpoch((value) => value + 1);
    },
  });
  const busy = writes.busy !== null || settingsFix.busy;
  /** A drift row whose settings check found something the fixer may repair (R13). */
  const isSettingsFixable = (row: BatchRow): boolean =>
    mode === "post_batch" &&
    row.tier === "drift" &&
    settingsSignalOf(row.verdict).state === "changed" &&
    isBatchActionable(row.verdict, writeContext);
  const fixableRows = rows.filter(isSettingsFixable);
  const fixableAgents = new Set(fixableRows.map((row) => row.verdict.agent_id)).size;
  const fixAllSettings = () => void settingsFix.fix(fixableRows.map((row) => row.verdict));
  const fixOne = (row: BatchRow) => void settingsFix.fix([row.verdict]);

  const isSelectable = (row: BatchRow): boolean =>
    mode === "dry_run"
      ? row.tier === "safe" || row.tier === "drift" || row.tier === "red"
      : isBatchActionable(row.verdict, writeContext);

  const rowsWithResults = rows.map((row) => ({
    ...row,
    resultStatus: writes.resultByRung.get(row.id)?.status ?? "",
  }));

  const advanceAllSafe = () =>
    void writes.advance(
      rows.filter((row) => row.tier === "safe" && isBatchActionable(row.verdict, writeContext)).map((row) => row.verdict),
      `${batchLabel}: all safe`,
    );
  const advanceSelected = (selectedRows: BatchRow[]) =>
    void writes.advance(
      selectedRows.filter((row) => isBatchActionable(row.verdict, writeContext)).map((row) => row.verdict),
      `${batchLabel}: ${selectedRows.length} selected`,
    );
  const advanceOne = (row: BatchRow) =>
    void writes.advance([row.verdict], `${batchLabel}: ${row.mandateKey}`);

  const openOne = (row: BatchRow) =>
    openMandateWindow({
      initialMandateKey: row.mandateKey,
      mandateKeys: [row.mandateKey],
      initialView: "admin",
      surfaceName: surfaceName ?? "impact-batch",
    });

  const columns: MatrxColumnDef<BatchRow>[] = [
      {
        id: "tier",
        accessorKey: "tier",
        header: "Pile",
        filter: "select",
        filterOptions: TIER_FILTER_OPTIONS,
        sortValue: (r) => BATCH_TIER_ORDER.indexOf(r.tier),
        width: 130,
        cell: (r) => (
          <Badge
            variant="outline"
            className={BATCH_TIER_META[r.tier].toneClassName}
            title={BATCH_TIER_META[r.tier].meaning}
          >
            {BATCH_TIER_META[r.tier].label}
          </Badge>
        ),
      },
      {
        id: "mandateKey",
        accessorKey: "mandateKey",
        header: "Mandate",
        filter: "text",
        width: 220,
        cell: (r) => (
          <div className="flex min-w-0 flex-col gap-0.5" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="truncate text-left font-mono text-[11px] hover:underline"
              title="Open this mandate in place"
              onClick={() => openOne(r)}
            >
              {r.mandateKey}
            </button>
            <span className="text-[10px] text-muted-foreground">{r.rungLabel}</span>
          </div>
        ),
      },
      {
        id: "agentName",
        accessorKey: "agentName",
        header: "Agent",
        filter: "text",
        width: 180,
        cell: (r) => (
          <div onClick={(event) => event.stopPropagation()}>
            <EntityRef
              token="agent"
              id={r.verdict.agent_id}
              name={r.agentName}
              href={agentHref(r.verdict.agent_id, null)}
            />
            {r.verdict.lineage_path && r.verdict.lineage_path.length > 1 ? (
              <span
                className="block text-[10px] text-muted-foreground"
                title={`Reached through lineage: ${r.verdict.lineage_path
                  .map((step) => step.agent_name)
                  .join(" → ")}`}
              >
                {focusAgentId
                  ? r.verdict.lineage_path.map((step) => step.agent_name).join(" → ")
                  : `via duplicate of ${r.verdict.lineage_path[0]?.agent_name}`}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "versions",
        accessorKey: "versions",
        header: mode === "dry_run" ? "Pin → proposed" : "Pin → newest",
        filter: "text",
        width: 110,
        cell: (r) => (
          <span className="inline-flex items-center gap-1 tabular-nums text-xs">
            {pinnedLabelOf(r.verdict)}
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            {mode === "dry_run" ? "proposed" : newestLabelOf(r.verdict)}
          </span>
        ),
      },
      {
        id: "grade",
        accessorKey: "grade",
        header: "Grade",
        filter: "select",
        filterOptions: IMPACT_GRADE_ORDER.slice()
          .reverse()
          .map((grade) => ({ value: grade, label: GRADE_META[grade].label })),
        sortValue: (r) => IMPACT_GRADE_ORDER.indexOf(r.grade),
        defaultSortDirection: "desc",
        width: 110,
        cell: (r) => <GradeHover verdict={r.verdict} />,
      },
      {
        id: "settingsState",
        accessorKey: "settingsState",
        header: "Settings",
        filter: "select",
        filterOptions: [
          { value: "clean", label: "Clean" },
          { value: "changed", label: "Changed" },
          { value: "unmeasured", label: "Unmeasured" },
        ],
        width: 110,
        cell: (r) => {
          const signal = settingsSignalOf(r.verdict);
          if (signal.state === "clean") {
            return (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" /> clean
              </span>
            );
          }
          return (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-amber-700 dark:text-amber-400"
              title={signal.sentence}
            >
              {signal.state}
            </Badge>
          );
        },
      },
      {
        id: "resultStatus",
        accessorKey: "resultStatus",
        header: mode === "dry_run" ? "Why not in the batch" : "Result",
        filter: "text",
        width: 260,
        cell: (r) => {
          const result = writes.resultByRung.get(r.id);
          if (result) return <AdvanceResultBadge result={result} />;
          if (r.tier === "blocked") {
            if (r.ownerUserId) {
              return (
                <span className="inline-flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                  <UserRound className="h-3 w-3" />
                  Theirs to advance —
                  <AdminUserRef
                    userId={r.ownerUserId}
                    name={ownerNames.get(r.ownerUserId) ?? null}
                    hideEmail
                    className="inline-flex"
                  />
                </span>
              );
            }
            const blocker = r.verdict.blocker;
            const eligibility = batchEligibilityOf(r.verdict, writeContext);
            return (
              <span className="text-[11px] text-muted-foreground">
                {blocker
                  ? `${BLOCKER_META[blocker].label}: ${BLOCKER_META[blocker].remedy}`
                  : eligibility.batchable
                    ? ""
                    : eligibility.why}
                {r.verdict.blocker === "set_aside" && r.verdict.set_aside_reason
                  ? ` “${r.verdict.set_aside_reason}”`
                  : ""}
              </span>
            );
          }
          if (r.tier === "current") {
            return <span className="text-[11px] text-muted-foreground">Already current.</span>;
          }
          const tooYoung = tooYoungReasonOf(r.verdict);
          if (tooYoung) {
            return (
              <span className="text-[11px] text-muted-foreground" title="Not automatic — a person may still advance it.">
                {tooYoung}.
              </span>
            );
          }
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: "actions",
        header: "",
        width: 200,
        sortable: false,
        cell: (r) => (
          <div className="flex flex-wrap items-center gap-1" onClick={(event) => event.stopPropagation()}>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[11px]"
              title="Open this mandate in place — review its settings, test it, or fix why it is set aside."
              onClick={() => openOne(r)}
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </Button>
            {isSettingsFixable(r) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                className="h-6 gap-1 px-1.5 text-[11px]"
                title="Repair the flagged settings on the agent's newest version and save it as a new version (the same fixer as the builder's Fix all), then grade this pin again. The pin does not move."
                onClick={() => fixOne(r)}
              >
                <Wrench className="h-3 w-3" />
                Fix settings
              </Button>
            ) : null}
            {mode === "post_batch" && isBatchActionable(r.verdict, writeContext) && r.tier !== "safe" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                className="h-6 gap-1 px-1.5 text-[11px] text-rose-700 dark:text-rose-400"
                title="Move this pin even though the check found something — the next dialog says exactly what moves."
                onClick={() => advanceOne(r)}
              >
                <FastForward className="h-3 w-3" />
                Advance anyway
              </Button>
            ) : null}
            {mode === "post_batch" && isBatchActionable(r.verdict, writeContext) && r.tier === "safe" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                className="h-6 gap-1 px-1.5 text-[11px]"
                title="Move this one pin to the newest saved version."
                onClick={() => advanceOne(r)}
              >
                <FastForward className="h-3 w-3" />
                Advance
              </Button>
            ) : null}
          </div>
        ),
      },
  ];

  const safeCount = rows.filter((row) => row.tier === "safe" && isBatchActionable(row.verdict, writeContext)).length;
  const hasScope = readScopes.length > 0;

  return (
    <div className={`flex h-full min-h-0 flex-col gap-2 ${compact ? "" : "p-2"}`}>
      {/* The headline — the sentence Arman asked for, plus what the read withheld. */}
      <div className="space-y-1 rounded-md border border-border bg-card px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {mode === "dry_run" ? (
            <Badge variant="outline" className="gap-1 border-sky-500/40 text-sky-700 dark:text-sky-400">
              <FlaskConical className="h-3 w-3" /> Preview
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              After the change
            </Badge>
          )}
          {sourceSentence ? <span className="font-medium">{sourceSentence}</span> : null}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 px-1.5 text-[11px]"
            disabled={loading || !hasScope || !sessionReady}
            title="Grade again against the server."
            onClick={() => setEpoch((value) => value + 1)}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Re-grade
          </Button>
        </div>
        {!hasScope ? (
          <p className="text-muted-foreground">No agents in scope — nothing to grade.</p>
        ) : organizationUnanswered ? (
          <OrganizationContextNotice
            state={organizationState}
            compact
            description="No organization is selected, so nothing can be graded — choose one from the organization picker in the header and this fills in by itself."
          />
        ) : !sessionReady ? (
          <p className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Waiting for your session to finish loading…
          </p>
        ) : error ? (
          <p className="flex items-start gap-1.5 text-rose-700 dark:text-rose-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Grades are unavailable — every pin here is unknown, not safe. {error}
            </span>
            <ErrorAlchemyMenu error={error} />
          </p>
        ) : loading && !impact ? (
          <p className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Grading against the server…
          </p>
        ) : impact ? (
          <>
            <p className="font-medium">{describeBatch(counts)}</p>
            {mode === "dry_run" ? (
              <p className="text-muted-foreground">
                Graded as if the change were already applied. Nothing can be advanced from a
                preview — pick the pins to move, and this panel returns after the change with
                those pre-selected.
              </p>
            ) : null}
            {/* ONE sentence each, from the merged counts (D1, D4) — never a
                page's own sentence beside a summed total. */}
            {impact.withheldSentences.map((sentence) => (
              <p key={sentence} className="text-amber-700 dark:text-amber-400">
                {sentence}
              </p>
            ))}
            {impact.unknownSentences.map((sentence) => (
              <p key={sentence} className="text-amber-700 dark:text-amber-400">
                {sentence}
              </p>
            ))}
          </>
        ) : null}
        {/* The three piles, in words, so no colour has to be decoded. */}
        {impact && !error ? (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
            {BATCH_TIER_ORDER.map((tier) => (
              <span key={tier} className="inline-flex items-center gap-1" title={BATCH_TIER_META[tier].meaning}>
                <Badge variant="outline" className={`px-1 text-[10px] ${BATCH_TIER_META[tier].toneClassName}`}>
                  {BATCH_TIER_META[tier].label}
                </Badge>
                <span className="tabular-nums">{counts.byTier[tier]}</span>
              </span>
            ))}
            {mode === "post_batch" ? (
              <div className="ml-auto flex flex-wrap items-center gap-1">
                {fixableRows.length > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    disabled={busy}
                    title={`Repair the flagged settings on ${fixableAgents} agent${fixableAgents === 1 ? "" : "s"} (${fixableRows.length} pin${fixableRows.length === 1 ? "" : "s"} in the Check settings pile), each saved as a new version, then grade them again. Rows the fixer cannot help say so and keep their Advance door.`}
                    onClick={fixAllSettings}
                  >
                    {settingsFix.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
                    Fix all fixable ({fixableRows.length})
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  disabled={busy || safeCount === 0}
                  title={BATCH_TIER_META.safe.meaning}
                  onClick={advanceAllSafe}
                >
                  {writes.busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Advance all safe ({safeCount})
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {focusAgentId && impact && !error ? (
        <div className="flex flex-wrap items-center gap-1 text-xs" role="tablist" aria-label="This agent">
          {(
            [
              { id: "pins", label: "Pins", icon: ListChecks, title: "Every job this change reaches, graded." },
              { id: "history", label: "Version history", icon: History, title: "The pinned version beside the newest one — what you just changed." },
              { id: "test", label: "Quick test", icon: FlaskConical, title: "Run a reached job on the pinned version and the newest one." },
            ] as const
          ).map((tab) => (
            <Button
              key={tab.id}
              size="sm"
              role="tab"
              aria-selected={section === tab.id}
              variant={section === tab.id ? "secondary" : "ghost"}
              className="h-7 gap-1 px-2 text-xs"
              title={tab.title}
              onClick={() => setSection(tab.id)}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </Button>
          ))}
        </div>
      ) : null}

      <SettingsFixReportCard
        pending={pendingFixes}
        reports={fixReports}
        onDismiss={() => setFixReports([])}
      />

      <AdvanceResultsCard
        batches={writes.batches}
        verdictsOf={writes.verdictsOf}
        busy={writes.busy}
        onRevert={(batch, rowId) => void writes.revert(batch, rowId)}
        onDismiss={writes.clear}
      />

      {focusAgentId && impact && !error && section !== "pins" ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-card">
          <ImpactAgentCompanion
            focusAgentId={focusAgentId}
            verdicts={impact.verdicts}
            section={section}
          />
        </div>
      ) : null}

      <div className={`min-h-0 flex-1 overflow-hidden ${section !== "pins" ? "hidden" : ""}`}>
        <MatrxDataTable
          tableId={`impact-batch-${mode}`}
          data={rowsWithResults}
          columns={columns}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.mandateKey} ${r.agentName}`}
          isLoading={loading && !impact}
          isFetching={loading}
          pageSize={compact ? 25 : 50}
          density="condensed"
          detail={{ enabled: false }}
          copy={false}
          emptyState={{
            title: hasScope ? "No pins on these agents" : "Nothing to grade",
            description: hasScope
              ? "None of the agents in scope holds a mandate default or binding you can see."
              : "No agents were named.",
          }}
          toolbar={{ search: true, searchPlaceholder: "Search mandates, agents…" }}
          onRowOpen={(r) => openOne(r)}
          selection={{
            selectedIds: selected,
            onSelectedIdsChange: setSelected,
            noun: "pin",
            isRowSelectable: isSelectable,
            actions: (selectedRows) =>
              mode === "post_batch" ? (
                <Button
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  disabled={busy || selectedRows.length === 0}
                  onClick={() => advanceSelected(selectedRows)}
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  Advance selected ({selectedRows.length})
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {selectedRows.length} chosen to advance after the change
                </span>
              ),
          }}
        />
      </div>
    </div>
  );
}
