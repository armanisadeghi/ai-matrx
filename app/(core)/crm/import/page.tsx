import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { ImportWizard } from "@/features/crm/components/import/ImportWizard";

export const metadata: Metadata = {
  title: "Import contacts — CRM",
  description:
    "Import people and companies from native CSV, TSV, Excel, and vCard exports.",
};

/**
 * /crm/import — native contact import: source → map columns → dry-run preview
 * → commit. Nothing writes until the user confirms the preview.
 */
export default async function CrmImportRoute() {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Import contacts"
        route="/crm/import"
        description="Bring your people and companies into the CRM from CSV, TSV, Excel, or vCard exports."
        icon={FileUp}
      />
    );
  }

  return (
    <>
      <RecordPageHeader record={{ name: "Import contacts" }} />
      <div className="h-full overflow-hidden">
        <ImportWizard />
      </div>
    </>
  );
}
