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
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
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
import { applyServerUsageState, refreshUsageInBackground } from "./usageGate";
import { resetSubject, usageNoticeKey } from "./usageState";
import { supabase } from "@/utils/supabase/client";
import { selectUsageGateFreePeriod } from "../state/selectors";
import {
  FREE_PERIOD_WARNING_DAYS_FALLBACK,
  freePeriodNoticeFor,
} from "../coupons/freePeriodNotice";
import { catalogPlanName } from "../coupons/planName";

const FREE_PERIOD_NOTICE_STORAGE = "matrx:free-period-notice";

function readShownDay(): string | null {
  try {
    return window.localStorage.getItem(FREE_PERIOD_NOTICE_STORAGE);
  } catch {
    return null;
  }
}

function writeShownDay(key: string): void {
  try {
    window.localStorage.setItem(FREE_PERIOD_NOTICE_STORAGE, key);
  } catch {
    // Storage blocked: the notice may show again on the next load — harmless.
  }
}

/** Notices already shown this session, keyed by `usageNoticeKey`. */
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
  const freePeriod = useAppSelector(selectUsageGateFreePeriod);
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
        // Sent after the run settled — newer than the pending after-call read.
        if (!applyServerUsageState(dispatch, payload, { settled: true })) {
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
    const key = usageNoticeKey(level, bindingPeriod, resetsAt);
    if (shownNotices.has(key)) return;
    shownNotices.add(key);
    const reset = formatReset(resetsAt);
    toast.info(
      level === "near"
        ? "You're close to your AI usage limit"
        : "You've reached your AI usage limit",
      {
        id: "usage-gate-notice",
        // The window is NAMED: a person near both her weekly and monthly limits saw "Resets Sun, Nov 1" on
        // one load and "Resets Mon, Oct 12" on the next as the binding window moved (bug desk 2026-10-08).
        ...(reset ? { description: `${resetSubject(bindingPeriod)} resets ${reset}` } : {}),
      },
    );
  }, [level, bindingPeriod, resetsAt]);

  // Free time ends (rule 18): a reminder N days before (knob
  // billing/free_period_warning_days), then a "choose a plan" prompt once it
  // ended — once per day, dismissible, a door to checkout and never a block.
  useEffect(() => {
    if (!userId || !freePeriod?.endsAt) return undefined;
    let live = true;
    void (async () => {
      let warningDays = FREE_PERIOD_WARNING_DAYS_FALLBACK;
      if (freePeriod.status === "active") {
        const { data, error } = await supabase
          .schema("platform")
          .rpc("knob_resolve", {
            p_feature: "billing",
            p_key: "free_period_warning_days",
            // A platform-wide knob: no organization rung. The generator types
            // every param without a SQL default as non-null; the function
            // takes NULL here (the server's own call does the same).
            p_organization_id: null as unknown as string,
            p_user_id: userId,
          });
        if (error) {
          console.warn(
            "[usage-gate] free_period_warning_days unreadable; using the fallback.",
            error.message,
          );
        } else if (typeof data === "number" && data > 0) {
          warningDays = data;
        }
      }
      if (!live) return;
      const due = freePeriodNoticeFor(freePeriod, warningDays, new Date());
      if (!due || readShownDay() === due.dayKey || shownNotices.has(due.dayKey))
        return;
      shownNotices.add(due.dayKey);
      const name = await catalogPlanName(freePeriod.planKey);
      if (!live) return;
      const notice =
        freePeriodNoticeFor(freePeriod, warningDays, new Date(), name) ?? due;
      // "Once per day" counts from when the person dealt with it (dismissed or
      // chose a plan) — a notice raised before the toaster mounted is never
      // marked seen without being seen.
      const show = notice.kind === "ended" ? toast.warning : toast.info;
      show(notice.title, {
        id: "free-period-notice",
        duration: Infinity,
        onDismiss: () => writeShownDay(due.dayKey),
        action: {
          label: "Choose a plan",
          onClick: () => {
            writeShownDay(due.dayKey);
            router.push("/pricing");
          },
        },
      });
    })();
    return () => {
      live = false;
    };
  }, [userId, freePeriod, router]);

  if (!refusal) return null;
  return (
    <UsageLimitDialog
      open
      onOpenChange={(open) => {
        if (!open) dispatch(setUsageRefusal(null));
      }}
      meter={periodLabel(refusal.period)}
      used={refusal.used}
      limit={refusal.limit}
      {...(refusal.resetsAt ? { resetsAt: refusal.resetsAt } : {})}
      {...(planName ? { currentPlan: planName } : {})}
      onSelect={() => {
        dispatch(setUsageRefusal(null));
        router.push("/pricing");
      }}
    />
  );
}
