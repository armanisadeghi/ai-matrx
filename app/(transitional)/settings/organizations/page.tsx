"use client";

import { OrganizationList } from "@/features/organizations/components/OrganizationList";

export default function SettingsOrganizationsPage() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      <OrganizationList />
    </div>
  );
}
