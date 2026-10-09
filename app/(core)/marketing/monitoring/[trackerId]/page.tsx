// app/(core)/marketing/monitoring/[trackerId]/page.tsx — one news monitor's inputs.

import type { Metadata } from "next";

import { NewsTrackerInputsView } from "@/features/marketing/monitor-setup/inputs/NewsTrackerInputsView";

export const metadata: Metadata = {
  title: "News monitor",
  description: "What this news monitor's AI checks read.",
};

export default async function MarketingNewsMonitorPage({
  params,
}: {
  params: Promise<{ trackerId: string }>;
}) {
  const { trackerId } = await params;
  return <NewsTrackerInputsView trackerId={trackerId} />;
}
