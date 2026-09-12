// features/admin/spend/DailySpendPopoverMount.tsx
//
// Render-free. Raises the daily spend popover for a Super Admin on their first
// app open of each local day (Arman, 2026-09-11: "floating window popovers that
// come up once a day or a couple times a day"). Mounted in the deferred
// singleton tree, so it never delays first paint.
//
// The cadence is the knob `platform.spend_popover.times_per_day` — 1 by
// default, 0 turns it off entirely. The "already seen it today" memory is
// local-first and per viewer (`dailySpendPopoverState.ts`); a dismissal ends
// the day regardless of the cadence.
//
// Failure is loud, not silent: if the cadence knob cannot be read this logs and
// does nothing, rather than guessing a cadence.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useEffect, useRef } from "react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { useOpenDailySpendWindow } from "@/features/overlays/openers/dailySpendWindow";

import { recordShown, shouldShow } from "./dailySpendPopoverState";
import { useSpendPopoverKnobs } from "./useSpendPopoverKnobs";

export function DailySpendPopoverMount(): null {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const { knobs, loading, error } = useSpendPopoverKnobs();
  const openWindow = useOpenDailySpendWindow();
  const raised = useRef(false);

  useEffect(() => {
    if (!isSuperAdmin || loading || raised.current) return;

    if (error) {
      // Nothing fails silently: no cadence, no popover, and a reason on the
      // console rather than an invented default.
      console.warn(
        "[spend] daily popover not shown — platform.spend_popover.times_per_day could not be read:",
        error.message,
      );
      raised.current = true;
      return;
    }

    if (!knobs) return;
    if (!shouldShow(knobs.timesPerDay)) {
      raised.current = true;
      return;
    }

    raised.current = true;
    recordShown();
    openWindow();
  }, [isSuperAdmin, knobs, loading, error, openWindow]);

  return null;
}
