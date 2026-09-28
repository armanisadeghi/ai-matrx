/**
 * Hold a Source's landing until the person has an organization — then let it
 * continue by itself (the platform law: a request that needs an organization
 * and has none is HELD, the person SETS one, and the request proceeds —
 * `lib/organizations/ensureOrgId.ts` → `lib/organization/organization-gate.ts`).
 *
 * A landing the person just started (a click, a Fetch, an upload) is asked for
 * an organization on the spot by `ensureOrgId` (the gate opens the picker).
 * What that cannot cover — a landing that resumes after a reload, a file whose
 * Source appears seconds later, a file dropped onto the page (a drop is not a
 * press), or a person who closed the picker — used to end in a dead error on
 * the card. Instead the card says it is waiting, the gate's own notice offers
 * "Choose organization", and the moment an organization is set every held
 * landing runs again, exactly as it would have.
 */

import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";

export const WAITING_FOR_ORGANIZATION =
  "Waiting for an organization — choose one in the organization picker at the top of the page and this continues by itself.";

/** True when a landing stopped only because no organization is chosen yet. */
export function waitsForOrganization(error: unknown): boolean {
  return isOrganizationRequiredError(error) || isOrganizationSelectionCancelled(error);
}

export interface OrganizationHold {
  /** Hold `replay` under `key` (a card id); a later hold for the same key replaces it. */
  hold: (key: string, replay: () => unknown) => void;
  /** Forget a held landing (the card was removed or landed another way). */
  drop: (key: string) => void;
  /** Run every held landing once (an organization was just set). Returns how many ran. */
  release: () => number;
  readonly size: number;
}

export function createOrganizationHold(): OrganizationHold {
  const held = new Map<string, () => unknown>();
  return {
    hold: (key, replay) => {
      held.set(key, replay);
    },
    drop: (key) => {
      held.delete(key);
    },
    release: () => {
      const replays = [...held.values()];
      held.clear();
      for (const replay of replays) void Promise.resolve().then(replay);
      return replays.length;
    },
    get size() {
      return held.size;
    },
  };
}
