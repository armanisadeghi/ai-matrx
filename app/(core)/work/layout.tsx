import { Workflow } from "lucide-react";
import { createRouteMetadata } from "@/utils/route-metadata";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";

export const metadata = createRouteMetadata("/work", {
  title: "AI Work",
  description:
    "Browse, continue, organize, and configure AI work across AI Matrx and connected coding platforms.",
});

export default async function WorkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    return (
      <ModuleSignInGate
        title="AI Work"
        route="/work"
        description="Browse and organize AI Matrx work and conversations captured from connected coding platforms."
        icon={Workflow}
      />
    );
  }

  return children;
}
