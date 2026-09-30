"use client";

// features/workflow-runtime/drill/WorkflowRunsExplorer.tsx — WORKFLOW RUNS AS NUMBERS: A MOUNT OF THE
// ONE EXPLORER (lane DRILL-CONVERSIONS, program DRILL-FINISH decision 21).
//
// The declared definition `workflow_runs` (aidream apps/shared/records/scripts/drill-definitions/
// workflow_runs.drill.ts) asked through the one read door, in one of two lanes:
//   platform — every run on the platform (/administration/automation/workflow-runs, admin apps only)
//   mine     — the runs the person started (/workflows/runs/analyze, beside her runs list, which stays)
// What only this mount adds: the words for workflow, person and organization ids, the words for the
// status and "how it started" codes, and the way back to the runs list, where every run opens.

import AppLink from "@/components/navigation/AppLink";
import type { DrillSource } from "@ai-matrx/records";
import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { DrillExplorer } from "@/components/official/drill-explorer/DrillExplorer";
import type { DrillNameResolver } from "@/components/official/drill-explorer/types";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { usageNameResolver } from "@/features/admin/usage-drill/useUsageDrill";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { supabase } from "@/utils/supabase/client";

import { fetchWorkflowFacts } from "../discovery/service";

export const WORKFLOW_RUNS_SOURCE: DrillSource = { kind: "entity", token: "workflow_runs" };

/** The first screen: the last 30 days by workflow, most runs first (the definition's own default). */
export const WORKFLOW_RUNS_FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["workflow"],
  show: ["runs", "failures", "duration_median", "runs_with_requests", "cost"],
  where: [],
  sort: { key: "runs", direction: "desc" },
  window: "30d",
};

// KEYS NEVER REACH A PERSON: the status and "how it started" codes in plain words (the definition's
// own choice labels; the explorer does not read describe's choices yet — PROGRESS-DRILL-CONVERSIONS).
const STATUS_WORDS: Record<string, string> = {
  completed: "Completed",
  errored: "Errored",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
  awaiting_input: "Waiting for input",
  paused: "Paused",
  pausing: "Pausing",
  cancelling: "Cancelling",
  running: "Running",
  pending: "Pending",
};
const HOW_STARTED_WORDS: Record<string, string> = {
  direct: "Started directly",
  trigger: "Fired by a trigger",
  mandate: "Run by a mandate",
  child: "Started by another run",
};

function wordsOf(map: Record<string, string>, empty: string): (value: string) => string {
  return (value) => (value ? map[value] ?? "Another value" : empty);
}

/** A workflow's name, read as the person (a workflow she cannot open reads in words, never an id). */
const workflowNames: DrillNameResolver = {
  emptyLabel: "No workflow",
  missingLabel: "A workflow you cannot open",
  resolve: async (ids) => {
    try {
      const names: Record<string, string> = {};
      // bounded: the door shows at most one page of groups; read them 100 at a time
      for (let i = 0; i < ids.length; i += 100) {
        const facts = await fetchWorkflowFacts(ids.slice(i, i + 100));
        for (const [id, fact] of facts) names[id] = fact.name?.trim() || "A workflow with no name";
      }
      return { ok: true, names };
    } catch (error) {
      return { ok: false, message: `The workflows' names could not be read (${error instanceof Error ? error.message : "unknown error"}).` };
    }
  },
};

/** The organizations a member belongs to, read as her through their own row security. */
const memberOrganizationNames: DrillNameResolver = {
  emptyLabel: "No organization",
  missingLabel: "An organization you are not in",
  resolve: async (ids) => {
    const { data, error } = await supabase.schema("iam").from("organizations").select("id,name").in("id", ids.slice(0, 1000));
    if (error) return { ok: false, message: `The organizations' names could not be read (${error.message}).` };
    return { ok: true, names: Object.fromEntries((data ?? []).map((o) => [o.id, o.name ?? "An organization with no name"])) };
  },
};

/** In the mine lane every run is the person's own. */
const yourself: DrillNameResolver = {
  emptyLabel: "No person",
  missingLabel: "You",
  resolve: async (ids) => ({ ok: true, names: Object.fromEntries(ids.map((id) => [id, "You"])) }),
};

export function WorkflowRunsExplorer({ lane }: { lane: "platform" | "mine" }) {
  // The platform lane asks in the platform's own organization (whose calendar cuts the periods; the
  // admin seat never acts as itself). The mine lane asks in the organization the person works in —
  // her calendar — and counts every run she started, in every organization.
  const active = useOrganizationRequired();
  const organizationId = lane === "platform" ? SYSTEM_ORGANIZATION_ID : active.organizationId;
  if (lane === "mine" && active.organizationState !== "ready") {
    return (
      <div className="p-4">
        <OrganizationContextNotice state={active.organizationState} what="Run analysis" />
      </div>
    );
  }
  const names: Record<string, DrillNameResolver> =
    lane === "platform"
      ? {
          workflow: workflowNames,
          person: usageNameResolver(SYSTEM_ORGANIZATION_ID, "person"),
          organization: usageNameResolver(SYSTEM_ORGANIZATION_ID, "organization"),
        }
      : { workflow: workflowNames, person: yourself, organization: memberOrganizationNames };
  return (
    <DrillExplorer
      source={WORKFLOW_RUNS_SOURCE}
      lane={lane}
      organizationId={organizationId}
      title={lane === "platform" ? "Workflow runs" : "Your runs, analyzed"}
      rootLabel={lane === "platform" ? "Every run" : "Runs you started"}
      firstQuestion={WORKFLOW_RUNS_FIRST_QUESTION}
      names={names}
      words={{ status: wordsOf(STATUS_WORDS, "No status"), trigger: wordsOf(HOW_STARTED_WORDS, "Not known") }}
      headline={{ measure: "runs", also: ["failures", "runs_with_requests"] }}
      rowNoun="run"
      countMeasure="runs"
      recordsLink={{
        href: () => "/workflows/runs",
        lead: lane === "platform" ? "Each run opens from the runs list:" : "Your runs open from your runs list:",
        label: "Runs",
      }}
      dataAttributes={{ "data-workflow-runs-explorer": lane }}
      headerExtras={
        <AppLink href="/workflows/runs" className="underline-offset-2 hover:underline">
          {lane === "platform" ? "Runs list" : "Back to your runs"}
        </AppLink>
      }
    />
  );
}
