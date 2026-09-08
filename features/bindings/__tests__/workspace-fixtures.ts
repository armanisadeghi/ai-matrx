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

export function makeWorkspaceData({
  id,
  mandateKey,
  organizationId = WRITE_TARGET_SANDBOX,
}: {
  id: string;
  mandateKey: string;
  organizationId?: string | null;
}): MandateWorkspaceData {
  return {
    mandate: {
      id,
      mandate_key: mandateKey,
      label: mandateKey,
      organization_id: organizationId,
      output_kind: null,
      visibility: "organization",
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
