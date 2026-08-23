import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function ShapesWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Shapes"
        route="/shapes/all"
        description="Browse and manage the structured content shapes your agents produce and render."
      />
    );
  }
  return children;
}
