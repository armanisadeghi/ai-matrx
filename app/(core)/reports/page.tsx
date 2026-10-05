// app/(core)/reports/page.tsx
//
// Reports module landing — lists every available report (Agent Drift is the
// first). The module is built around this so future reports plug into the
// registry (features/reports/registry.ts).

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { ReportsLanding } from "@/features/reports/components/ReportsLanding";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export const metadata = {
  title: "Reports | AI Matrx",
  description: "Cross-cutting reports — agent drift detection and more.",
};

export default async function ReportsPage() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Reports"
        route="/reports"
        description="Cross-cutting reports over your workspace — agent drift detection and more."
      />
    );
  }

  return (
    <>
      <RecordPageHeader record={{ name: "Reports" }} />
      <div className="w-full">
        <div className="container mx-auto max-w-[1400px] px-4 pb-6 pt-[calc(var(--shell-header-h)+1.5rem)] sm:px-6 md:px-8">
          <ReportsLanding mode="user" />
        </div>
      </div>
    </>
  );
}
