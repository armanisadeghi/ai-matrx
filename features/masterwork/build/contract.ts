/**
 * Matches `BuildMasterworkRequest.deliverable` in aidream's build API
 * (`aidream/services/masterworks/models.py`) — the server is the authority and
 * this mirrors it.
 *
 * 2026-08-24: raised 500 -> 4000 ON BOTH SIDES. The field's label asks the
 * Expert to describe the finished thing "in your own words, the way you'd
 * describe it to a client"; Arman did exactly that in 512 characters and the
 * build died on a raw 422. Clamping the textarea to 500 (the first attempt at
 * this fix) was the wrong direction — it silently truncates the answer the
 * label asked for. A field that invites prose gets a cap prose cannot reach.
 */
export const MASTERWORK_DELIVERABLE_MAX_LENGTH = 4000;

export function buildDeliverableValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function isBuildDeliverableValid(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= MASTERWORK_DELIVERABLE_MAX_LENGTH;
}
