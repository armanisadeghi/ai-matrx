import { FolderKanban } from "lucide-react";
import { ModuleSignInGate } from "@/features/auth/components/module-landing/ModuleSignInGate";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/projects", {
  title: "Projects",
  description:
    "Long-running containers for tasks, resources, and context across your org.",
  letter: "P",
});

export default async function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getServerAuth();

  if (!isAuthenticated) {
    // Guests never mount ProjectsHub (RLS returns nothing without a session,
    // leaving an empty/misleading workspace). Server-side gate per the
    // module-landing-pages doctrine; replace with a real landing later.
    return (
      <ModuleSignInGate
        title="Projects"
        route="/projects"
        description="Plan and track long-running work — tasks, resources, and context — across your organization."
        icon={FolderKanban}
      />
    );
  }

  return children;
}
