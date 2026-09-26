"use client";

/**
 * Mandates console — the admin LIST of every DB-managed mandate: the coverage
 * board, goal + coverage + health columns, filters, enable/disable, Copy for
 * AI. Canonical MatrxDataTable surface: every column sorts and filters.
 *
 * 🚨 ONE MANDATE UI (2026-08-29). This console owns the LIST and nothing else.
 * Every way of opening one mandate — row click, the coverage board's named
 * rows, the drift strip, the right-click menu, `?mandate=` — lands on the
 * SAME workspace page the rest of the product uses
 * (`/administration/mandates/[key]`, the admin shell around the very
 * same `MandateWorkspace` as `/mandates/[key]`). The old side-panel
 * drawer is no longer on any path from here.
 *
 * System-of-record: common-docs/systems/intelligence/mandates/STATE.md.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import AppLink from "@/components/navigation/AppLink";
import { useRouter, useSearchParams } from "next/navigation";
import {
  booleanUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@ai-matrx/kit/url-state";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  BrainCircuit,
  History,
  Loader2,
  Link2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast, recordToast, dismissRecordToasts } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  CONTEXT_MENU_ENTITY_KEY,
  type ContextMenuEntityRef,
  type ContextMenuExtraSection,
  type ResolvedContextMenuContext,
} from "@/features/context-menu-v3/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { isJsonObject } from "@/types/json";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useServerOrganizationId } from "@/lib/api/useServerOrganizationId";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import {
  selectAccessToken,
  selectAuthReady,
} from "@/lib/redux/selectors/userSelectors";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentLineageIndex,
  selectBuiltinAgents,
} from "@/features/agents/redux/agent-definition/selectors";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { getAgentModeHref } from "@/features/agents/components/shared/AgentModeController";
import {
  MatrxDataTable,
  useTableUrlState,
  type MatrxColumnDef,
  type MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MANDATES_SURFACE_NAME,
  AGENT_MANDATES_WRITE_TARGETS,
  createMandatesScope,
  type MandateContract,
  type MandateDetail,
  type MandateExemplar,
  type MandateExemplarDraft,
  type MandateOverrideSummary,
  type MandateSummary,
  type MandatesHealthSummary,
} from "@/features/surfaces/manifests/mandates.manifest";
import { onMandateCacheInvalidated } from "@/features/mandates/service";
import { parseMandateContract } from "@/features/mandates/overrides";
import {
  fetchMandateCatalogue,
  type MandateCatalogue,
} from "@/features/mandates/catalogue";
import { resolveMandateGoal } from "@/features/mandates/goal";
import { MandateCoverageBoard } from "./MandateCoverageBoard";
import {
  COVERAGE_META,
  buildCoverageIndex,
  coverageBucketOf,
  fetchMandateCoverage,
  scopedCoverageOf,
  type MandateCoverageBucket,
  type MandateCoverageResponse,
} from "@/features/mandates/coverage";
import { readMandateBenchSnapshot } from "./bench-draft";
import { CompactMandateText, MandateInputsCell, MandateOutputCell } from "./mandate-contract-cells";
import { fetchProvisions } from "@/features/mandates/provisions";
import { adminMandateHref } from "@/features/mandates/browse/url-compat";
import {
  CreateSystemTwinButton,
  LineageChip,
  RebindToTwinButton,
} from "./mandate-actions";
import {
  HEALTH_CLASS,
  HEALTH_HINT,
  HEALTH_PRIORITY,
  SYSTEM_AGENT_BASE,
  USER_AGENT_BASE,
  agentHref,
  buildRow,
  type MandateRow,
} from "./mandate-health";
import {
  agentHolderOfBinding,
  contractOfMandate,
  holderOfMandate,
  isFloatingMandate,
} from "@/lib/supabase/mandateStorage";
import {
  SYSTEM_HOME,
  isMandateListRefusal,
} from "@/features/mandates/list-door";
import {
  fetchMandateCodeTruthReport,
  fetchMandateConsoleData,
  softDeleteMandate,
  updateMandateDefinition,
  type MandateAgentOption,
  type MandateCodeTruth,
  type MandateConsoleData,
} from "./service";
import {
  BLOCKER_META,
  GRADE_META,
  IMPACT_GRADE_ORDER,
  batchEligibilityOf,
  blockerKeyOf,
  fetchStandingImpact,
  groupImpactByMandate,
  isBehindLatest,
  isSafeGreen,
  type ImpactBlocker,
  type ImpactGrade,
  rungIdentityOf,
  type ImpactVerdict,
  type StandingImpact,
} from "./impact";
import { useImpactAdvance } from "./impact-advance";
import { useOpenImpactBatchWindow } from "@/features/overlays/openers/impactBatchWindow";
import {
  filterMandateConsoleRows,
  isMandateConsoleDiscovering,
  mandateConsoleSearchText,
  processMandateConsoleRows,
  pruneMandateSelectionToVisible,
} from "./mandate-console-discovery";
import {
  AdvanceResultsCard,
  ImpactBlockerCell,
  ImpactGradeCell,
  ImpactLegend,
  StandingImpactStrip,
  type UngradedReason,
} from "./impact-cells";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/** MandateRow → the manifest's summary shape (surface scope + agent context). */
function toMandateSummary(r: MandateRow): MandateSummary {
  return {
    id: r.id,
    mandate_key: r.mandateKey,
    label: r.label,
    agent_name: r.agentName,
    pin: r.pinLabel,
    drift: r.drift,
    health: r.health,
    code_truth_drift: r.codeTruth?.drift ?? null,
    bound_agent_drift: r.codeTruth?.bound_agent_drift ?? null,
    code_variables: r.codeTruth?.code_variables ?? [],
    bound_agent_variables: r.codeTruth?.bound_agent?.declared_variables ?? [],
    input_kind: r.inputKind,
    output_kind: r.outputKind,
    overrides_count: r.overridesCount,
    is_enabled: r.isEnabled,
    is_placeholder: r.isPlaceholder,
  };
}

/** Full workbench detail for the selected mandate — pin state + agent type. */
function toMandateDetail(
  row: MandateRow,
  data: MandateConsoleData,
  newestSnapshotByAgent: Record<string, number | null>,
): MandateDetail {
  const holder = holderOfMandate(row.mandate);
  const pinnedVersion = holder.versionId
    ? data.versionsById[holder.versionId]
    : undefined;
  const agentId = holder.holderId ?? pinnedVersion?.agentId ?? null;
  const agent = agentId ? data.agentsById[agentId] : undefined;
  return {
    ...toMandateSummary(row),
    description: row.mandate.description,
    agent_type: agent?.agentType ?? null,
    use_latest: isFloatingMandate(row.mandate),
    pinned_version: pinnedVersion?.versionNumber ?? null,
    // The newest SAVED snapshot from the impact read — never `agent.version`,
    // which is the optimistic-concurrency counter and not a version (R7/D10).
    latest_version: agentId ? (newestSnapshotByAgent[agentId] ?? null) : null,
  };
}

/**
 * A console row: the health row PLUS the two facts that come from outside the
 * DB — the GOAL (an aidream code declaration, read through `GET /mandates`)
 * and COVERAGE (the server's green/orange/red verdict). Neither is a column on
 * `agent.mandate`, so neither can be derived here.
 */
export interface ConsoleRow extends MandateRow {
  goal: string | null;
  coverage: MandateCoverageBucket;
  /** Coverage tooltip: the leader carrying it, or why nothing does. */
  coverageDetail: string | null;
  /**
   * THE SERVER'S VERDICT on this mandate's own default rung (`POST
   * /mandates/impact`) — the one grader (R12). Null with `ungraded` saying why.
   */
  defaultVerdict: ImpactVerdict | null;
  /** The mandate's binding rungs, graded separately by the same read. */
  bindingVerdicts: ImpactVerdict[];
  ungraded: UngradedReason | null;
  /** Filter/sort values — "ungraded" is its own honest bucket, never clean. */
  impactGrade: ImpactGrade | "ungraded";
  impactBlocker: ImpactBlocker | "none" | "ungraded";
  /** The default rung — or any binding rung — trails the newest saved version. */
  behindLatest: boolean;
}

