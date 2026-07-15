import { CodeWorkspaceRoute } from "@/features/code/host/CodeWorkspaceRoute";
import { CodeHeaderControls } from "@/features/code/shell/CodeHeaderControls";
import CodeLanding from "@/features/auth/components/module-landing/landings/CodeLanding";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export default async function CodeWorkspacePage() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return <CodeLanding />;
  return (
    <>
      <PageHeader>
        <CodeHeaderControls />
      </PageHeader>
      {/* Whole-surface editor (activity bar, file tabs, terminal, chat) is
          static chrome, not scrolling content — it must start below the
          glass header rather than sliding behind it. */}
      <div
        className="h-full overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        <CodeWorkspaceRoute />
      </div>
    </>
  );
}
