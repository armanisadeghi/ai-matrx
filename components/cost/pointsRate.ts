/**
 * components/cost/pointsRate.ts
 *
 * THE points-per-dollar rate this viewer's costs convert at: the
 * `billing.points_per_usd` feature knob (Arman, 2026-09-30: the rate is ONE
 * setting). The platform sets the default; an organization may be given its
 * own rate (enterprise pricing); a person never has one. It is read from the
 * ONE knob snapshot (`lib/scoped-config/effectiveKnobs.ts`) for the active
 * organization — no extra round trip, and no rate is written down in this repo.
 *
 * `currentPointsRate()` is for code that runs OUTSIDE render (copy text, a
 * toast, a helper that formats a cost): it answers from the snapshot, and on a
 * miss starts the one fetch and answers `null`. Render code gets the rate from
 * `useCostDisplay()` / `<Cost/>`, which subscribe, so the screen fills in the
 * moment the snapshot lands. `null` makes a cost unmeasured ("—") in
 * `@ai-matrx/kit/format` — never a figure from a rate nobody chose.
 *
 * `usePointsRate()` is the render face: it subscribes to the store (whose
 * organization) and to the knob snapshot, and tolerates a tree with no Redux
 * Provider (embeds, portals, unit tests) by answering `null`.
 */

import { parsePointsRate } from "@ai-matrx/kit/format";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import type { RootState } from "@/lib/redux/store";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  ensureEffectiveKnob,
  peekEffectiveKnob,
  type KnobAddress,
} from "@/lib/scoped-config/effectiveKnobs";

/** The one address of the rate in the knob register. */
export const POINTS_RATE_KNOB: KnobAddress = { feature: "billing", key: "points_per_usd" };

/** Whose rate: the active organization (its override wins) and the signed-in person. */
export function selectPointsRateAddress(state: RootState): {
  organizationId: string | null;
  userId: string | null;
} {
  return {
    organizationId: state.appContext != null ? (selectOrganizationId(state) ?? null) : null,
    userId: state.userAuth != null ? (selectUserId(state) ?? null) : null,
  };
}

let reported = false;

/** The viewer's rate right now, or `null` until the knob snapshot has answered. */
export function currentPointsRate(): number | null {
  const store = getStoreSingleton();
  if (!store) return null;
  let address: { organizationId: string | null; userId: string | null };
  try {
    address = selectPointsRateAddress(store.getState() as RootState);
  } catch {
    return null;
  }
  if (!address.userId) return null;
  const raw = peekEffectiveKnob(address.organizationId, address.userId, POINTS_RATE_KNOB);
  if (raw === undefined) {
    void ensureEffectiveKnob(address.organizationId, address.userId, POINTS_RATE_KNOB).catch(
      (error: unknown) => {
        if (reported) return;
        reported = true;
        console.error(
          "[cost] the points rate (billing.points_per_usd) could not be read, so costs show as unmeasured (—) until it can:",
          error,
        );
      },
    );
    return null;
  }
  return parsePointsRate(raw);
}
