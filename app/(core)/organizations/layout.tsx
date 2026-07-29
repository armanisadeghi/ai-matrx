import { Building2 } from "lucide-react";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/organizations", {
  title: "Organizations",
  description: "Your personal workspace and team organizations.",
  letter: "OR",
});

export default async function OrganizationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    // Guests never mount the org workspace (its client tree renders empty /
    // error states without a session). Server-side gate per the
    // module-landing-pages doctrine; replace with a real landing later.
    return (
      <ModuleSignInGate
        title="Organizations"
        route="/organizations"
        description="Your personal workspace and team organizations — members, scopes, and settings in one place."
        icon={Building2}
      />
    );
  }

  return children;
}