/**
 * THE ONE record reference for a console row. The context menu's per-row entity
 * (`CONTEXT_MENU_ENTITY_KEY`) and a record-naming toast's identity
 * (`recordToast`, `lib/toast.ts`) are the same fact about the same row, so they
 * are built in one place — two shapes would drift, and a toast carrying the
 * wrong id cannot be withdrawn when the record goes.
 */
const mandateRecordRef = (row: ConsoleRow): ContextMenuEntityRef => ({
  type: "mandate",
  id: row.id,
  title: row.mandateKey,
});

/** The table id — also the prefix of the URL key that holds the open row. */
export const MANDATES_TABLE_ID = "mandates";

/** Named jump buttons before the drift strip starts counting. */
export const DRIFT_STRIP_NAMED_CAP = 6;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function humanRow(r: ConsoleRow): string {
  return [
    `Mandate: ${r.mandateKey}${r.label ? ` (${r.label})` : ""}`,
    ...(r.goal ? [`Goal: ${r.goal}`] : []),
    `Coverage: ${COVERAGE_META[r.coverage].label}${r.coverageDetail ? ` — ${r.coverageDetail}` : ""}`,
    `Agent: ${r.agentName}`,
    `Pin: ${r.pinLabel}${r.drift ? ` — ${r.drift}` : ""}`,
    `Health: ${r.health}`,
    ...(r.codeTruth
      ? [
          `Code passes: ${r.codeTruth.code_variables.join(", ") || "none"}`,
          `Bound agent declares: ${r.codeTruth.bound_agent?.declared_variables.join(", ") || "none"}`,
        ]
      : []),
    `Inputs: ${r.inputSummary}`,
    `Output: ${r.outputSummary}`,
    `Bindings: ${r.overridesCount}`,
    `Enabled: ${r.isEnabled ? "yes" : "no"}`,
  ].join("\n");
}

