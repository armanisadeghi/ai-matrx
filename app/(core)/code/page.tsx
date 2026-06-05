import { CodeWorkspaceRoute } from "@/features/code/host/CodeWorkspaceRoute";
import CodeLanding from "@/features/auth/components/module-landing/landings/CodeLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function CodeWorkspacePage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <CodeLanding />;
  return <CodeWorkspaceRoute />;
}
