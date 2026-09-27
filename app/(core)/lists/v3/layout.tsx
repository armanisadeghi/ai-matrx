import { ListChecks } from "lucide-react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export const metadata = createRouteMetadata("/lists", {
  title: "Picklists",
  description: "Every picklist of your organization.",
  letter: "L3",
});

export default async function ListsV3Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    // Guests: the picklist editor is a signed-in workspace — its data reads
    // would surface RLS errors. Marketing lives at /lists.
    return (
      <ModuleSignInGate
        title="Picklists"
        route="/lists/v3"
        description="Create and manage reusable option sets for dropdowns, dependent pickers, and forms."
        icon={ListChecks}
      />
    );
  }
  return children;
}
