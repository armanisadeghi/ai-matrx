import { MandateAdminListPage } from "@/features/mandates/admin-list/MandateAdminListPage";

// Intelligence → Mandates: the admin mandate list. Its other pages (dashboard,
// health, unconverted calls, the owner's classic console) are reached from the
// list's header, never from the menu. The owner's /administration/mandates/**
// pages keep working untouched until he validates this suite.
export default function IntelligenceMandatesPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <MandateAdminListPage />
    </div>
  );
}
