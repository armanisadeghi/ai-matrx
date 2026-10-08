// lib/organizations/announceActiveOrganizationReplaced.ts
//
// Says it when the active organization had to change under the person: the one
// this tab held is no longer theirs (removed, archived, or a request was
// refused as not-a-member), so the load ladder chose again. A switch the person
// did not make is always announced (law 4) — through the shared toast.

import { toast } from "@/lib/toast";

export function announceActiveOrganizationReplaced(
  previousName: string | null,
  nextName: string | null,
): void {
  const next = nextName ?? "another organization";
  // An app-wide fact, not a record on this page: it outlives route changes.
  const message = previousName
    ? `You're no longer in ${previousName}. Switched to ${next}.`
    : `Switched to ${next}.`;
  toast.info(message);
}
