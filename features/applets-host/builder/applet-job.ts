"use client";

// features/applets-host/builder/applet-job.ts — one of her agents or workflows becomes a JOB of the Applet's
// organization (lane A1).
//
// An Applet runs work only through a job (a mandate, `app.definition.mandates` → `useJob` →
// `POST /ai/mandates/<key>`); the job decides who answers. So an attached agent or workflow is made a soft
// job homed in the Applet's organization (`POST /mandates/soft`, level organization) whose own default
// answer is that agent or workflow (`PUT /mandates/<key>/default-holder`) — the platform's two existing
// doors, nothing new. Access is the server's: a job is made only by an administrator of that organization,
// and only with an agent or workflow the organization can run (the containment check); a refusal is shown
// in the server's own words. Attaching the same agent again reuses its job.

import type { AppDispatch } from "@/lib/redux/store";
import { createClient } from "@/utils/supabase/client";
import { createSoftMandate } from "@/features/mandates/authoring-level/service";
import { agentDefaultHolder, putMandateDefaultHolder } from "@/features/mandates/overrides";
import { storedMandateKey } from "@ai-matrx/agents/mandates";

/** Every job made for an Applet starts with this (the namespace is the feature, the rest names the job). */
export const APPLET_JOB_PREFIX = "applets.run_";

/** `applets.run_<name words>_<6 of the holder id>`: a valid, unique job key for this holder. */
export function appletJobKey(name: string, holderId: string): string {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  const tail = holderId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 6) || "job";
  return `${APPLET_JOB_PREFIX}${words ? `${words}_` : ""}${tail}`;
}

export interface AppletJob {
  /** The job's (mandate's) key. */
  jobKey: string;
  label: string;
}

/** The job already made for this holder in this organization, if any. */
async function existingJob(organizationId: string, holder: "agent" | "workflow", holderId: string): Promise<AppletJob | null> {
  const { data, error } = await createClient()
    .schema("mandate")
    .from("definition")
    .select("mandate_key, label")
    .eq("organization_id", organizationId)
    .eq("default_holder_type", holder)
    .eq("default_holder_id", holderId)
    .like("mandate_key", `${APPLET_JOB_PREFIX}%`)
    .is("deleted_at", null)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  return row ? { jobKey: row.mandate_key, label: row.label ?? row.mandate_key } : null;
}

/** The job this Applet runs for her agent or workflow — made the first time, reused after. */
export async function jobForHolder(
  dispatch: AppDispatch,
  input: { organizationId: string; holder: "agent" | "workflow"; holderId: string; name: string; description?: string | null },
): Promise<AppletJob> {
  const found = await existingJob(input.organizationId, input.holder, input.holderId);
  if (found) return found;
  const label = input.name.trim() || (input.holder === "agent" ? "Agent" : "Workflow");
  const created = await createSoftMandate(dispatch, {
    level: "organization",
    organizationId: input.organizationId,
    mandateKey: appletJobKey(label, input.holderId),
    label,
    goal: input.description?.trim() || `Run ${label} for an Applet.`,
    outputKind: null,
    draftInputs: [],
  });
  await putMandateDefaultHolder(
    dispatch,
    storedMandateKey(created.mandateKey),
    input.holder === "agent"
      ? agentDefaultHolder(input.holderId)
      : { holderType: "workflow", agentId: null, agentVersionId: null, useLatest: true, holderId: input.holderId, holderVersionId: null },
  );
  return { jobKey: created.mandateKey, label };
}
