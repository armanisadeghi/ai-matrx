/**
 * features/research/utils/researchAction.ts
 *
 * Every research action that reaches the server runs in a workspace. With none
 * chosen, the transport refused with `OrganizationContextError` and the
 * buttons ("Re-read", "Save Content") did nothing but log it — a dead control.
 *
 * `runResearchAction` asks FIRST, through the platform's one funnel
 * (`ensureOrgId` → the workspace picker, the same prompt the Sources page
 * uses), then runs the action. Every outcome is said out loud:
 *   - the person closes the picker → nothing happened, by their choice; the
 *     platform treats that answer as silence (no toast), and so do we;
 *   - the picker cannot be shown at all → "Nothing was added: choose a
 *     workspace first";
 *   - the action itself fails → the failure's own sentence.
 * Returns the action's result, or `null` when it did not run or failed.
 */
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { toast } from "@/lib/toast";

export const NO_WORKSPACE_SENTENCE = "Nothing was added: choose a workspace first";

function isOrganizationContextError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "OrganizationContextError"
  );
}

export async function runResearchAction<T>(
  failureTitle: string,
  action: () => Promise<T>,
): Promise<T | null> {
  try {
    await ensureOrgId(null);
    return await action();
  } catch (error) {
    if (isOrganizationSelectionCancelled(error)) return null;
    if (isOrganizationContextError(error)) {
      toast.error(NO_WORKSPACE_SENTENCE);
      return null;
    }
    const why =
      error instanceof Error && error.message
        ? error.message
        : "The server did not say why.";
    toast.error(`${failureTitle}: ${why}`);
    return null;
  }
}
