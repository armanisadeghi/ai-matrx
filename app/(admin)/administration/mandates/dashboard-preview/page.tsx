import { MandateDashboard } from "@/features/mandates/dashboard/MandateDashboard";

export const metadata = {
  title: "Mandate numbers | Mandates | Administration",
  description:
    "Counts and health for every system mandate: origin, binding coverage, pinned vs latest, customizations, code drift, and scan freshness.",
};

export default function MandateDashboardPreviewPage() {
  return <MandateDashboard />;
}
