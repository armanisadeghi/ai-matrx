"use client";

/**
 * THE one place social screens get cost words. Arman, 2026-10-09: a provider's charge is "our
 * business, not the user's" — it is a hard cost, charged in points exactly like AI tokens
 * (20,000 points = $1 of hard cost, rounded up per call). So:
 *
 *   - the server says what each action costs us (`GET /social/costs`, USD from the same price knob
 *     the ledger charges with); this hook turns it into points through `useCostDisplay` (the one
 *     cost formatter: points for everyone, dollars only for a system admin who flipped the switch);
 *   - like every AI action, a cost is shown — and confirmed — only when it is worth a warning
 *     (`shouldWarnAboutCost`, ~$5 and up). A trivial cost shows nothing and asks nothing;
 *   - never a vendor name, never "credits".
 *
 * Screens call `useSocialSpend(organizationId)`:
 *   `costText("track", 3)` -> "≈ 114 points" or null (trivial / unknown),
 *   `await confirmSpend("profile_page", pages, { title, confirmLabel })` -> true when trivial,
 *   otherwise the shared confirm dialog naming the points.
 */

import { useQuery } from "@tanstack/react-query";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { shouldWarnAboutCost } from "@/components/cost/costTier";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { getCosts } from "./server";
import type { SocialCosts, SocialSpendAction } from "./types";

export type { SocialSpendAction } from "./types";

/** USD for `count` x `action`, or null when the server prices nothing for it. Pure. */
export function actionUsd(
  costs: SocialCosts | null | undefined,
  action: SocialSpendAction,
  count = 1,
): number | null {
  const unit = costs?.operations?.[action];
  if (unit == null || !Number.isFinite(unit) || count <= 0) return null;
  return unit * count;
}

/** The words for a cost, or null when it is trivial (below the warn tier) or unknown. Pure. */
export function formatPointsCost(
  usd: number | null,
  display: { format: (usd: number) => string; toPoints: (usd: number) => number | null },
): string | null {
  if (usd == null) return null;
  const points = display.toPoints(usd);
  if (points == null || !shouldWarnAboutCost(points)) return null;
  return `≈ ${display.format(usd)}`;
}

export function useSocialSpend(organizationId: string | null | undefined) {
  const { format, toPoints } = useCostDisplay();
  const costs = useQuery({
    queryKey: ["marketing", "social", "costs", organizationId],
    queryFn: ({ signal }) => getCosts({ organizationId: organizationId ?? "", signal }),
    enabled: Boolean(organizationId),
    staleTime: 60 * 60 * 1000,
  });
  const display = {
    format: (usd: number) => format(usd),
    toPoints: (usd: number) => toPoints(usd),
  };

  function costText(action: SocialSpendAction, count = 1): string | null {
    return formatPointsCost(actionUsd(costs.data, action, count), display);
  }

  async function confirmSpend(
    action: SocialSpendAction,
    count: number,
    dialog: { title: string; confirmLabel: string; description?: string },
  ): Promise<boolean> {
    const words = costText(action, count);
    if (!words) return true;
    return confirm({
      title: dialog.title,
      description: [dialog.description, `Uses ${words.replace(/^≈ /, "about ")}.`].filter(Boolean).join(" "),
      confirmLabel: dialog.confirmLabel,
    });
  }

  return { costText, confirmSpend };
}
