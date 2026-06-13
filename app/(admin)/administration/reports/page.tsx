// app/(admin)/administration/reports/page.tsx
//
// Admin reports landing — lists reports that have a platform-wide (admin)
// variant. Super-admin gating is inherited from the (admin) route layout.

import { ReportsLanding } from "@/features/reports/components/ReportsLanding";

export const metadata = {
  title: "Reports | Administration",
  description: "Platform-wide reports — agent drift across all users and more.",
};

export default function AdminReportsPage() {
  return (
    <div className="container mx-auto max-w-[1400px] px-4 py-6 sm:px-6 md:px-8">
      <h1 className="mb-1 text-base font-semibold text-foreground">Reports</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Platform-wide reporting across all users and organizations.
      </p>
      <ReportsLanding mode="admin" />
    </div>
  );
}
