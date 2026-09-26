"use client";

// features/mandates/admin-list/MandateAdminListPage.tsx
//
// /administration/intelligence/mandates — the NEW admin mandate list, built
// beside the old console (features/mandates/admin/MandatesConsole.tsx, left
// untouched) on the canonical `EntityListPage`.
//
// TWO PAGES, ONE COMPONENT (Arman, 2026-09-26 — asked five times):
//   lane "system"   /administration/intelligence/mandates — THE management
//                   page: creating, editing, binding and updating the SYSTEM
//                   mandates. No scope tabs, no owner column, no org or person
//                   rows anywhere (the database door is system-only).
//   lane "support"  /administration/intelligence/mandates/support — Mandate
//                   support lookup: Organizations / Users / All with an Owner
//                   column, for looking into a tenant's mandates during tech
//                   support. Never linked as the main mandates page.
// The admin seat never acts as itself on either (no Mine, no My Orgs). The
// table's own title row carries search, saved views and the column picker. The
// whole query lives in the URL, so Back restores scope, search, filters and sort.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { BrainCircuit } from "lucide-react";
import { ADMIN_MANDATES_HOME } from "@/features/mandates/admin-routes";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityBulkAction } from "@/lib/entity-list/selection";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { useServerOrganizationId } from "@/lib/api/useServerOrganizationId";
import { onMandateCacheInvalidated } from "@/features/mandates/service";
import {
  batchEligibilityOf,
  rungIdentityOf,
  type ImpactVerdict,
} from "@/features/mandates/admin/impact";
import { useImpactAdvance } from "@/features/mandates/admin/impact-advance";
import {
  advanceWorkflowPins,
  workflowAdvanceEligibility,
} from "@/features/mandates/admin/workflow-advance";
import type { WorkflowImpactVerdict } from "@/features/mandates/admin/workflow-impact";
import { recordToast, toast } from "@/lib/toast";
import { useOpenImpactBatchWindow } from "@/features/overlays/openers/impactBatchWindow";
import { fetchAgentsListFull } from "@/features/agents/redux/agent-definition/thunks";
import { adminMandateListConfig, supportMandateListConfig } from "./listConfig";
import type { MandateAdminLane } from "./rpc";
import { MandateAdminPagesNav } from "./MandateAdminPagesNav";
import {
  MandateAdminListActionsContext,
  useMandateAdminListState,
} from "./context";
import { invalidateMandateAdminList, retryMandateAdminFailures } from "./store";
import { EntitySourceFailures } from "@/lib/entity-list/components/EntitySourceFailures";
import { createMandateAdminService } from "./service";
import type { MandateAdminRow } from "./types";

/** What each secondary read feeds, in the words of the columns it fills. */
const SOURCE_LABEL: Record<string, string> = {
  codeTruth: "Code declarations",
  coverage: "Coverage",
  catalogue: "Goals",
  serves: "Serves",
  impact: "Grades",
  workflowImpact: "Workflow grades",
  inputs: "Inputs",
  sources: "Where each mandate is declared and called",
};

