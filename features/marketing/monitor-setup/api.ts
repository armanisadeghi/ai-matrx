/**
 * The tracker editor's calls into aidream. Three are work the client cannot do
 * (the setup facts that need the vault and the cost tree, the proposal — an
 * agent run — and Run now); saving the monitor is `POST /coverage/trackers`,
 * the one declare path with its lens and access checks. Facts, notes and the
 * tracker read stay on the direct Supabase path.
 */

import { callApi } from "@/lib/api/call-api";
import type { TypedStreamEvent } from "@/lib/api/types";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";

import type { Basis, DeclareTrackerBody, SetupProposal } from "./model";

export type SetupFacts = components["schemas"]["SetupFacts"];
export type TrackerView = components["schemas"]["TrackerView"];
export type ScheduleView = components["schemas"]["ScheduleView"];
export type SchedulePresetId = components["schemas"]["ScheduleBody"]["preset"];

export interface ProposalRef {
  ref: string;
  kind: Basis["kind"];
  label: string;
  url?: string | null;
}

export interface ProposalResult {
  brand_id: string;
  proposal: SetupProposal;
  refs: ProposalRef[];
  inputs: Record<string, number>;
}

function streamData(event: TypedStreamEvent): Record<string, unknown> | null {
  return event.event === "data"
    ? (event.data as Record<string, unknown>)
    : null;
}

/**
 * Every call carries the BRAND's organization explicitly: the editor works for
 * that brand's organization, whatever organization the person has selected
 * elsewhere (a write names its organization; nothing picks one).
 */
export async function getSetupFacts(
  dispatch: AppDispatch,
  brandId: string,
  organizationId: string,
): Promise<SetupFacts> {
  const outcome = await dispatch(
    callApi({
      path: "/news/setup/facts",
      method: "GET",
      queryParams: { brand_id: brandId },
      scopeOverrides: { organization_id: organizationId },
    }),
  );
  if (outcome.error) {
    throw new Error(
      outcome.error.message ?? "Could not load the monitor setup settings.",
    );
  }
  return outcome.data as SetupFacts;
}

const STAGE_LABELS: Record<string, string> = {
  gathering:
    "Reading your brand, confirmed facts, site pages and recent coverage",
  proposing: "Proposing beats, search terms and means lines from what we read",
};

export async function proposeMonitorSetup(
  dispatch: AppDispatch,
  brandId: string,
  organizationId: string,
  trackerId: string | null,
  onStage?: (label: string) => void,
): Promise<ProposalResult> {
  let completed: ProposalResult | undefined;
  const outcome = await dispatch(
    callApi({
      path: "/news/setup/propose",
      method: "POST",
      body: { brand_id: brandId, tracker_id: trackerId },
      scopeOverrides: { organization_id: organizationId },
      stream: true,
      onStreamEvent: (event) => {
        const data = streamData(event);
        if (!data) return;
        if (data.kind === "news.setup_proposal_completed") {
          completed = data.result as ProposalResult;
          return;
        }
        if (data.kind === "news.setup_proposal_stage") {
          const label = STAGE_LABELS[String(data.stage)];
          if (label) onStage?.(label);
        }
      },
    }),
  );
  if (outcome.error) {
    throw new Error(outcome.error.message ?? "The proposal could not be made.");
  }
  if (!completed) {
    throw new Error("The proposal finished without returning anything.");
  }
  return completed;
}

export async function saveMonitor(
  dispatch: AppDispatch,
  body: DeclareTrackerBody,
  organizationId: string,
): Promise<TrackerView> {
  const outcome = await dispatch(
    callApi({
      path: "/coverage/trackers",
      method: "POST",
      body,
      scopeOverrides: { organization_id: organizationId },
    }),
  );
  if (outcome.error) {
    throw new Error(outcome.error.message ?? "The monitor could not be saved.");
  }
  return outcome.data as TrackerView;
}

/** The monitor's saved schedule (Lane C's route), or "No schedule — set one". */
export async function getMonitorSchedule(
  dispatch: AppDispatch,
  trackerId: string,
  organizationId: string,
): Promise<ScheduleView> {
  const outcome = await dispatch(
    callApi({
      path: "/coverage/trackers/{tracker_id}/schedule",
      pathParams: { tracker_id: trackerId },
      method: "GET",
      scopeOverrides: { organization_id: organizationId },
    }),
  );
  if (outcome.error) {
    throw new Error(
      outcome.error.message ?? "Could not load this monitor's schedule.",
    );
  }
  return outcome.data as ScheduleView;
}

/** Save the schedule the person picked — the customer's own trigger (ruling R1). */
export async function saveMonitorSchedule(
  dispatch: AppDispatch,
  trackerId: string,
  organizationId: string,
  preset: SchedulePresetId,
  timezone: string,
): Promise<ScheduleView> {
  const outcome = await dispatch(
    callApi({
      path: "/coverage/trackers/{tracker_id}/schedule",
      pathParams: { tracker_id: trackerId },
      method: "POST",
      body: { preset, timezone },
      scopeOverrides: { organization_id: organizationId },
    }),
  );
  if (outcome.error) {
    throw new Error(
      outcome.error.message ?? "The schedule could not be saved.",
    );
  }
  return outcome.data as ScheduleView;
}

export interface MonitorRunStarted {
  /** The workflow run the person can open, when the stream named it. */
  runId: string | null;
}

/** Run now: the "News monitor run" workflow, streamed (Lane C). The editor
 *  reads what the run found from the monitor itself afterwards. */
export async function runMonitorNow(
  dispatch: AppDispatch,
  trackerId: string,
  organizationId: string,
): Promise<MonitorRunStarted> {
  let runId: string | null = null;
  const outcome = await dispatch(
    callApi({
      path: "/coverage/trackers/{tracker_id}/run",
      pathParams: { tracker_id: trackerId },
      method: "POST",
      body: { force: true },
      stream: true,
      scopeOverrides: { organization_id: organizationId },
      onStreamEvent: (event) => {
        const data = (event as { data?: unknown }).data;
        if (!runId && data && typeof data === "object") {
          const record = data as Record<string, unknown>;
          const id = record.run_id ?? record.workflow_run_id;
          if (typeof id === "string" && id) runId = id;
        }
      },
    }),
  );
  if (outcome.error) {
    throw new Error(outcome.error.message ?? "The run could not start.");
  }
  return { runId };
}
