/**
 * THE ONE DOOR FOR A LAUNCHER THAT RESOLVES A MANDATE BEFORE IT OPENS ANYTHING.
 *
 * A mandate answers "which agent runs this job" FOR AN ORGANIZATION. A launcher
 * (right-click Chat, Quick Chat, the tools grid, the new-chat menu…) that calls
 * `resolveMandate` with no organization selected used to throw
 * `MandateOrganizationUnresolvedError`, log it, and open a window at "Pick an
 * agent to start". This asks FIRST through the same gate every launch uses
 * (`ensureOrganizationContext`): the person picks and the launch continues in
 * that organization, or declines and this rejects with
 * `OrganizationSelectionCancelled` — callers treat that as "nothing happened"
 * and open nothing.
 *
 * Never asks when an organization is named or already selected, the admin seat
 * is in force, or nobody can be asked (a guest, SSR): those fall straight
 * through to `resolveMandate`, which owns its own refusal.
 */
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";
import { adminLaneOrganizationId } from "../host/server/admin-lane";
import { ensureOrganizationContext, getActiveOrgId, isOrganizationSelectionCancelled } from "../host/org";
import { resolveMandate, type ResolvedMandate, type ResolveMandateOptions } from "./service";

export async function resolveMandateAsking(
  mandateKey: AnyMandateKey,
  options: Omit<ResolveMandateOptions, "optional"> = {},
): Promise<ResolvedMandate> {
  let organizationId = options.organizationId ?? adminLaneOrganizationId() ?? getActiveOrgId() ?? null;
  if (!organizationId) {
    try {
      organizationId = await ensureOrganizationContext();
    } catch (error) {
      if (isOrganizationSelectionCancelled(error)) throw error;
      // Could not ask: leave the refusal to `resolveMandate`'s own sentence.
    }
  }
  return resolveMandate(mandateKey, { ...options, organizationId });
}
