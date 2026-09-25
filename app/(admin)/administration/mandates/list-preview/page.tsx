import { MandateAdminListPage } from "@/features/mandates/admin-list/MandateAdminListPage";

// The new admin mandate list, side by side with the console at
// /administration/mandates until the swap. No menu entry yet (placement is
// undecided — common-docs/systems/mandates/UI-REGISTER.md).
export default function MandatesListPreviewPage() {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] min-h-0 flex-col overflow-hidden">
      <MandateAdminListPage />
    </div>
  );
}
