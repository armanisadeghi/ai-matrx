// app/(core)/marketing/monitoring/[trackerId]/page.tsx — one news monitor's inputs.


import { NewsTrackerInputsView } from "@/features/marketing/monitor-setup/inputs/NewsTrackerInputsView";

export default async function MarketingNewsMonitorPage({
  params,
}: {
  params: Promise<{ trackerId: string }>;
}) {
  const { trackerId } = await params;
  return <NewsTrackerInputsView trackerId={trackerId} />;
}
