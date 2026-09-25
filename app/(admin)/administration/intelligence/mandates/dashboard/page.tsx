import { MandateDashboard } from "@/features/mandates/dashboard/MandateDashboard";

export const metadata = {
  title: "Mandate numbers | Mandates | Intelligence",
  description:
    "Counts and health for every system mandate: origin, binding coverage, pinned vs latest, customizations, code drift, and scan freshness.",
};

export default function IntelligenceMandateDashboardPage() {
  return <MandateDashboard />;
}
