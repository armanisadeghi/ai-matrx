"use client";

/**
 * The inbox's entry point where people already look — the workflows catalog
 * header (census #38: "no list, badge or route anywhere").
 *
 * 🚨 **Quiet at zero.** It renders NOTHING when nothing is waiting, and nothing
 * while it is still finding out. A permanent "0 waiting" chip trains people to
 * stop seeing the control, which costs exactly the runs this inbox exists to
 * surface. It also stays silent on a failed read: the inbox route states that
 * error properly, and a header is the wrong place to alarm someone about a
 * projection they did not ask for.
 *
 * It shares the ONE announce subscription with every other discovery surface
 * (`useRunAnnouncements`), so mounting it in the header costs no extra socket.
 */

import Link from "next/link";
import { Inbox } from "lucide-react";

import { useWaitingRuns } from "../useWaitingRuns";

export function WaitingBadge({ className }: { className?: string }) {
  const { rows, loading, error } = useWaitingRuns();
  if (loading || error || rows.length === 0) return null;

  return (
    <Link
      href="/workflows/waiting"
      data-waiting-badge={rows.length}
      title={`${rows.length} ${rows.length === 1 ? "run is" : "runs are"} waiting on you`}
      className={
        "inline-flex h-7 items-center gap-1.5 rounded-full bg-amber-500/10 px-2 text-xs " +
        "font-medium text-amber-600 hover:bg-amber-500/20 dark:text-amber-400 " +
        (className ?? "")
      }
    >
      <Inbox className="h-3.5 w-3.5" />
      <span className="tabular-nums">{rows.length}</span>
      <span className="hidden sm:inline">waiting on you</span>
    </Link>
  );
}
