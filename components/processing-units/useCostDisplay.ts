"use client";

/**
 * components/processing-units/useCostDisplay.ts
 *
 * THE single decision point for "who may see raw dollars".
 *
 * Product rule: every user sees cost as Processing Units. Admins additionally
 * see the underlying USD, because they are the ones who have to reconcile the
 * unit scale against the real provider bill. That rule is implemented ONCE,
 * here — never re-derive it from an inline `useAppSelector(selectIsAdmin)`
 * next to a dollar sign, or the two surfaces will drift and a user will
 * eventually be shown money.
 *
 * Gate: `selectIsAdmin` (any admin tier — developer / senior_admin /
 * super_admin). Deliberately lower than the `selectIsSuperAdmin` default,
 * because this grants *visibility of our own cost basis* on the viewer's own
 * data — not access to anything protected. Raise it to `selectIsSuperAdmin`
 * here, in one line, if that ever changes.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { costToUnits, formatUnits, formatUsd } from "@/lib/processing-units/units";

export interface CostDisplay {
  /** True when the viewer is allowed to see raw USD alongside units. */
  showUsd: boolean;
  /** USD → Processing Units integer. */
  toUnits: (usd: number | null | undefined) => number;
  /** "3,259 units" — safe for every viewer. */
  units: (usd: number | null | undefined, opts?: { short?: boolean }) => string;
  /** "$1.63" for admins, "" for everyone else. Never render unguarded. */
  usd: (usd: number | null | undefined) => string;
  /**
   * The full label: "3,259 units" for users, "3,259 units · $1.63" for admins.
   * Use this anywhere a single string is needed.
   */
  label: (usd: number | null | undefined, opts?: { short?: boolean }) => string;
}

export function useCostDisplay(): CostDisplay {
  const showUsd = useAppSelector(selectIsAdmin);

  return {
    showUsd,
    toUnits: costToUnits,
    units: (usd, opts) => formatUnits(costToUnits(usd), opts),
    usd: (usd) => (showUsd ? formatUsd(usd) : ""),
    label: (usd, opts) => {
      const unitLabel = formatUnits(costToUnits(usd), opts);
      return showUsd ? `${unitLabel} · ${formatUsd(usd)}` : unitLabel;
    },
  };
}
