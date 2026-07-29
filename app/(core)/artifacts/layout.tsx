import { Package } from "lucide-react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export const metadata = createRouteMetadata("/artifacts", {
  title: "Artifacts",
  description: "Browse and manage CMS content artifacts and reusable blocks.",
  letter: "Ar",
});

// Guests must never see the workspace tree (its artifact list fetch is
// user-scoped and surfaces an error panel for anonymous visitors). Branch
// server-side, per the module-landing-pages doctrine.
export default async function ArtifactsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Artifacts"
        route="/artifacts"
        description="Your content library — reusable artifacts and blocks created across your workspace."
        icon={Package}
      />
    );
  }
  return children;
}
