import type { Metadata } from "next";
import { FileUp } from "lucide-react";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ImportWizard } from "@/features/crm/components/import/ImportWizard";

export const metadata: Metadata = {
  title: "Import contacts — CRM",
  description: "Import people and companies into the CRM from a CSV file.",
};

/**
 * /crm/import — CSV import wizard: source → map columns → dry-run preview →
 * commit. Nothing writes until the user confirms the preview.
 */
export default async function CrmImportRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Import contacts"
        route="/crm/import"
        description="Bring your people and companies into the CRM from a CSV export."
        icon={FileUp}
      />
    );
  }

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center gap-2 px-1">
          <FileUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-sm font-semibold text-foreground">
            Import contacts
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <ImportWizard />
      </div>
    </>
  );
}