export function MandatesConsole() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  // Every door out of this list goes to the ONE mandate page. `pendingKey`
  // puts the loading state on the element that was clicked and guards the
  // duplicate click, per the repo's navigation rule.
  const [navPending, startNav] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const openMandatePage = useCallback(
    (mandateKeyOrId: string) => {
      if (navPending) return;
      setPendingKey(mandateKeyOrId);
      startNav(() => router.push(adminMandateHref(mandateKeyOrId)));
    },
    [navPending, router],
  );
  const selectedOrganizationId = useServerOrganizationId();
  // 🚨 THE FOURTH STATE (R37). This used to read `orgBootstrapResolved` and
  // call resolved-with-no-id the refusal — but `setOrgBootstrapFailure` sets
  // resolved TRUE, so a failed read told a member of thirteen organizations to
  // pick one. The gate's discriminant keeps the two terminal answers apart.
  const { organizationState } = useOrganizationRequired();
  const accessToken = useAppSelector(selectAccessToken);
  const authReady = useAppSelector(selectAuthReady);
  const [data, setData] = useState<MandateConsoleData | null>(null);
  const [codeTruthByMandateKey, setCodeTruthByMandateKey] = useState<
    Record<string, MandateCodeTruth>
  >({});
  const [codeTruthError, setCodeTruthError] = useState<string | null>(null);
  // Coverage + the code declarations. Both come from aidream and BOTH degrade
  // honestly: a failure names itself instead of rendering an empty board or a
  // blank Goal column that reads as "no goal declared".
  const [coverage, setCoverage] = useState<MandateCoverageResponse | null>(
    null,
  );
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<MandateCatalogue | null>(null);
  const [catalogueError, setCatalogueError] = useState<string | null>(null);
  const [coverageFilter, setCoverageFilter] =
    useState<MandateCoverageBucket | null>(null);
  const [loading, setLoading] = useState(true);
  /** Settled fact: the bootstrap resolved and no organization is selected. */
  // Derived at render, never set in the effect: the two terminal organization
  // answers, each rendered by the ONE notice (the failed one carries Retry).
  const organizationUnanswered =
    organizationState === "required" || organizationState === "unavailable";
  /**
   * The list door's own words when it refuses this caller the system home.
   * The (admin) route tree admits ANY Matrx admin level, while the door
   * gates on `public.is_platform_admin()` — so a person can legitimately
   * reach this URL and be refused the corpus behind it. That refusal is
   * printed, never toasted-and-forgotten behind an empty table.
   */
  const [systemHomeRefusal, setSystemHomeRefusal] = useState<string | null>(
    null,
  );
  const [fetching, setFetching] = useState(false);
  // SELECTION LIVES IN THE URL — the table's OWN `urlState.selectedRow` key,
  // read and written here so the console's programmatic openers (the coverage
  // board, the drift strip, the right-click menu, the `?mandate=` door and the
  // agent write target) and a row click are the SAME selection. The console
  // used to hold this in component state with the table's persistence switched
  // OFF, so a refresh — or any navigation back — closed the open workbench.
  const [urlSelectedId, setUrlSelectedId] = useUrlState(
    `table.${MANDATES_TABLE_ID}.row`,
    stringUrlCodec(),
  );
  const selectedId = urlSelectedId || null;
  const setSelectedId = useCallback(
    (id: string | null) => setUrlSelectedId(id ?? ""),
    [setUrlSelectedId],
  );
  // DEEP LINK — `?mandate=<mandate_key>` is the LEGACY door (it used to open
  // the console's drawer). It now forwards to that mandate's page, so an old
  // link lands on the same UI as a new one rather than on a highlighted row.
  const searchParams = useSearchParams();
  const deepLinkKey = searchParams.get("mandate");
  const tableUrlState = useTableUrlState({
    tableId: MANDATES_TABLE_ID,
    defaultPageSize: 50,
  });
  const hasTableSearch = tableUrlState.state.search.trim().length > 0;
  const hasTableFilter = isMandateConsoleDiscovering(
    {
      ...tableUrlState.state,
      search: "",
    },
  );
  const deepLinkedRef = useRef<string | null>(null);

  // Canonical agent listing: the Redux agent-definition slice, filtered to
  // SYSTEM agents. A mandate default must be a system (builtin) agent — an
  // admin pinning a personal/shared agent here would break every user the
  // mandate serves. Never hand-query agent.definition for a picker.
  const builtinAgents = useAppSelector(selectBuiltinAgents);
  // Lineage for every agent the slice holds — derived, no extra queries. This
  // is how the console can answer "does a system copy of this already exist?"
  // instead of just complaining that the pin is personal.
  const lineageIndex = useAppSelector(selectAgentLineageIndex);
  const agentOptions = useMemo<MandateAgentOption[]>(
    () =>
      builtinAgents.map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
        description: a.description ?? null,
        category: a.category ?? null,
      })),
    [builtinAgents],
  );

  // Every setState lives in an async callback — never synchronously in the
  // effect (react-hooks/set-state-in-effect). Initial state is loading=true;
  // the button-driven reload may flip `fetching` synchronously (event handler).
  const fetchData = useCallback(() => {
    Promise.allSettled([
      // 🚨 THE CONSOLE IS THE `system` HOME OF THE ONE LIST DOOR. It lists what
      // the PLATFORM ships and nothing else — an organization's own mandates
      // belong to that organization's people, on /mandates and on the org's
      // settings page. Both of this console's unscoped reads are gone with it
      // (REVIEW-one-resolution.md §8).
      fetchMandateConsoleData({ home: SYSTEM_HOME }),
      fetchMandateCodeTruthReport(dispatch),
      fetchMandateCoverage(dispatch),
      fetchMandateCatalogue(dispatch, { refresh: true }),
    ])
      .then(([consoleResult, truthResult, coverageResult, catalogueResult]) => {
        if (coverageResult.status === "rejected") {
          setCoverageError(describe(coverageResult.reason));
        } else {
          setCoverage(coverageResult.value);
          setCoverageError(null);
        }
        if (catalogueResult.status === "rejected") {
          setCatalogueError(describe(catalogueResult.reason));
        } else {
          setCatalogue(catalogueResult.value);
          setCatalogueError(null);
        }
        if (consoleResult.status === "rejected") {
          const message = describe(consoleResult.reason);
          if (isMandateListRefusal(consoleResult.reason)) {
            // A refusal is a settled fact about this account, not a transient
            // failure: say it on the page, with what to do, and do not offer a
            // reload that will refuse again.
            setSystemHomeRefusal(message);
          } else {
            setSystemHomeRefusal(null);
            toast.error(`Failed to load mandates: ${message}`);
          }
        } else {
          setSystemHomeRefusal(null);
          setData(consoleResult.value);
        }
        if (truthResult.status === "rejected") {
          const message =
            truthResult.reason instanceof Error
              ? truthResult.reason.message
              : String(truthResult.reason);
          setCodeTruthError(message);
          // `callApi` already records the request-level failure once with the
          // endpoint and transport class. Keep the local breadcrumb without
          // creating a second, poorer system_error for the same request.
          console.warn("[mandates] code truth unavailable", truthResult.reason);
        } else {
          setCodeTruthByMandateKey(
            Object.fromEntries(
              truthResult.value.mandates.map((s) => [s.mandate_key, s]),
            ),
          );
          setCodeTruthError(null);
        }
      })
      .finally(() => {
        setLoading(false);
        setFetching(false);
      });
  }, [dispatch]);

  const reload = useCallback(() => {
    setFetching(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!accessToken) return;
    dispatch(fetchAgentsListFull());
  }, [accessToken, dispatch]);

  // `callApi` requires the explicitly selected organization. On a cold tab,
  // the console can mount before app-context hydration finishes; firing here
  // at null permanently froze Coverage, Goal and Code truth on the local
  // preflight error even though the shell showed the organization moments
  // later. Wait for the same Redux authority the transport reads, and refetch
  // whenever the user switches organizations.
  //
  // 🚨 "NO ORG YET" IS NOT "STILL READING" — the third instance of this class
  // (walk, 2026-08-31: the console intermittently sticks in its loading
  // skeleton and recovers later). `loading` starts `true`, so a bare early
  // return here leaves the skeleton up FOREVER whenever the organization has
  // not hydrated — and if the bootstrap resolves with no organization selected
  // at all, it never recovers and never says why. Exactly the shape already
  // fixed in `useMandateInputSurface` and in the two readers V3 F4 caught.
  //
  // Before the bootstrap resolves, "loading" is the truth and nothing flashes.
  // Once it has resolved and there is still no organization, that is a settled
  // fact about this session: stop loading and say it, with the action that
  // fixes it.
  useEffect(() => {
    // Organization context and browser authentication hydrate independently.
    // Starting either the direct Supabase reads or callApi without the token
    // turns one cold-tab race into both a session-required DB failure and a
    // token_required API failure. The protected shell owns the signed-out
    // state; this surface waits until its Redux auth authority is settled.
    if (!authReady || !accessToken) return;
    if (!selectedOrganizationId) {
      if (organizationState !== "resolving") {
        setLoading(false);
        setFetching(false);
      }
      return;
    }
    fetchData();
  }, [
    accessToken,
    authReady,
    fetchData,
    organizationState,
    selectedOrganizationId,
  ]);

  // Any mandate write anywhere — including a rebind made from the Linked Agent
  // Sync window (updateMandateDefinition fires the invalidation bus) — reloads
  // this console, so it never shows a stale pin after an out-of-band change.
  useEffect(() => onMandateCacheInvalidated(() => reload()), [reload]);

  const toggleEnabled = useCallback(
    async (row: ConsoleRow, enabled: boolean) => {
      try {
        await updateMandateDefinition(row.id, { is_enabled: enabled });
        recordToast.success(
          mandateRecordRef(row),
          `${row.mandateKey} ${enabled ? "enabled" : "disabled"}.`,
        );
        reload();
      } catch (error: unknown) {
        toast.error(
          `Update failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
    [reload],
  );

  const coverageIndex = useMemo(
    () => (coverage ? buildCoverageIndex(coverage) : {}),
    [coverage],
  );

  // ── THE ONE GRADER (Agent Change Impact I4, R12) ──────────────────────────
  // Every agent that holds a default or a binding on this console's mandates
  // is sent to `POST /mandates/impact`; the server grades every rung and says
  // what it withheld. A failed read makes every row UNKNOWN, never clean.
  const [impact, setImpact] = useState<StandingImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  // Bumped after every write so the grades are re-read from the server — a
  // moved pin is never shown as still behind on the strength of a local edit.
  const [impactEpoch, setImpactEpoch] = useState(0);
  const holderAgentIds = useMemo((): string[] => {
    if (!data) return [];
    const ids = new Set<string>();
    for (const mandate of data.mandates) {
      const holder = holderOfMandate(mandate);
      const agentId =
        holder.holderId ??
        (holder.versionId
          ? data.versionsById[holder.versionId]?.agentId
          : null);
      if (agentId) ids.add(agentId);
      for (const binding of data.bindingsByMandateId[mandate.id] ?? []) {
        const bindingHolder = agentHolderOfBinding(binding);
        const bindingAgent =
          bindingHolder.holderId ??
          (bindingHolder.versionId
            ? data.versionsById[bindingHolder.versionId]?.agentId
            : null);
        if (bindingAgent) ids.add(bindingAgent);
      }
    }
    return Array.from(ids).sort();
  }, [data]);
  useEffect(() => {
    if (holderAgentIds.length === 0) return;
    let cancelled = false;
    // `impactEpoch` is a deliberate re-read trigger, not a data input.
    void impactEpoch;
    fetchStandingImpact(dispatch, holderAgentIds)
      .then((report) => {
        if (cancelled) return;
        setImpact(report);
        setImpactError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setImpactError(describe(error));
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, holderAgentIds, impactEpoch]);
  const impactByMandate = useMemo(
    () => (impact ? groupImpactByMandate(impact.verdicts) : null),
    [impact],
  );
  // The newest SAVED snapshot per agent, from the read — the only "latest"
  // a row may print (D10). Unknown agents stay absent, never "current".
  const newestSnapshotByAgent = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const verdict of impact?.verdicts ?? []) {
      if (verdict.latest_version_number != null) {
        out[verdict.agent_id] = verdict.latest_version_number;
      }
    }
    return out;
  }, [impact]);

  const allRows = useMemo((): ConsoleRow[] => {
    if (!data) return [];
    return data.mandates
      .map((mandate) => {
        const base = buildRow(
          mandate,
          data,
          codeTruthByMandateKey[mandate.mandate_key],
          undefined,
          newestSnapshotByAgent,
        );
        const entry = coverageIndex[base.mandateKey];
        const grouped = impactByMandate?.get(base.mandateKey);
        const defaultVerdict = grouped?.defaultVerdict ?? null;
        const bindingVerdicts = grouped?.bindingVerdicts ?? [];
        const ungraded: UngradedReason | null = defaultVerdict
          ? null
          : !base.agentId
            ? "no_agent"
            : impactError
              ? "read_failed"
              : impactByMandate
                ? "not_returned"
                : "loading";
        // Behind latest is the SERVER's pin-vs-newest. An agent-held row the
        // read could not grade stays in the "behind" view whenever the local
        // pin says it drifts or the read failed — an unknown row is never
        // hidden as current.
        const behindLatest = defaultVerdict
          ? isBehindLatest(defaultVerdict) ||
            bindingVerdicts.some(isBehindLatest)
          : base.agentId != null &&
            (base.drift != null ||
              ungraded === "read_failed" ||
              ungraded === "not_returned");
        const impactGrade: ConsoleRow["impactGrade"] = defaultVerdict
          ? defaultVerdict.grade
          : "ungraded";
        const impactBlocker: ConsoleRow["impactBlocker"] = defaultVerdict
          ? blockerKeyOf(defaultVerdict)
          : "ungraded";
        return {
          defaultVerdict,
          bindingVerdicts,
          ungraded,
          impactGrade,
          impactBlocker,
          behindLatest,
          ...base,
          // THE ONE READER (`features/mandates/goal`): stored goal first, the
          // code catalogue as the fallback for rows the DB read missed. This
          // console already had the right precedence and the goal pane did
          // not — which is the whole of FIX-Q9.
          goal: resolveMandateGoal({
            stored: mandate.goal,
            catalogue: catalogue?.[base.mandateKey]?.goal,
          }).goal,
          coverage: coverageBucketOf(coverageIndex, base.mandateKey),
          coverageDetail: entry
            ? entry.bucket === "orange"
              ? (entry.leaderKey ?? entry.reason)
              : entry.reason
            : null,
        };
      })
      .sort(
        (left, right) =>
          HEALTH_PRIORITY[left.health] - HEALTH_PRIORITY[right.health] ||
          left.mandateKey.localeCompare(right.mandateKey),
      );
  }, [
    catalogue,
    codeTruthByMandateKey,
    coverageIndex,
    data,
    impactByMandate,
    impactError,
    newestSnapshotByAgent,
  ]);

  // 🚨 THE BOARD COUNTS THIS CONSOLE'S OWN ROWS. `GET /mandates/coverage`
  // classifies the WHOLE mandate corpus — every organization's — while this
  // console lists the `system` home of the one list door. Handing the board the
  // raw report made its tiles count, and its strips NAME, mandates the table
  // beside them correctly excluded (walk of v0.4.1718: the "Nothing assigned"
  // tile named an org-homed mandate). The server keeps the classification; the
  // scope is ours, taken from `allRows` — the rows the door admitted.
  //
  // `null` until BOTH have landed: a report with no rows yet is not a zero, and
  // the board prints "…"/"—" for a count it cannot know.
  const coverageView = useMemo(
    () =>
      coverage && data
        ? scopedCoverageOf(
            coverageIndex,
            allRows.map((row) => row.mandateKey),
          )
        : null,
    [allRows, coverage, coverageIndex, data],
  );

  // A coverage tile narrows the table's DATA (the tiles are the filter, the
  // Coverage column filters further). Same idiom as the surfaces readiness
  // rollup: the scoreboard IS the work order.
  // "Behind latest" is the default VIEW (Arman: "any of my mandates that
  // aren't running on the latest version"). It lives in the URL so a refresh
  // or a shared link keeps it; turning it off shows every mandate.
  const [behindOnly, setBehindOnly] = useUrlState(
    `table.${MANDATES_TABLE_ID}.behind`,
    booleanUrlCodec(true),
  );
  const rows = useMemo(
    () =>
      filterMandateConsoleRows(allRows, {
        coverageFilter,
        behindOnly,
        discovering: false,
      }),
    [allRows, behindOnly, coverageFilter],
  );
  const [displayedRows, setDisplayedRows] = useState<ConsoleRow[]>(rows);

  // The success measure and the grade counts, over EVERY row (not the view).
  const impactCounts = useMemo(() => {
    const behindCounts: Record<string, number> = {};
    let staleSafe = 0;
    let blockedBehind = 0;
    for (const row of allRows) {
      const verdict = row.defaultVerdict;
      if (!verdict || !isBehindLatest(verdict)) continue;
      behindCounts[verdict.grade] = (behindCounts[verdict.grade] ?? 0) + 1;
      if (verdict.blocker) blockedBehind += 1;
      if (isSafeGreen(verdict)) staleSafe += 1;
    }
    return { behindCounts, staleSafe, blockedBehind };
  }, [allRows]);

  // THE PROVISION IS THE INPUT DECLARATION. `required_variables` is stripped
  // for every provisioned mandate, so the Inputs column has to read the offer
  // to say anything true. One batched fetch for every provision on screen
  // (fetchProvisions chunks + caches); until it lands the cell names the
  // provision key rather than claiming "user text only".
  const [offersByProvision, setOffersByProvision] = useState<
    Map<string, string[]>
  >(() => new Map());
  const provisionKeys = useMemo(
    () =>
      Array.from(
        new Set(
          allRows
            .map((row) => row.provisionKey)
            .filter((key): key is string => Boolean(key)),
        ),
      ).sort(),
    [allRows],
  );
  useEffect(() => {
    if (provisionKeys.length === 0) {
      setOffersByProvision(new Map());
      return;
    }
    let cancelled = false;
    fetchProvisions(provisionKeys)
      .then((offers) => {
        if (cancelled) return;
        const next = new Map<string, string[]>();
        for (const [key, offer] of offers) {
          next.set(
            key,
            offer.values.map((value) => value.name),
          );
        }
        setOffersByProvision(next);
      })
      .catch(() => {
        // Never break the console over the Inputs column — the cell falls back
        // to naming the provision key, which is still true.
      });
    return () => {
      cancelled = true;
    };
  }, [provisionKeys]);

  const codeAgentDriftRows = rows.filter(
    (row) => row.health === "code ↔ agent drift",
  );

  // ── The ONE right-click menu for the whole console ───────────────────────
  //
  // Delegates off `data-row-id` (stamped by `MatrxDataTable`'s `getRowId`),
  // same shape as the CRM/lists reference wirings. "Open" reuses the SAME
  // selection state the table's own row click and the `?mandate=` deep link
  // both drive — a right-clicked mandate opens the same detail panel, never a
  // second viewer.
  const [menuRow, setMenuRow] = useState<ConsoleRow | null>(null);

  const resolveMandateMenuTarget = (
    target: HTMLElement | null,
  ): ResolvedContextMenuContext | null => {
    const id = target?.closest?.("[data-row-id]")?.getAttribute("data-row-id");
    const row = id ? (allRows.find((r) => r.id === id) ?? null) : null;
    setMenuRow(row);
    if (!row) return null;
    return {
      content: humanRow(row),
      [CONTEXT_MENU_ENTITY_KEY]: mandateRecordRef(row),
    };
  };

  /**
   * Remove a mandate — soft, confirmed, and honest about the consequence.
   *
   * The confirm states what a person actually loses and what survives, because
   * "Are you sure?" tells them nothing they did not already know. It is a soft
   * delete: the row keeps its history and an admin can restore it, and saying
   * so is what makes this safe to offer on a list.
   */
  const removeMandate = async (row: ConsoleRow) => {
    const ok = await confirm({
      title: `Remove "${row.mandateKey}"?`,
      description:
        `Everywhere that runs this job stops finding it: the console, the pickers, and any call that names the key "${row.mandateKey}" will report it missing. ` +
        `Anything bound to it — every rung's Mandate Holder and mapping — stops applying with it. ` +
        `This is a soft removal: the record and its history are kept, so an admin can restore it if this was a mistake.`,
      confirmLabel: "Remove it",
      cancelLabel: "Keep it",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await softDeleteMandate(row.id);
      // The record is gone, so every sentence still on screen that NAMES it
      // has stopped being true — withdraw them before saying anything new.
      dismissRecordToasts(mandateRecordRef(row));
      recordToast.success(
        mandateRecordRef(row),
        `Removed "${row.mandateKey}" — resolving it now refuses.`,
      );
      reload();
    } catch (error: unknown) {
      // The service's own sentence (RLS refusal, already-removed) reaches the
      // person; this never invents a reason it does not have.
      toast.error(
        error instanceof Error ? error.message : "That job was not removed.",
      );
    }
  };

  const mandateMenuSections: ContextMenuExtraSection[] = (() => {
    const row = menuRow;
    if (!row) return [];
    const deepLinkHref = adminMandateHref(row.mandateKey);
    const items: ContextMenuExtraSection["items"] = [
      {
        kind: "item",
        id: "mandate-open",
        label: `Open "${row.mandateKey}"`,
        icon: ExternalLink,
        onSelect: () => openMandatePage(row.mandateKey),
      },
      {
        kind: "link",
        id: "mandate-open-new-tab",
        label: "Open in a new tab",
        icon: ExternalLink,
        href: deepLinkHref,
        target: "_blank",
      },
      {
        kind: "item",
        id: "mandate-copy-key",
        label: "Copy mandate key",
        icon: Copy,
        onSelect: () => {
          void navigator.clipboard.writeText(row.mandateKey).then(() => {
            toast.success("Copied mandate key");
          });
        },
      },
      {
        kind: "item",
        id: "mandate-copy-id",
        label: "Copy mandate id",
        icon: Copy,
        onSelect: () => {
          void navigator.clipboard.writeText(row.id).then(() => {
            toast.success("Copied mandate id");
          });
        },
      },
    ];
    // 🚨 REMOVE — the missing half of this console's CRUD (walk, 2026-08-31:
    // duplicate / export / split were offered and there was NO way to remove a
    // mandate from any screen a person normally uses). Destructive, so it is
    // last, styled as destructive, and its confirm names what actually happens
    // rather than asking "are you sure?".
    items.push({
      kind: "item",
      id: "mandate-delete",
      label: `Remove "${row.mandateKey}"`,
      icon: Trash2,
      destructive: true,
      onSelect: () => void removeMandate(row),
    });
    return [
      {
        id: "mandate-actions",
        label: "Mandate",
        anchor: "after-clipboard",
        items,
      },
    ];
  })();

  // Surface scope — built at Run time from live console state so agents
  // launched here know every mandate, the health roll-up, and the selected
  // mandate's pin state. Contract: mandates.manifest.ts.
  const getSurfaceScope = () => {
    const summaries = displayedRows.map(toMandateSummary);
    const health: MandatesHealthSummary = {
      ok: 0,
      behind_latest: 0,
      agent_archived: 0,
      not_a_system_agent: 0,
      unresolved_pin: 0,
      code_agent_drift: 0,
      code_contract_drift: 0,
      code_truth_import_failed: 0,
      no_holder_yet: 0,
    };
    for (const r of displayedRows) {
      if (r.behindLatest) health.behind_latest += 1;
      if (r.health === "ok") health.ok += 1;
      else if (r.health === "no Mandate Holder yet") health.no_holder_yet += 1;
      else if (r.health === "code ↔ agent drift") health.code_agent_drift += 1;
      else if (r.health === "code ↔ contract drift")
        health.code_contract_drift += 1;
      else if (r.health === "code truth import failed")
        health.code_truth_import_failed += 1;
      else if (r.health === "agent archived") health.agent_archived += 1;
      else if (r.health === "unresolved pin") health.unresolved_pin += 1;
      else health.not_a_system_agent += 1;
    }
    const selectedRow = selectedId
      ? (allRows.find((r) => r.id === selectedId) ?? null)
      : null;
    const overrides: MandateOverrideSummary[] | undefined =
      selectedRow && data
        ? (data.bindingsByMandateId[selectedRow.id] ?? []).map((b) => {
            const bindingHolder = agentHolderOfBinding(b);
            const versionAgentId = bindingHolder.versionId
              ? data.versionsById[bindingHolder.versionId]?.agentId
              : undefined;
            const agentKey = bindingHolder.holderId ?? versionAgentId;
            return {
              principal_type: b.principal_type,
              agent_name: agentKey
                ? (data.agentsById[agentKey]?.name ?? null)
                : null,
              config_overrides: isJsonObject(b.config_overrides)
                ? b.config_overrides
                : null,
              is_enabled: Boolean(b.is_enabled),
            };
          })
        : undefined;
    // The mandate's stored contract — the vocabulary a test case's `variables`
    // object has to fill. Parsed with the SAME helper the override editor's
    // contract check uses, never a re-read of the raw Json.
    let contract: MandateContract | undefined;
    if (selectedRow) {
      const parsed = parseMandateContract(
        contractOfMandate(selectedRow.mandate),
      );
      contract = {
        required_variables: parsed.requiredVariables,
        required_context_policies: parsed.requiredContextPolicyKeys,
        required_output_keys: parsed.requiredOutputKeys,
      };
    }
    // Bench state lives in MandateTestBench (a grandchild, mounted only while a
    // mandate workbench is open) and is published up through bench-draft.ts.
    // Cross-check the mandate id so a snapshot from a bench that has not caught
    // up with the selection is never reported as this mandate's.
    const bench = readMandateBenchSnapshot();
    const liveBench =
      bench && selectedRow && bench.mandateId === selectedRow.id ? bench : null;
    const exemplars: MandateExemplar[] | undefined = liveBench
      ? liveBench.exemplars
      : undefined;
    const exemplarDraft: MandateExemplarDraft | undefined = liveBench
      ? {
          open: liveBench.open,
          label: liveBench.label,
          variables: liveBench.variables,
          user_input: liveBench.user_input,
        }
      : undefined;
    return createMandatesScope({
      mandate_count: displayedRows.length,
      mandates_summary: summaries,
      health_summary: health,
      unhealthy_mandates: summaries.filter((s) => s.health !== "ok"),
      system_agent_count: agentOptions.length,
      selected_mandate_id: selectedRow?.id,
      selected_mandate:
        selectedRow && data
          ? toMandateDetail(selectedRow, data, newestSnapshotByAgent)
          : undefined,
      selected_mandate_health: selectedRow?.health,
      selected_mandate_overrides: overrides,
      selected_mandate_contract: contract,
      selected_mandate_exemplars: exemplars,
      mandate_exemplar_draft: exemplarDraft,
      selection: window.getSelection()?.toString() || undefined,
    });
  };

  // ── Surface write handlers — the console's layer ──────────────────────────
  //
  // `select_mandate` is implemented HERE because this component owns `selectedId`
  // AND mounts the provider (the `getWriteHandlers` half of the seam).
  // `mandate_exemplar_draft` gets a base REFUSAL here and its live implementation
  // in `MandateTestBench` via `useSurfaceWriteHandlers`, which `resolveHandlers`
  // merges OVER this layer whenever a mandate workbench is open. These entries
  // only ever run when no bench is mounted, and their whole job is to say so
  // instead of letting the seam report a generic "declared target with no
  // live handler".
  //
  // Rows and the current selection are read through refs, not the render
  // closure: the writeback seam resolves every staged handler BEFORE the user
  // confirms the first dialog, so a handler that validates against its
  // render-time snapshot can act on stale data by the time Apply is pressed.
  // Both are reassigned from the wrapper's `ref` callback below — the same
  // live-ref idiom `UserTableViewer` uses, and the only one that stays fresh
  // every render without touching a ref during render.
  const rowsRef = useRef<ConsoleRow[]>(allRows);
  // Runs once per distinct ?mandate= value. No row lookup is needed — the page
  // resolves the key itself — so an old link works even before rows load.
  useEffect(() => {
    if (!deepLinkKey) return;
    if (deepLinkedRef.current === deepLinkKey) return;
    deepLinkedRef.current = deepLinkKey;
    router.replace(adminMandateHref(deepLinkKey));
  }, [deepLinkKey, router]);

  const selectedIdRef = useRef<string | null>(selectedId);

  const getMandatesWriteHandlers = (): SurfaceWriteHandlers => ({
    [AGENT_MANDATES_WRITE_TARGETS.selectMandate]: (value: unknown) => {
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(
          "select_mandate takes a non-empty string — a mandate's `id` (UUID) or its `mandate_key`, both of which are in `mandates_summary`.",
        );
      }
      const key = value.trim();
      const liveRows = rowsRef.current;
      const match =
        liveRows.find((r) => r.id === key) ??
        liveRows.find((r) => r.mandateKey === key) ??
        null;
      if (!match) {
        const known = liveRows.map((r) => r.mandateKey).join(", ");
        throw new Error(
          `No loaded mandate matches "${key}". Pass a mandate id (UUID) or mandate_key from \`mandates_summary\`.` +
            (known ? ` Loaded mandate_keys: ${known}.` : ""),
        );
      }
      if (match.id === selectedIdRef.current) return;
      // Dirty-draft guard: opening another mandate remounts the workbench and
      // throws away a test case the admin (or a previous write) has staged
      // but not saved. Refuse loudly rather than silently discard it.
      const bench = readMandateBenchSnapshot();
      if (
        bench &&
        bench.mandateId === selectedIdRef.current &&
        (bench.label.trim() !== "" ||
          bench.user_input.trim() !== "" ||
          bench.variables.trim().replace(/\s+/g, "") !== "{}")
      ) {
        throw new Error(
          'An unsaved test-case draft is staged on the mandate that is currently open. Opening another mandate would discard it — the admin has to press "Save test case" or clear the form first.',
        );
      }
      setSelectedId(match.id);
    },
    [AGENT_MANDATES_WRITE_TARGETS.exemplarDraft]: () => {
      // LOUD, and honest about WHY. The test bench used to mount inside this
      // console's drawer; since 2026-08-29 the drawer is gone and the bench
      // lives on the mandate's own page (Admin controls → Test bench), which
      // mounts no surface runtime. So this target cannot be served from here
      // at all — it is not "not yet open".
      throw new Error(
        // "…is not an agent surface" named the old system on a mandate screen
        // (V2 round 4 vocabulary sweep). What the reader needs is WHY it cannot
        // be staged here, which the mandate's own words say better.
        "This console no longer hosts the test-case composer. The bench moved to the mandate's own page — /administration/mandates/<mandate_key>, under Admin controls — and that page does not run this console's write targets, so an exemplar cannot be staged from here. Tell the admin to open the mandate and compose it there.",
      );
    },
  });

  // ── Batch selection + the advance (R8, R9, R17) ───────────────────────────
  // Only rows whose DEFAULT rung is advanceable render a checkbox; a blocked
  // row keeps its per-row door and never rides a batch.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visibleSelectedIds = pruneMandateSelectionToVisible(
    selectedIds,
    displayedRows,
  );
  const handleViewChange = (nextRows: ConsoleRow[]) => {
    setDisplayedRows(nextRows);
    setSelectedIds((current) =>
      pruneMandateSelectionToVisible(current, nextRows),
    );
  };

  /**
   * THE write door (I3, I8) through the one shared hook: consequence dialog
   * naming every pin from → to and the undo window, then
   * `POST /mandates/impact/advance`, then the server's per-row sentences and
   * the revert door. After any write the grades are re-read.
   */
  const verdictByRung = useMemo(() => {
    const out = new Map<string, ImpactVerdict>();
    for (const verdict of impact?.verdicts ?? []) {
      out.set(rungIdentityOf(verdict.apply_token), verdict);
    }
    return out;
  }, [impact]);
  const writes = useImpactAdvance({
    verdictByRung,
    onWritten: () => {
      setSelectedIds([]);
      setImpactEpoch((epoch) => epoch + 1);
      reload();
    },
  });
  const advancing = writes.busy !== null;
  const advanceVerdicts = (verdicts: ImpactVerdict[], batchLabel: string) =>
    writes.advance(verdicts, batchLabel);

  // The batch panel (I5) over the selection: the same three-pile body the
  // deprecated-models sweep ends in, scoped to the agents these rows pin and
  // walking their duplicates (R4), with the selected rungs pre-selected.
  const openImpactBatchWindow = useOpenImpactBatchWindow();
  const reviewSelectedAsBatch = (selected: ConsoleRow[]) => {
    const agentIds = Array.from(
      new Set(
        selected
          .map((row) => row.defaultVerdict?.agent_id ?? row.agentId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    openImpactBatchWindow({
      agentIds,
      mode: "post_batch",
      batchLabel: "Standing table",
      sourceSentence: `${selected.length} mandate${selected.length === 1 ? "" : "s"} selected on the standing table`,
      preselectedRungIds: selected
        .map((row) => row.defaultVerdict)
        .filter((v): v is ImpactVerdict => v !== null)
        .map((v) => rungIdentityOf(v.apply_token)),
      surfaceName: "administration-mandates",
    });
  };

  const advanceSelected = (selected: ConsoleRow[]) =>
    void advanceVerdicts(
      selected
        .map((row) => row.defaultVerdict)
        .filter(
          (v): v is ImpactVerdict =>
            v !== null && batchEligibilityOf(v).batchable,
        ),
      `Standing table: ${selected.length} selected`,
    );

  const advanceAllGreen = () =>
    void advanceVerdicts(
      allRows
        .map((row) => row.defaultVerdict)
        .filter((v): v is ImpactVerdict => v !== null && isSafeGreen(v)),
      "Standing table: all green",
    );

  const advanceOneAnyway = (verdict: ImpactVerdict) =>
    void advanceVerdicts([verdict], `Standing table: ${verdict.mandate_key}`);

  const columns = useMemo((): MatrxColumnDef<ConsoleRow>[] => {
    return [
      {
        id: "feature",
        accessorKey: "feature",
        header: "Feature",
        filter: "select",
        width: 150,
        cell: (r) => <span className="font-mono text-xs">{r.feature}</span>,
      },
      {
        id: "mandateName",
        accessorKey: "mandateName",
        header: "Mandate",
        width: 190,
        // A REAL link (D112) — keyboard-reachable, cmd-clickable into a new
        // tab, and the same destination the whole-row click uses.
        href: (r) => adminMandateHref(r.mandateKey),
        cell: (r) => (
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <span
              className="block max-w-full truncate font-mono text-xs"
              style={{ whiteSpace: "nowrap" }}
              title={`Full mandate key: ${r.mandateKey}`}
            >
              {r.mandateName}
            </span>
            {r.isPlaceholder && (
              <Badge variant="outline" className="text-[10px]">
                placeholder
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "label",
        accessorKey: "label",
        header: "Label",
        cell: (r) => <CompactMandateText text={r.label ?? "—"} />,
        width: 180,
        href: (r) => adminMandateHref(r.mandateKey),
      },
      {
        // THE GOAL — what this Mandate is FOR, in the words the declaration
        // uses. It is code, not a row: absent means the catalogue could not be
        // read, or the declaration never wrote one. The two say so differently.
        id: "goal",
        accessorKey: "goal",
        header: "Goal",
        width: 280,
        cell: (r) =>
          r.goal ? (
            <CompactMandateText text={r.goal} />
          ) : catalogue ? (
            <span className="text-xs text-amber-700 dark:text-amber-400">
              No goal declared
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        // COVERAGE — the server's verdict, per row. Orange names the Mandate
        // whose Holder is carrying this one; red names why nothing does.
        id: "coverage",
        accessorKey: "coverage",
        header: "Coverage",
        filter: "select",
        width: 120,
        cell: (r) => {
          const meta = COVERAGE_META[r.coverage];
          return (
            <div className="flex flex-col items-start gap-0.5">
              <Badge
                variant="outline"
                className={meta.toneClassName}
                title={r.coverageDetail ?? meta.description}
              >
                {r.coverage === "orange" ? "Fallback" : meta.label}
              </Badge>
            </div>
          );
        },
      },
      {
        id: "agentName",
        accessorKey: "agentName",
        header: "Agent",
        width: 240,
        // THE DOOR LAW: the agent is a record with an identity — open it,
        // new-tab it, peek it. Never a bare string in a cell.
        cell: (r) =>
          r.agentId ? (
            <EntityRef
              token="agent"
              id={r.agentId}
              name={r.agentName}
              href={agentHref(r.agentId, r.agentType)}
              showIcon={false}
            />
          ) : (
            <span className="text-xs text-muted-foreground">{r.agentName}</span>
          ),
      },
      {
        id: "pinLabel",
        accessorKey: "pinLabel",
        header: "Pin",
        filter: "select",
        width: 96,
        cell: (r) => (
          <div className="flex items-center gap-1">
            <Badge
              variant={isFloatingMandate(r.mandate) ? "secondary" : "outline"}
            >
              {r.pinLabel}
            </Badge>
            {r.agentId && (
              <a
                href={getAgentModeHref(
                  "versions",
                  r.agentId,
                  r.agentType === "builtin"
                    ? SYSTEM_AGENT_BASE
                    : USER_AGENT_BASE,
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Version history for ${r.agentName}`}
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <History className="h-3 w-3" />
              </a>
            )}
          </div>
        ),
      },
      {
        // GRADE — the server's verdict on what changed between the pinned
        // version and the newest (R3, R12). Findings on hover, in the
        // server's own sentences.
        id: "impactGrade",
        accessorKey: "impactGrade",
        header: "Grade",
        filter: "select",
        filterOptions: [
          ...IMPACT_GRADE_ORDER.slice()
            .reverse()
            .map((grade) => ({ value: grade, label: GRADE_META[grade].label })),
          { value: "ungraded", label: "Not graded" },
        ],
        sortValue: (r) =>
          r.impactGrade === "ungraded"
            ? -1
            : IMPACT_GRADE_ORDER.indexOf(r.impactGrade),
        defaultSortDirection: "desc",
        width: 130,
        cell: (r) => (
          <ImpactGradeCell
            mandateKey={r.mandateKey}
            defaultVerdict={r.defaultVerdict}
            bindingVerdicts={r.bindingVerdicts}
            ungraded={r.ungraded}
          />
        ),
      },
      {
        // BLOCKER — can this pin move at all (R28), with its per-row door.
        id: "impactBlocker",
        accessorKey: "impactBlocker",
        header: "Blocker",
        filter: "select",
        filterOptions: [
          ...(Object.keys(BLOCKER_META) as Array<ImpactBlocker | "none">).map(
            (key) => ({ value: key, label: BLOCKER_META[key].label }),
          ),
          { value: "ungraded", label: "Not graded" },
        ],
        width: 210,
        cell: (r) => (
          <ImpactBlockerCell
            verdict={r.defaultVerdict}
            busy={advancing}
            onAdvanceAnyway={advanceOneAnyway}
          />
        ),
      },
      {
        id: "health",
        accessorKey: "health",
        header: "Health",
        filter: "select",
        width: 180,
        // A detected problem ships with its fix and its link — never a red
        // badge that tells the admin to go find the answer themselves.
        cell: (r) => {
          const lineage = r.agentId ? lineageIndex[r.agentId] : undefined;
          const twin = lineage?.systemTwin ?? null;
          return (
            <div className="flex flex-wrap items-center gap-1">
              <Badge
                variant="outline"
                className={HEALTH_CLASS[r.health]}
                title={HEALTH_HINT[r.health]}
              >
                {r.health === "not a system agent"
                  ? "NOT a system agent"
                  : r.health}
              </Badge>
              {r.health === "code ↔ agent drift" && r.codeTruth && (
                <span className="basis-full text-[10px] leading-tight text-rose-600">
                  code: {r.codeTruth.code_variables.join(", ") || "none"}
                  {" · "}agent:{" "}
                  {r.codeTruth.bound_agent?.declared_variables.join(", ") ||
                    "none"}
                </span>
              )}
              {r.health === "not a system agent" && twin && (
                <>
                  <LineageChip
                    label="system twin"
                    agent={twin}
                    Icon={ShieldCheck}
                  />
                  <RebindToTwinButton
                    mandate={r.mandate}
                    twin={twin}
                    currentAgentId={r.agentId}
                    codeTruth={r.codeTruth}
                    onSaved={reload}
                  />
                </>
              )}
              {r.health === "not a system agent" && !twin && r.agentId && (
                <CreateSystemTwinButton
                  mandate={r.mandate}
                  agentId={r.agentId}
                  agentName={r.agentName}
                  codeTruth={r.codeTruth}
                  onSaved={reload}
                />
              )}
            </div>
          );
        },
      },
      {
        // The REAL inputs — the contract's required variables (+ user text),
        // never the mostly-null input_kind column.
        id: "inputSummary",
        accessorKey: "inputSummary",
        header: "Inputs",
        width: 320,
        cell: (r) => (
          <MandateInputsCell
            compact
            row={r}
            offeredValues={
              r.provisionKey ? offersByProvision.get(r.provisionKey) : undefined
            }
          />
        ),
      },
      {
        // The output promise — kind (a door), required output keys, or a
        // loud "unspecified" gap. Never a bare "text".
        id: "outputSummary",
        accessorKey: "outputSummary",
        header: "Output",
        filter: "select",
        width: 220,
        cell: (r) => <MandateOutputCell compact row={r} />,
      },
      {
        id: "bindings",
        accessorKey: "overridesCount",
        header: <Link2 className="h-3.5 w-3.5" aria-label="Bindings" />,
        compact: true,
        filter: "number",
        align: "center",
        width: 52,
        cell: (r) => (
          <span
            className="text-xs tabular-nums"
            title={`${r.overridesCount} bindings`}
          >
            {r.overridesCount}
          </span>
        ),
      },
      {
        id: "isEnabled",
        accessorKey: "isEnabled",
        header: "Enabled",
        filter: "boolean",
        align: "center",
        width: 90,
        cell: (r) => (
          <div onClick={(e) => e.stopPropagation()} className="inline-flex">
            <Switch
              aria-label={`Enable ${r.label || r.mandateKey}`}
              checked={r.isEnabled}
              onCheckedChange={(v) => void toggleEnabled(r, v)}
            />
          </div>
        ),
      },
      {
        id: "updatedAt",
        accessorKey: "updatedAt",
        header: "Updated",
        width: 110,
        cell: (r) => (
          <span className="text-xs text-muted-foreground">
            {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : "—"}
          </span>
        ),
      },
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "uuid",
        width: 110,
      },
    ];
  }, [
    toggleEnabled,
    lineageIndex,
    reload,
    catalogue,
    offersByProvision,
    advancing,
    advanceOneAnyway,
  ]);

  const processConsoleRows = (
    catalogueRows: ConsoleRow[],
    state: MatrxDataTableQueryState,
  ) =>
    processMandateConsoleRows(catalogueRows, columns, state, {
      coverageFilter,
      behindOnly,
    });
  const behindLabel = !behindOnly
    ? "All mandates"
    : hasTableSearch
      ? "Searching all mandates"
      : hasTableFilter
        ? "Filtering all mandates"
        : "Behind latest";
  const behindTitle = !behindOnly
    ? "Showing every mandate — click to show only those behind latest"
    : hasTableSearch || hasTableFilter
      ? "This query is searching the full catalogue. Behind latest remains your saved default when the query is cleared — click to show every mandate by default"
      : "Showing only mandates not running the newest saved version — click to show every mandate";

  // The coverage board's named rows open the mandate PAGE — the same
  // destination as a row click, the right-click menu and `?mandate=`. The
  // board can name a mandate the table has filtered out, and the page resolves
  // the key itself, so there is no row lookup to fail here.
  const openMandateByKey = useCallback(
    (mandateKey: string) => openMandatePage(mandateKey),
    [openMandatePage],
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={MANDATES_SURFACE_NAME}
      getScope={getSurfaceScope}
      getWriteHandlers={getMandatesWriteHandlers}
      isEditable={false}
    >
      <div
        ref={(node) => {
          if (!node) return;
          rowsRef.current = allRows;
          selectedIdRef.current = selectedId;
        }}
        className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4"
      >
        <div className="shrink-0 space-y-3">
          {/* The settled "nothing is selected" fact, in words with its remedy —
              a skeleton that simply stops is indistinguishable from a screen
              that is still working. */}
          {organizationUnanswered ? (
            <OrganizationContextNotice
              state={organizationState}
              compact
              className="rounded-md border border-amber-500/40 bg-amber-500/10"
              description="No organization is selected, so the mandate console cannot read anything — choose one from the organization picker in the header and this fills in."
            />
          ) : null}
          {/* THE DOOR'S REFUSAL, IN ITS OWN WORDS. Not a toast that vanishes over
              an empty table: a refusal is a settled fact about this account, and
              the page says it and stops. */}
          {systemHomeRefusal ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-400">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <div className="font-medium">
                  This console lists the platform&apos;s own jobs, and your
                  account may not.
                </div>
                <div className="text-muted-foreground">{systemHomeRefusal}</div>
                <div className="text-muted-foreground">
                  The jobs your own organizations run are yours to manage at{" "}
                  <AppLink href="/mandates" className="underline">
                    /mandates
                  </AppLink>
                  .
                </div>
              </div>
              <ErrorAlchemyMenu error={systemHomeRefusal} />
            </div>
          ) : null}
          <MandateCoverageBoard
            view={coverageView}
            loading={loading}
            error={coverageError}
            active={coverageFilter}
            onToggle={(bucket) =>
              setCoverageFilter((current) => (current === bucket ? null : bucket))
            }
            onOpenMandate={openMandateByKey}
          />
          <StandingImpactStrip
            impact={impact}
            error={impactError}
            loading={loading || (!impact && holderAgentIds.length > 0)}
            staleSafeCount={impactCounts.staleSafe}
            behindCounts={impactCounts.behindCounts}
            blockedBehind={impactCounts.blockedBehind}
            onAdvanceAllGreen={advanceAllGreen}
            busy={advancing}
          />
          <AdvanceResultsCard
            batches={writes.batches}
            verdictsOf={writes.verdictsOf}
            busy={writes.busy}
            onRevert={(batch, rowId) => void writes.revert(batch, rowId)}
            onDismiss={writes.clear}
          />
          {catalogueError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Goals are unavailable.</div>
                <div className="text-muted-foreground">
                  A Mandate&apos;s goal lives in the aidream code declaration, not
                  in this database. Until it answers, the Goal column is blank
                  rather than wrong: {catalogueError}
                  <ErrorAlchemyMenu error={catalogueError} />
                </div>
              </div>
            </div>
          )}
          {codeTruthError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Code truth is unavailable.</div>
                <div className="text-muted-foreground">
                  Mandate rows still work, but code-to-agent drift cannot be
                  trusted until aidream answers: {codeTruthError}
                  <ErrorAlchemyMenu error={codeTruthError} />
                </div>
              </div>
            </div>
          )}
          {codeAgentDriftRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span className="font-medium text-rose-600">
                {codeAgentDriftRows.length} mandate
                {codeAgentDriftRows.length === 1 ? "" : "s"} disagree with the
                code that calls them.
              </span>
              {codeAgentDriftRows.slice(0, DRIFT_STRIP_NAMED_CAP).map((row) => (
                <Button
                  key={row.id}
                  size="sm"
                  variant="outline"
                  disabled={navPending}
                  className="h-6 gap-1 font-mono text-[11px]"
                  onClick={() => openMandatePage(row.mandateKey)}
                >
                  {pendingKey === row.mandateKey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  Review {row.mandateKey}
                </Button>
              ))}
              {/* The strip used to stop at three with no sign there were more —
                  a silently truncated work queue. It now counts the rest and
                  says where they are. */}
              {codeAgentDriftRows.length > DRIFT_STRIP_NAMED_CAP && (
                <span className="text-[11px] text-muted-foreground">
                  +{codeAgentDriftRows.length - DRIFT_STRIP_NAMED_CAP} more —
                  filter Health by &ldquo;code ↔ agent drift&rdquo; to see them
                  all
                </span>
              )}
            </div>
          )}
        </div>
        <div className="min-h-64 flex-1" data-surface-value="mandates_summary">
          <NonEditableContextMenu
            sourceFeature="admin"
            contentSource={{ type: "raw" }}
            contextData={{ content: "Agent Mandates console" }}
            resolveContextOnOpen={resolveMandateMenuTarget}
            extraSections={mandateMenuSections}
          >
            <MatrxDataTable
              urlState={{ id: MANDATES_TABLE_ID }}
              data={allRows}
              columns={columns}
              processLocalRows={processConsoleRows}
              onViewChange={handleViewChange}
              getRowId={(r) => r.id}
              searchText={mandateConsoleSearchText}
              isLoading={loading}
              isFetching={fetching}
              pageSize={50}
              emptyState={{
                title: "No mandates yet",
                description:
                  "Mandates seed from aidream code declarations on server boot.",
              }}
              toolbar={{
                title: "Mandates",
                refresh: { onRefresh: reload },
                add: { onAdd: () => router.push("/administration/mandates/new") },
                search: true,
                searchPlaceholder: "Search mandates, agents…",
                actions: (
                  <>
                    <Button
                      size="sm"
                      variant={behindOnly ? "secondary" : "outline"}
                      aria-pressed={behindOnly}
                      className="h-8 gap-1 text-xs"
                      onClick={() => setBehindOnly(!behindOnly)}
                      title={behindTitle}
                    >
                      <History className="h-3.5 w-3.5" />
                      {behindLabel}
                    </Button>
                    <ImpactLegend />
                  </>
                ),
              }}
              copy={{
                label: "Agent mandate",
                listLabel: "Agent mandates (this view)",
                location: "/administration/mandates",
                rowKind: "agent-mandate",
                listKind: "mandates",
                humanRow,
                rowAttributes: (r) => ({
                  id: r.id,
                  mandate_key: r.mandateKey,
                  feature: r.feature,
                  mandate: r.mandateName,
                  health: r.health,
                  enabled: r.isEnabled,
                }),
              }}
              // Navigation and raw inspection are separate, explicit actions.
              detail={{ enabled: false }}
              window={{
                enabled: true,
                // The inspection window remains available as an explicit row
                // action; the ordinary row click opens the management page.
                openOnRowClick: false,
                title: (r) => `Inspect ${r.label || r.mandateKey}`,
                onOpen: () => {},
              }}
              onRowOpen={(r) => openMandatePage(r.mandateKey)}
              selection={{
                selectedIds: visibleSelectedIds,
                onSelectedIdsChange: setSelectedIds,
                noun: "mandate",
                isRowSelectable: (r) =>
                  r.defaultVerdict !== null &&
                  batchEligibilityOf(r.defaultVerdict).batchable,
                actions: (selected) => (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      disabled={selected.length === 0}
                      title="Open the batch panel over these rows: every rung their agents hold, in three piles, with per-row grades."
                      onClick={() => reviewSelectedAsBatch(selected)}
                    >
                      <BrainCircuit className="h-3 w-3" />
                      Review as batch
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={advancing || selected.length === 0}
                      onClick={() => advanceSelected(selected)}
                    >
                      {advancing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : null}
                      Advance selected ({selected.length})
                    </Button>
                  </>
                ),
              }}
            />
          </NonEditableContextMenu>
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
