/**
 * One mandate's worth of `MandateWorkspaceData`, for guards that drive the real
 * `OneBindingWorkspace`.
 *
 * Deliberately minimal AND deliberately honest about which organization homes
 * the job: the home is what decides the bottom rung's scope, its words and its
 * Save label, so a fixture that left it null would be testing a mandate no
 * production row looks like.
 */
import type { MandateWorkspaceData } from "@/features/mandates/workspace/useMandateWorkspaceData";

/** The scratch organization the closing lens used, by its real name. */
export const WRITE_TARGET_SANDBOX = "org-1";
export const WRITE_TARGET_SANDBOX_NAME = "Write Target Sandbox";

/** An agent the caller has already picked, so Save is a live control. */
export const HELD_AGENT_ID = "8f0bbfc2-85d9-4913-8cea-b09a50c62be6";

export function makeWorkspaceData({
  id,
  mandateKey,
  organizationId = WRITE_TARGET_SANDBOX,
  heldBy = null,
}: {
  id: string;
  mandateKey: string;
  organizationId?: string | null;
  /**
   * The job's own default holder. Set it when the guard needs Save to be
   * ENABLED — a workspace with no holder chosen refuses the click before it
   * ever reaches the door, and a guard driving a disabled button proves
   * nothing.
   */
  heldBy?: string | null;
}): MandateWorkspaceData {
  return {
    mandate: {
      id,
      mandate_key: mandateKey,
      label: mandateKey,
      organization_id: organizationId,
      output_kind: null,
      visibility: "organization",
      default_holder_type: "agent",
      default_holder_id: heldBy,
      default_holder_version_id: null,
    },
    contract: {
      requiredVariables: [],
      requiredContextPolicyKeys: [],
      requiredOutputKeys: [],
      spillVariables: [],
    },
    provisionKey: null,
    pins: { holderId: null, holderVersionId: null },
    pinnedContext: [],
    offer: null,
    bindings: [],
    agentsById: {},
    versionsById: {},
  } as unknown as MandateWorkspaceData;
}