export function MandateAdminListPage({
  lane = "system",
}: {
  /** `system` = the management page; `support` = Mandate support lookup. */
  lane?: MandateAdminLane;
} = {}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const authReady = useAppSelector(selectAuthReady);
  const organizationId = useServerOrganizationId();
  // The server reports ride the organization header: when a workspace is
  // chosen (or changed) after the rows loaded, they are asked again.
  const reportsOrg = useRef(organizationId);
  useEffect(() => {
    if (reportsOrg.current === organizationId) return;
    reportsOrg.current = organizationId;
    invalidateMandateAdminList(true);
  }, [organizationId]);
  const listState = useMandateAdminListState();

  // Any mandate write anywhere (the Enabled switch included) re-asks the list.
  useEffect(() => onMandateCacheInvalidated(() => invalidateMandateAdminList()), []);

  // The Health cell's twin fixes read the agent lineage index.
  useEffect(() => {
    if (accessToken) dispatch(fetchAgentsListFull());
  }, [accessToken, dispatch]);

  const verdictByRung = new Map<string, ImpactVerdict>();
  for (const verdict of listState.reports.impact?.verdicts ?? []) {
    verdictByRung.set(rungIdentityOf(verdict.apply_token), verdict);
  }
  const writes = useImpactAdvance({
    verdictByRung,
    onWritten: () => invalidateMandateAdminList(true),
  });
  const openImpactBatchWindow = useOpenImpactBatchWindow();

  // ── Batch work over the selection — the old console's "Review as batch"
  // and "Advance selected", carried over by import. ────────────────────────
  const bulkActions: EntityBulkAction<MandateAdminRow>[] = [
    {
      id: "review-batch",
      label: "Review as batch",
      icon: BrainCircuit,
      variant: "outline",
      run: ({ rows }) => {
        const workflowOnly = rows.filter(
          (row) => !row.defaultVerdict && !row.agentId && row.workflowVerdicts.length > 0,
        ).length;
        const agentIds = [
          ...new Set(
            rows
              .map((row) => row.defaultVerdict?.agent_id ?? row.agentId)
              .filter((id): id is string => Boolean(id)),
          ),
        ];
        if (agentIds.length === 0) {
          return {
            message:
              workflowOnly > 0
                ? "The batch panel reviews agent pins. Workflow pins are graded in the Grade column — use Advance selected to move them."
                : "None of the selected mandates has a graded pin to review.",
            keepSelection: true,
          };
        }
        openImpactBatchWindow({
          agentIds,
          mode: "post_batch",
          batchLabel: "Mandate list",
          sourceSentence: `${rows.length} mandate${rows.length === 1 ? "" : "s"} selected on the mandate list`,
          preselectedRungIds: rows
            .map((row) => row.defaultVerdict)
            .filter((v): v is ImpactVerdict => v !== null)
            .map((v) => rungIdentityOf(v.apply_token)),
          surfaceName: "administration-mandates",
        });
        return { keepSelection: true };
      },
    },
    {
      id: "advance",
      label: "Advance selected",
      run: async ({ rows }) => {
        const verdicts = rows
          .map((row) => row.defaultVerdict)
          .filter((v): v is ImpactVerdict => v !== null && batchEligibilityOf(v).batchable);
        // Workflow parity: every workflow-held rung of the selection that can
        // move to its newest published version (default and bindings alike).
        const workflowVerdicts = rows
          .flatMap((row) => row.workflowVerdicts)
          .filter(
            // THE ADMIN SEAT: no pin is "mine" here — a person's own pin is
            // theirs to advance, the signed-in admin's included.
            (v): v is WorkflowImpactVerdict => workflowAdvanceEligibility(v).batchable,
          );
        if (verdicts.length === 0 && workflowVerdicts.length === 0) {
          return {
            message: "None of the selected mandates can advance: each is already current, blocked, or a person's own pin.",
            keepSelection: true,
          };
        }
        // `advance` opens its own confirm naming what moves (useImpactAdvance).
        if (verdicts.length > 0) {
          await writes.advance(verdicts, `Mandate list: ${rows.length} selected`);
        }
        if (workflowVerdicts.length > 0) {
          const results = await advanceWorkflowPins(dispatch, workflowVerdicts);
          if (results) {
            const moved = results.filter((r) => r.moved).length;
            const refused = results.filter((r) => !r.moved);
            if (moved > 0) {
              toast.success(`Moved ${moved} workflow pin${moved === 1 ? "" : "s"} to the newest published version.`);
              invalidateMandateAdminList(true);
            }
            // Each row's own sentence, on its mandate's record toast.
            const refOf = (key: string) => {
              const row = rows.find((candidate) => candidate.mandateKey === key);
              return { type: "mandate", id: row?.id ?? key, title: key };
            };
            for (const row of refused) {
              recordToast.error(refOf(row.verdict.mandate_key), row.sentence ?? "Not moved.");
            }
            for (const row of results.filter((r) => r.moved && r.sentence)) {
              recordToast.info(refOf(row.verdict.mandate_key), row.sentence as string);
            }
          }
        }
        return { keepSelection: false };
      },
    },
  ];

  // 🚨 READING NEVER WAITS ON AN ORGANIZATION (review 2026-09-25; access is
  // personal). The list itself is one database read that needs no workspace;
  // only the server reports ride the organization header, and each of those
  // that cannot run says so in the notice below — the rows never wait for it.
  const ready = authReady && Boolean(accessToken);
  const service = createMandateAdminService(dispatch, lane);
  const support = lane === "support";

  if (!ready) {
    return (
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="space-y-2" aria-busy="true" aria-label="Loading mandates">
          <div className="h-8 w-72 animate-pulse rounded-md bg-muted" />
          <div className="h-64 w-full animate-pulse rounded-md bg-muted/60" />
        </div>
      </div>
    );
  }

  return (
    <MandateAdminListActionsContext.Provider
      value={{
        advancing: writes.busy !== null,
        advanceAnyway: (verdict) => void writes.advance([verdict], `List: ${verdict.mandate_key}`),
      }}
    >
      <EntityListPage
        config={{
          ...(support ? supportMandateListConfig : adminMandateListConfig),
          service,
          serviceKey: `${lane}:${userId ?? ""}:${listState.version}`,
          // The batch actions work on grades, which measure system holders
          // only — the support lookup is a read-only look into a tenant.
          bulkActions: support ? [] : bulkActions,
          bulkSelection: support ? undefined : {
            noun: "mandate",
            // Only a mandate with a pin (agent or workflow) has a rung to act on.
            isRowSelectable: (row) =>
              row.defaultVerdict !== null ||
              Boolean(row.agentId) ||
              row.workflowVerdicts.length > 0,
          },
        }}
        // admin-support-only: /administration/intelligence/mandates/support
        defaultScope={support ? { kind: "platform_all" } : { kind: "system" }}
        // The management page has ONE corpus — the platform's own mandates —
        // so it draws no scope tabs at all.
        scopeTabs={support}
        clearsShellHeader={false}
        notice={
          <EntitySourceFailures
            operation={support ? "Load the mandate support lookup's columns" : "Load the admin mandate list's columns"}
            failures={Object.entries(listState.failures).map(([source, message]) => ({
              label: SOURCE_LABEL[source] ?? source,
              error: message,
            }))}
            onRetry={retryMandateAdminFailures}
          />
        }
        headerActions={support ? <MandateSupportLookupLabel /> : <MandateAdminPagesNav />}
      />
    </MandateAdminListActionsContext.Provider>
  );
}

/**
 * The support lookup names itself plainly: it is a tech-support tool over
 * organizations' and people's mandates, not where mandates are managed.
 */
function MandateSupportLookupLabel() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-300">
        Support tool
      </span>
      <span className="hidden sm:inline">
        Organizations&apos; and people&apos;s mandates, for tech support.
      </span>
      <Link href={ADMIN_MANDATES_HOME} className="font-medium text-foreground hover:underline">
        Manage system mandates
      </Link>
    </div>
  );
}
