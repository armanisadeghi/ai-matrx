// Server Component layout. Guests never see the context-items workspace —
// there is no marketing landing for this feature yet, so they get the shared
// ModuleSignInGate panel (module-landing-pages doctrine).

import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/context-items", {
  title: "Context Items",
  description: "All context items across every organization you belong to.",
  letter: "Ci",
});

export default async function ContextItemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Context Items"
        route="/context-items"
        description="Browse and manage the context items your organizations share with your agents."
      />
    );
  }
  return children;
}
