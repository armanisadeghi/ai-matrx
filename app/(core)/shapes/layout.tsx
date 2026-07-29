// Server Component layout. Guests never see the Shapes studio (list, detail,
// instances, new) — there is no marketing landing for this feature yet, so
// they get the shared ModuleSignInGate panel instead of a raw login redirect
// (module-landing-pages doctrine).

import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { shapesListMetadata } from "@/features/content-ir/studio/shape-studio-metadata";

export const metadata = shapesListMetadata;

export default async function ShapesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Shapes"
        route="/shapes"
        description="Design and manage the structured content shapes your agents produce and render."
      />
    );
  }
  return children;
}
