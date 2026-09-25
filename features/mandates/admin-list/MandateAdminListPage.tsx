"use client";

// features/mandates/admin-list/MandateAdminListPage.tsx
//
// /administration/intelligence/mandates — the NEW admin mandate list, built
// beside the old console (features/mandates/admin/MandatesConsole.tsx, left
// untouched) on the canonical `EntityListPage`. One top row: Mine / Org /
// System on the left, New mandate on the right; the table's own title row
// carries search, saved views and the column picker. The whole query lives in
// the URL, so Back restores scope, search, filters and sort.

import { useEffect, useRef } from "react";
import { BrainCircuit } from "lucide-react";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import type { EntityBulkAction } from "@/lib/entity-list/selection";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAccessToken,
  selectAuthReady,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
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
import { adminMandateListConfig } from "./listConfig";
import { MandateAdminPagesNav } from "./MandateAdminPagesNav";
import {
  MandateAdminListActionsContext,
  useMandateAdminListState,
} from "./context";
import { invalidateMandateAdminList } from "./store";
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
};

export function MandateAdminListPage() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const accessToken = useAppSelector(selectAccessToken);
  const authReady = useAppSelector(selectAuthReady);
  const organizationId = useAppSelector(selectOrganizationId);
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
            (v): v is WorkflowImpactVerdict => workflowAdvanceEligibility(v, userId ?? null).batchable,
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
  const service = createMandateAdminService(dispatch);

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
          ...adminMandateListConfig,
          service,
          serviceKey: `${userId ?? ""}:${listState.version}`,
          bulkActions,
          bulkSelection: {
            noun: "mandate",
            // Only a mandate with a pin (agent or workflow) has a rung to act on.
            isRowSelectable: (row) =>
              row.defaultVerdict !== null ||
              Boolean(row.agentId) ||
              row.workflowVerdicts.length > 0,
          },
        }}
        defaultScope={{ kind: "system" }}
        clearsShellHeader={false}
        notice={
          Object.keys(listState.failures).length > 0 ? (
            <div
              role="status"
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300"
            >
              {Object.entries(listState.failures)
                .map(([source, message]) => `${SOURCE_LABEL[source] ?? source} unavailable: ${message}`)
                .join(" · ")}
            </div>
          ) : null
        }
        headerActions={<MandateAdminPagesNav />}
      />
    </MandateAdminListActionsContext.Provider>
  );
}
