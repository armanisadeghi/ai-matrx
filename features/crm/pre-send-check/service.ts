// features/crm/pre-send-check/service.ts
//
// THE pre-send check — the client half. ONE server call (aidream `POST /crm/pre-send-check`)
// runs the PR floor (pitch advisories E1–E17), the draft critique, the fact check (knob
// `pr.auto_factcheck_on_review`), each recipient's fit and the one-per-outlet grouping, and
// returns one report. A review, never a gate: the report has no refusal field and every
// caller keeps its Send button live.
//
// Callers: the single-send dialog's "Review before send" + per-recipient fit, and the outreach
// list's send step (outlet groups). Server: aidream `aidream/services/pitch_advisories/pre_send.py`.

import type { components } from "@ai-matrx/agents/generated/api-types";
import { apiPost } from "@/lib/api/typed-client";

export type PreSendCheckRequest = components["schemas"]["PreSendCheckDoorRequest"];
export type PreSendCheckReport = components["schemas"]["PreSendCheckReport"];
export type RecipientFit = components["schemas"]["RecipientFit"];
export type OutletGroup = components["schemas"]["OutletGroup"];
export type PartStatus = components["schemas"]["PartStatus"];

export async function runPreSendCheck(
  organizationId: string,
  request: PreSendCheckRequest,
): Promise<PreSendCheckReport> {
  const { data } = await apiPost("/crm/pre-send-check", request, { organizationId });
  return data;
}

/** Fit verdicts in the words a person reads; `null` = never checked. */
export function fitLabel(verdict: string | null | undefined): string {
  switch (verdict) {
    case "fit":
      return "Fit";
    case "soft_fit":
      return "Soft fit";
    case "no_fit":
      return "Not a fit";
    case "unknown":
      return "Unknown";
    default:
      return "Not checked";
  }
}

export function fitTone(
  verdict: string | null | undefined,
): "good" | "mid" | "bad" | "none" {
  if (verdict === "fit") return "good";
  if (verdict === "soft_fit") return "mid";
  if (verdict === "no_fit") return "bad";
  return "none";
}
