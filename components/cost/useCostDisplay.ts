"use client";

/**
 * components/cost/useCostDisplay.ts
 *
 * THE single decision point for how a cost is shown to the person looking.
 * Administration pages show the stored USD cost together with the points
 * equivalent; the single-unit preference still applies on other pages.
 *
 * Arman, 2026-09-27: "No one talks cost to a normal user, only api users. For
 * normal users, they use points or credits … Everyone should see
 * credits/points except for system admins who should always be able to toggle
 * to see $." So:
 *   - every viewer sees POINTS, at the `billing.points_per_usd` knob's rate for
 *     the active organization (`pointsRate.ts`), converted by `@ai-matrx/kit/format`;
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

import { useContext, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ReactReduxContext } from "react-redux";
import {
  formatCost,
  usdToPoints,
  type CostUnit,
} from "@ai-matrx/kit/format";
import type { RootState } from "@/lib/redux/store";
import { selectCanToggleCostUnit, selectCostUnit } from "./costUnit";
import { formatAdminCost } from "./formatAdminCost";
import { usePointsRate } from "./pointsRate.client";

export { currentCostUnit, selectCostUnit, selectShowCostInUsdPreference } from "./costUnit";
export { currentPointsRate, POINTS_RATE_KNOB } from "./pointsRate";
export { usePointsRate } from "./pointsRate.client";

export interface CostDisplay {
  /** `"points"` for everyone; `"usd"` only for an admin who flipped the switch. */
  unit: CostUnit;
  /** True when the viewer may flip the switch at all (system admins). */
  canToggle: boolean;
  /**
   * Points per dollar for this viewer's organization (the `billing.points_per_usd`
   * knob), or `null` until the knob snapshot answers — costs read "—" meanwhile.
   */
  rate: number | null;
  /** A USD cost → the viewer's string: `"1,234 points"` or `"$0.0617"`. */
  format: (
    usd: number | null | undefined,
    options?: { short?: boolean; unknown?: string },
  ) => string;
  /** A USD cost → whole points (for math, tiers, sorting). */
  toPoints: (usd: number | null | undefined) => number | null;
}

const noopSubscribe = () => () => {};

/**
 * Reads the store WITHOUT requiring a Provider: a cost rendered in an embed,
 * a portal outside the app shell, or a unit test with no store shows points —
 * the unit every viewer gets — instead of crashing the surface.
 */
function useCostState(): { unit: CostUnit; canToggle: boolean } {
  const ctx = useContext(ReactReduxContext);
  const store = ctx?.store ?? null;
  const unit = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => (store ? selectCostUnit(store.getState() as RootState) : "points"),
    () => "points" as CostUnit,
  );
  const canToggle = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => (store ? selectCanToggleCostUnit(store.getState() as RootState) : false),
    () => false,
  );
  return { unit, canToggle };
}

/**
 * Does this viewer's SEAT see dollars (and the points-per-dollar rate) at all? Only a system admin.
 * Arman, 2026-10-08: "20,000 is correct and should be that for admins to see everywhere and nothing
 * else. Users should never see that number or any conversion." Organization admins are users. Every
 * dollar figure beside points (`AdminUsd`, `CostFigures`, `useAdminCost`) asks THIS, so a shared
 * component rendered on an organization page can never leak a rate; no page decides for itself.
 */
export function useSeesDollars(): boolean {
  return useCostState().canToggle;
}

export function useCostDisplay(): CostDisplay {
  const { unit, canToggle } = useCostState();
  // Subscribes: the moment the knob snapshot lands (or an organization's rate
  // changes), every cost on screen re-renders at the real rate.
  const rate = usePointsRate();
  const pathname = usePathname();
  const showBoth = canToggle && pathname?.startsWith("/administration") === true;
  return {
    unit,
    canToggle,
    rate,
    format: (usd, options) =>
      showBoth
        ? formatAdminCost(usd, { ...options, rate })
        : formatCost(usd, { ...options, unit, rate }),
    toPoints: (usd) => usdToPoints(usd, { rate }),
  };
}
