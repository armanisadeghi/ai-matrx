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
// WHERE it may do this is NOT decided here (D11, 2026-09-17). The window
// declares its home in the window registry and `mayRaiseUnbidden` answers;
// this mount only obeys. Away from home the raise is DEFERRED, not spent:
// `recordShown()` is not called, `raised` stays false, and the effect re-runs
// on the next navigation — so the viewer still sees it once, on a surface
// where it belongs, later the same day.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { useOpenDailySpendWindow } from "@/features/overlays/openers/dailySpendWindow";
import { mayRaiseUnbidden } from "@/features/window-panels/utils/mayRaiseUnbidden";

import { recordShown, shouldShow } from "./dailySpendPopoverState";
import { useSpendPopoverKnobs } from "./useSpendPopoverKnobs";

const OVERLAY_ID = "dailySpendWindow";

export function DailySpendPopoverMount(): null {
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const { knobs, loading, error } = useSpendPopoverKnobs();
  const openWindow = useOpenDailySpendWindow();
  const pathname = usePathname();
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

    // Not our call to make: the registry says where this window may open
    // itself, and the primitive already announced any refusal.
    const verdict = mayRaiseUnbidden(OVERLAY_ID, pathname);
    if (!verdict.allowed) {
      // Deliberately NOT marking it raised and NOT calling recordShown():
      // a deferral must cost the viewer nothing. When they land on the
      // dashboard or an administration page later today, this runs again.
      return;
    }

    raised.current = true;
    recordShown();
    openWindow();
  }, [isSuperAdmin, knobs, loading, error, openWindow, pathname]);

  return null;
}
