import { MandateAdminListPage } from "@/features/mandates/admin-list/MandateAdminListPage";

// Intelligence → Mandate support lookup (Arman, 2026-09-26): a SUPPORT tool
// for looking into an organization's or a person's mandates — Organizations /
// Users / All, narrowable to one organization or one person. System mandates
// are managed on /administration/intelligence/mandates, which never shows a
// tenant's mandate.
export default function IntelligenceMandateSupportLookupPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <MandateAdminListPage lane="support" />
    </div>
  );
}
