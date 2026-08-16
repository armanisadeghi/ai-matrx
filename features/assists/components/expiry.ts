"use client";

/**
 * Expiry countdown — ONE formatter + ONE ticking hook, so the chip, the card
 * and the manager can never disagree about how long an assist has left.
 *
 * What expiry MEANS here (and the copy must never lie about): a pending row
 * past `expires_at` simply stops being offered — the live queries filter it
 * out (`service.ts` `listMyPendingAssists`). Nothing runs, nothing is
 * approved, nothing is decided. An undecided key can be re-noticed by its
 * producer later. THE INTENTIONAL-ACTION LAW applies to copy too: a countdown
 * that reads like an auto-approval timer would be the exact violation.
 *
 * Cadence: coarse labels ("3d" / "5h" / "12m" / "<1m") need at most
 * minute-level accuracy, so the hook ticks every 30s — never per-second.
 */

import { useEffect, useState } from "react";
import type { Assist } from "../types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Chips only show the countdown inside this window — they stay compact. */
export const CHIP_COUNTDOWN_WINDOW_MS = 48 * HOUR_MS;

const TICK_MS = 30_000;

/**
 * Coarse remaining-time label: "3d" (>= 48h), "5h", "12m", "<1m".
 * Hours run up to 47h on purpose — "47h" reads more urgent than "1d",
 * and the chip's 48h window renders in hours end to end.
 */
export function formatRemaining(ms: number): string {
  if (ms < MINUTE_MS) return "<1m";
  if (ms < HOUR_MS) return `${Math.floor(ms / MINUTE_MS)}m`;
  if (ms < 2 * DAY_MS) return `${Math.floor(ms / HOUR_MS)}h`;
  return `${Math.floor(ms / DAY_MS)}d`;
}

export interface AssistExpiry {
  /** Coarse remaining time — "3d", "5h", "12m", "<1m". */
  label: string;
  /** Within the chip's 48h compact-countdown window. */
  soon: boolean;
}

/**
 * Live countdown for one assist. Returns null unless the row is `pending`
 * with `expiresAt` in the future — decided, resolved and already-expired rows
 * never tick and never render a countdown. Ticks at 30s and stops itself once
 * the deadline passes.
 */
export function useAssistExpiry(
  assist: Pick<Assist, "status" | "expiresAt">,
): AssistExpiry | null {
  const target =
    assist.status === "pending" && assist.expiresAt
      ? Date.parse(assist.expiresAt)
      : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (target === null || target <= Date.now()) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= target) clearInterval(id);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [target]);

  if (target === null || Number.isNaN(target)) return null;
  const remaining = target - now;
  if (remaining <= 0) return null;
  return {
    label: formatRemaining(remaining),
    soon: remaining <= CHIP_COUNTDOWN_WINDOW_MS,
  };
}
