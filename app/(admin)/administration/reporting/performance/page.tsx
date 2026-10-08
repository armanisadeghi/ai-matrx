import type { Metadata } from "next";
import { PerformanceWatchConsole } from "@/features/admin/performance-watch/PerformanceWatchConsole";

/**
 * Performance — every performance watch (ops.proof_check kind='perf') with its samples
 * (ops.perf_sample), read LIVE. Feature: features/admin/performance-watch.
 * Admin gating is the (admin) layout's job — never re-gate here.
 */

export const metadata: Metadata = {
  title: "Performance",
  description:
    "Every performance watch: newest number against its budget, state, 7-day trend, baseline and last alert — drill into one watch's history and samples.",
};

export default function PerformancePage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] bg-textured">
      <PerformanceWatchConsole />
    </div>
  );
}
