/**
 * The news monitor's server doors the run view and the editor's delivery step
 * call (Lane C): who hears about a monitor, and resuming scheduled runs the
 * monthly ceiling paused. Both are checks the client cannot make itself
 * (tracker read access per recipient, Slack credential use rights and webhook
 * validity; org admin or monitor editor for Resume). Run now lives in
 * `monitor-setup/api.ts::runMonitorNow` — one path.
 */

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { components } from "@/types/python-generated/api-types";

export type DeliveryBody = components["schemas"]["DeliveryBody"];
export type ResumeResponse = components["schemas"]["ResumeResponse"];

export interface DeliverySaved {
  tracker_id: string;
  alert_recipient_user_ids: string[];
  slack_credential_item_id: string | null;
}

/** The server refuses with one sentence per problem; show every one. */
function refusalMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const body =
      record.serverDetail && typeof record.serverDetail === "object"
        ? (record.serverDetail as Record<string, unknown>)
        : {};
    const detail =
      body.detail && typeof body.detail === "object"
        ? (body.detail as Record<string, unknown>)
        : body;
    const problems = detail.problems;
    if (Array.isArray(problems) && problems.length) {
      return problems.map(String).join(" ");
    }
    if (typeof record.message === "string" && record.message) {
      return record.message;
    }
  }
  return fallback;
}

export async function saveMonitorDelivery(
  dispatch: AppDispatch,
  trackerId: string,
  organizationId: string,
  body: {
    alert_recipient_user_ids: string[];
    slack_credential_item_id: string | null;
  },
): Promise<DeliverySaved> {
  const outcome = await dispatch(
    callApi({
      path: "/coverage/trackers/{tracker_id}/delivery",
      pathParams: { tracker_id: trackerId },
      method: "POST",
      body,
      scopeOverrides: { organization_id: organizationId },
    }),
  );
  if (outcome.error) {
    throw new Error(
      refusalMessage(outcome.error, "Who hears about this monitor could not be saved."),
    );
  }
  return outcome.data as DeliverySaved;
}

export async function resumeMonitorAutoRuns(
  dispatch: AppDispatch,
  organizationId: string,
): Promise<ResumeResponse> {
  const outcome = await dispatch(
    callApi({
      path: "/news/cost/resume",
      method: "POST",
      body: {},
      scopeOverrides: { organization_id: organizationId },
    }),
  );
  if (outcome.error) {
    throw new Error(
      refusalMessage(outcome.error, "Scheduled runs could not be resumed."),
    );
  }
  return outcome.data as ResumeResponse;
}
