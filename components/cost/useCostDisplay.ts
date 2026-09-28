"use client";

/**
 * components/cost/useCostDisplay.ts
 *
 * THE single decision point for how a cost is shown to the person looking.
 *
 * Arman, 2026-09-27: "No one talks cost to a normal user, only api users. For
 * normal users, they use points or credits … Everyone should see
 * credits/points except for system admins who should always be able to toggle
 * to see $." So:
 *   - every viewer sees POINTS (20,000 points = $1, `@ai-matrx/kit/format`);
 *   - a system admin (ADMIN IDENTITY, `selectIsAdminPerson`, any
 *     `admins.level`) who flipped the "Show costs in dollars" switch in the
 *     header menu's Admin group sees $ — on every page, because the ruling says
 *     "always"; until he flips it he sees exactly what everyone sees. Named in
 *     `scripts/check-admin-lane.ts` IDENTITY_ALLOWED for that reason;
 *   - the switch is persisted per person (`userPreferences.system.showCostInUsd`,
 *     synced like every other preference) and is IGNORED for anyone who is not
 *     an admin, so a stale or hand-edited preference can never show a member
 *     money.
 *
 * The number itself is never computed here — `formatCost` / `usdToPoints` in
 * `@ai-matrx/kit/format` are the one conversion, shared with the server's
 * `ai_points.py` and Workflow Studio. Render costs with `<Cost usd={…}/>`;
 * reach for this hook only where a plain string is required (a title, a copy
 * payload, an aria-label). `pnpm check:cost-display` fails any UI file that
 * formats a cost in dollars outside this module.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdminPerson } from "@/lib/redux/selectors/userSelectors";
import {
  formatCost,
  usdToPoints,
  type CostUnit,
} from "@ai-matrx/kit/format";
import type { RootState } from "@/lib/redux/store";

/** Admin identity, tolerant of a store without the auth slice (embeds, tests). */
const selectCanToggleCostUnit = (state: RootState): boolean =>
  state.userAuth != null && selectIsAdminPerson(state);

/** The raw preference, whatever the viewer's role (admin-only in effect). */
export const selectShowCostInUsdPreference = (state: RootState): boolean =>
  state.userPreferences?.system?.showCostInUsd === true;

/** The unit THIS viewer sees: dollars only for an admin who asked for them. */
export const selectCostUnit = (state: RootState): CostUnit =>
  selectCanToggleCostUnit(state) && selectShowCostInUsdPreference(state)
    ? "usd"
    : "points";

export interface CostDisplay {
  /** `"points"` for everyone; `"usd"` only for an admin who flipped the switch. */
  unit: CostUnit;
  /** True when the viewer may flip the switch at all (system admins). */
  canToggle: boolean;
  /** A USD cost → the viewer's string: `"1,234 points"` or `"$0.0617"`. */
  format: (
    usd: number | null | undefined,
    options?: { short?: boolean; unknown?: string },
  ) => string;
  /** A USD cost → whole points (for math, tiers, sorting). */
  toPoints: (usd: number | null | undefined) => number | null;
}

export function useCostDisplay(): CostDisplay {
  const unit = useAppSelector(selectCostUnit);
  const canToggle = useAppSelector(selectCanToggleCostUnit);
  return {
    unit,
    canToggle,
    format: (usd, options) => formatCost(usd, { ...options, unit }),
    toPoints: usdToPoints,
  };
}
