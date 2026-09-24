import { Map } from "lucide-react";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export default async function MapsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="Maps"
        route="/maps"
        description="Create and keep visual maps of how ideas, people, and systems connect."
        icon={Map}
      />
    );
  }
  return children;
}
