// app/(admin)/administration/reporting/reports/page.tsx
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
      <ReportsLanding mode="admin" />
    </div>
  );
}
