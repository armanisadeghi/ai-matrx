// app/(core)/reports/page.tsx
//
// Reports module landing — lists every available report (Agent Drift is the
// first). The module is built around this so future reports plug into the
// registry (features/reports/registry.ts).

import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ReportsLanding } from "@/features/reports/components/ReportsLanding";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export const metadata = {
  title: "Reports | AI Matrx",
  description: "Cross-cutting reports — agent drift detection and more.",
};

export default async function ReportsPage() {
  const { isAuthenticated } = await getServerAuth();
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
      <PageHeader>
        <div className="flex items-center gap-2 px-1">
          <h1 className="text-sm font-semibold text-foreground">Reports</h1>
        </div>
      </PageHeader>
      <div className="w-full">
        <div className="container mx-auto max-w-[1400px] px-4 py-6 sm:px-6 md:px-8">
          <p className="mb-4 text-sm text-muted-foreground">
            Cross-cutting views over your work. Open a report to drill in.
          </p>
          <ReportsLanding mode="user" />
        </div>
      </div>
    </>
  );
}
