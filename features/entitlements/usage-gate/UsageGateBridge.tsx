"use client";

// features/entitlements/usage-gate/UsageGateBridge.tsx
//
// Render-free until a limit is hit. The one React mount of the usage gate:
//   • boot fallback — when the layout did not seed an answer (a non-(core)
//     route, or the landing read failed) it reads once, off any request path;
//   • the `usage_state_changed` server-bus directive → Redux;
//   • the one-line near / over notice — once per window per session;
//   • the limit dialog while a fresh `over` (or a server refusal) holds a
//     refusal in Redux.
// Rules: common-docs/systems/platform/entitlements-knobs/USAGE-GATE.md.

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useAppDispatch,
  useAppSelector,
  useAppStore,
} from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { registerDirectiveHandler } from "@/lib/client-directives/directiveRegistry";
import { toast } from "@/lib/toast";
import { UsageLimitDialog } from "@/features/pricing/components/UsageLimitDialog";
import {
  selectUsageGateBindingPeriod,
  selectUsageGateFetchedAt,
  selectUsageGateLevel,
  selectUsageGatePlanName,
  selectUsageGateRefusal,
  selectUsageGateResetsAt,
} from "../state/selectors";
import { setUsageRefusal } from "../state/entitlementsSlice";
import {
  applyServerUsageState,
  refreshUsageInBackground,
} from "./usageGate";

/** Notices already shown this session, keyed by level + window + reset. */
const shownNotices = new Set<string>();

function formatReset(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Human name of a window period for the dialog's meter label. */
function periodLabel(period: string | undefined): string {
  switch (period) {
    case "day":
      return "Daily usage";
    case "week":
      return "Weekly usage";
    case "month":
      return "Monthly usage";
    case "rolling_1h":
      return "Hourly usage";
    case "rolling_5h":
      return "5-hour usage";
    default:
      return "Usage";
  }
}

export function UsageGateBridge() {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const level = useAppSelector(selectUsageGateLevel);
  const bindingPeriod = useAppSelector(selectUsageGateBindingPeriod);
  const resetsAt = useAppSelector(selectUsageGateResetsAt);
  const fetchedAt = useAppSelector(selectUsageGateFetchedAt);
  const planName = useAppSelector(selectUsageGatePlanName);
  const refusal = useAppSelector(selectUsageGateRefusal);
  const bootReadFor = useRef<string | null>(null);

  // Boot fallback: no landing answer for this person → one background read.
  useEffect(() => {
    if (!userId || fetchedAt !== null || bootReadFor.current === userId) return;
    bootReadFor.current = userId;
    void refreshUsageInBackground(dispatch, store.getState);
  }, [userId, fetchedAt, dispatch, store]);

  // Server notification: the full state, published per user.
  useEffect(
    () =>
      registerDirectiveHandler("usage_state_changed", (payload) => {
        if (!applyServerUsageState(dispatch, payload)) {
          console.warn(
            "[usage-gate] usage_state_changed carried no usage state — ignored.",
            payload,
          );
        }
      }),
    [dispatch],
  );

  // The one-line notice. near: once per window per session. A held `over`
  // shows the notice too — only a FRESH over blocks (rule 12).
  useEffect(() => {
    if (level !== "near" && level !== "over") return;
    const key = `${level}:${bindingPeriod ?? ""}:${resetsAt ?? ""}`;
    if (shownNotices.has(key)) return;
    shownNotices.add(key);
    const reset = formatReset(resetsAt);
    toast.info(
      level === "near"
        ? "You're close to your AI usage limit"
        : "You've reached your AI usage limit",
      {
        id: "usage-gate-notice",
        ...(reset ? { description: `Resets ${reset}` } : {}),
      },
    );
  }, [level, bindingPeriod, resetsAt]);

  if (!refusal) return null;
  return (
    <UsageLimitDialog
      open
      onOpenChange={(open) => {
        if (!open) dispatch(setUsageRefusal(null));
      }}
      meter={periodLabel(refusal.period)}
      used={refusal.used}
      limit={refusal.limit ?? refusal.used}
      {...(refusal.resetsAt ? { resetsAt: refusal.resetsAt } : {})}
      {...(planName ? { currentPlan: planName } : {})}
      onSelect={() => {
        dispatch(setUsageRefusal(null));
        router.push("/pricing");
      }}
    />
  );
}
