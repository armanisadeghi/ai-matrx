"use client";

// features/workflow-runtime/drill/WorkflowRunsExplorer.tsx — WORKFLOW RUNS AS NUMBERS: A MOUNT OF THE
// ONE EXPLORER (lane DRILL-CONVERSIONS, program DRILL-FINISH decision 21).
//
// The declared definition `workflow_runs` (aidream apps/shared/records/scripts/drill-definitions/
// workflow_runs.drill.ts) asked through the one read door, in one of two lanes:
//   platform — every run on the platform (/administration/automation/workflow-runs, admin apps only)
//   mine     — the runs the person started (/workflows/runs/analyze, beside her runs list, which stays)
// What only this mount adds: a person's name (the platform's names door; "You" in the mine lane) and
// how one run opens: on the platform lane its floating run window (the admin door, W2-2), in the mine
// lane its own page, beside the way back to her runs list. Every other word is the definition's or the door's.

import AppLink from "@/components/navigation/AppLink";
import type { DrillSource } from "@ai-matrx/records";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import type { DrillNameResolver } from "@/components/official/drill-explorer/types";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { usageNameResolver } from "@/features/admin/usage-drill/useUsageDrill";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { useOpenWorkflowRunWindow } from "@/features/overlays/openers/workflowRunWindow";

export const WORKFLOW_RUNS_SOURCE: DrillSource = { kind: "entity", token: "workflow_runs" };

/** The first screen: the last 30 days by workflow, most runs first (the definition's own default). */
export const WORKFLOW_RUNS_FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["workflow"],
  show: ["runs", "failures", "duration_median", "runs_with_requests", "cost"],
  where: [],
  sort: { key: "runs", direction: "desc" },
  window: "30d",
};

// WORDS COME FROM THE DEFINITION AND THE DOOR (lane DRILL-GAPS): a status and "how it started" read as
// workflow_runs' declared choices; a workflow and an organization as the door's own labels (read as
// the seat — a workflow or an organization she cannot open reads as one whose name she cannot read).
// A person's name is the one thing the door does not carry, so it comes from the platform's names door
// (and in the mine lane every run is her own).

/** In the mine lane every run is the person's own. */
const yourself: DrillNameResolver = {
  emptyLabel: "No person",
  missingLabel: "Reading the name…",
  resolve: async (ids) => ({ ok: true, names: Object.fromEntries(ids.map((id) => [id, "You"])) }),
};

export function WorkflowRunsExplorer({ lane }: { lane: "platform" | "mine" }) {
  // The platform lane asks in the platform's own organization (whose calendar cuts the periods; the
  // admin seat never acts as itself). The mine lane counts every run she started, in EVERY organization
  // (the door narrows the mine lane by the person alone): the organization it is asked in is only the
  // CALENDAR its periods are cut in — the one she works in when one is chosen, else the first she
  // belongs to — and the explorer says that calendar's zone as a chip. It never waits on an active
  // organization (lane DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL N1; the active-org-is-never-a-list-filter law).
  const active = useOrganizationRequired();
  const memberships = useUserOrganizations();
  // THE ORGANIZATION FILTER: a visible page control, `?org_filter=`, default All organizations — never
  // the active organization.
  const [orgFilter, setOrgFilter] = useOrgFilterParam([]);
  // THE ADMIN DOOR TO ONE RUN (VERIFY-DRILL-WAVE2 W2-2): on the platform lane a run opens in its own
  // floating run window, right here on the admin page — never the admin's personal runs list, which
  // holds only the runs he started. In the mine lane her run opens on its own page.
  const openRunWindow = useOpenWorkflowRunWindow();
  // org-fallback-deliberate: the platform lane reads the platform's own organization by name; the mine lane's is only its calendar
  const calendarOrganization =
    active.organizationState === "ready" && active.organizationId ? active.organizationId : memberships.organizations[0]?.id ?? null;
  const organizationId = lane === "platform" ? SYSTEM_ORGANIZATION_ID : calendarOrganization;
  if (lane === "mine" && !organizationId) {
    if (memberships.loading) {
      return (
        <div className="p-4">
          <div className="h-96 animate-pulse rounded-md bg-muted/50" />
        </div>
      );
    }
    // she belongs to no organization at all: nothing of hers can be counted
    return (
      <div className="p-4">
        <OrganizationContextNotice state={active.organizationState} what="Run analysis" />
      </div>
    );
  }
  const names: Record<string, DrillNameResolver> =
    lane === "platform" ? { person: usageNameResolver(SYSTEM_ORGANIZATION_ID, "person") } : { person: yourself };
  return (
    <DrillExplorer
      source={WORKFLOW_RUNS_SOURCE}
      lane={lane}
      organizationId={organizationId}
      // the platform organization's calendar is UTC; her own organization's is the door's to say
      {...(lane === "platform" ? { timeZone: "UTC" } : {})}
      title={lane === "platform" ? "Workflow runs" : "Your runs, analyzed"}
      rootLabel={lane === "platform" ? "Every run" : "Runs you started"}
      firstQuestion={WORKFLOW_RUNS_FIRST_QUESTION}
      names={names}
      headline={{ measure: "runs", also: ["failures", "runs_with_requests"] }}
      rowNoun="run"
      countMeasure="runs"
      // each run is a record of the definition (`records`, lane DRILL-ADOPT): its id opens the run
      openRecord={
        lane === "platform"
          ? { column: "run_id", label: "Open run", open: (runId) => openRunWindow({ runId }) }
          : { column: "run_id", label: "Open run", href: (runId) => `/workflows/runs/${runId}` }
      }
      location={lane === "platform" ? "Administration › Workflow runs" : "Your runs"}
      {...(lane === "mine" && orgFilter ? { pageWhere: { organization: orgFilter } } : {})}
      dataAttributes={{ "data-workflow-runs-explorer": lane }}
      {...(lane === "mine"
        ? {
            headerExtras: (
              <>
                <EntityOrgFilter orgId={orgFilter} onChange={setOrgFilter} />
                <AppLink href="/workflows/runs" className="underline-offset-2 hover:underline">
                  Back to your runs
                </AppLink>
              </>
            ),
          }
        : {})}
    />
  );
}
