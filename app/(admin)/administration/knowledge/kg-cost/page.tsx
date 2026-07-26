import { KgCostDashboard } from "@/features/administration/kg-cost/components/KgCostDashboard";

export const metadata = {
  title: "KG Cost · Administration",
  description:
    "Admin view of auto-ingest spend per org, in-flight provider batches, and the 4 KPI tiles (spend today, spend 7d, orgs over 80% of cap, pending batches).",
};

export default function Page() {
  return <KgCostDashboard />;
}
