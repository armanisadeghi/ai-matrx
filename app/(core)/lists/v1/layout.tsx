import { ListChecks } from "lucide-react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export const metadata = createRouteMetadata("/lists", {
  titlePrefix: "v1",
  title: "Picklists",
  description: "Picklist UI variant 1.",
  letter: "L1",
});

export default async function ListsV1Layout({
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
        route="/lists/v1"
        description="Create and manage reusable option sets for dropdowns, dependent pickers, and forms."
        icon={ListChecks}
      />
    );
  }
  return children;
}
