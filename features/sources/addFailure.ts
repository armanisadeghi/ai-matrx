/**
 * features/sources/addFailure.ts
 *
 * The one sentence an Add path (paste text, paste URL) shows when nothing
 * became a Source. NEVER silent: a "which workspace?" choice that was closed
 * or never surfaced used to be swallowed, leaving the dialog open with no
 * spinner, no sentence and no Source (Sonnet walk 2026-09-27).
 */

import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import { organizationRefusalMessage } from "@ai-matrx/chat/host/org";
import { sourceRefusalSentence } from "@/features/sources/api/sourcesApi";

export const WORKSPACE_NOT_CHOSEN =
  "Nothing was added: no workspace was chosen for it. Choose a workspace in the organization picker at the top of the page, then add it again.";

export function addFailureSentence(error: unknown): string {
  if (isOrganizationRequiredError(error))
    return organizationRefusalMessage({ act: "added" });
  return sourceRefusalSentence(error);
}
