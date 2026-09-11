import { CodeWorkspaceRoute } from "@/features/code/host/CodeWorkspaceRoute";
import { CodeHeaderControls } from "@/features/code/shell/CodeHeaderControls";
import CodeLanding from "@/features/auth/components/module-landing/landings/CodeLanding";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { createClient } from "@/utils/supabase/server";
import { decorateSandboxRow } from "@/lib/sandbox/decorate-sandbox-row";
import type { SandboxInstance } from "@/types/sandbox";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function CodeWorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ sandbox?: string | string[] }>;
}) {
  const [{ isAuthenticated, user }, params] = await Promise.all([
    getServerAuth(),
    searchParams,
  ]);
  if (!isAuthenticated) return <CodeLanding />;

  const hasSandboxParam = params.sandbox !== undefined;
  const sandboxId = typeof params.sandbox === "string" ? params.sandbox : null;
  let initialSandbox: SandboxInstance | null = null;
  let sandboxLinkError: string | null = null;

  if (hasSandboxParam) {
    if (!sandboxId || !UUID_PATTERN.test(sandboxId)) {
      sandboxLinkError = "This sandbox link is invalid. Open a sandbox from the Compute menu instead.";
    } else if (!user) {
      sandboxLinkError = "Your session expired before this sandbox could be opened. Sign in and try the link again.";
    } else {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("sandbox_instances")
        .select("*")
        .eq("id", sandboxId)
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (error) {
        console.error("[code] sandbox deep link lookup failed:", error.message);
        sandboxLinkError = "This sandbox could not be opened. Choose a sandbox from the Compute menu and try again.";
      } else if (!data) {
        sandboxLinkError = "This sandbox is unavailable or you no longer have access to it. Choose another sandbox from the Compute menu.";
      } else {
        initialSandbox = decorateSandboxRow(data);
      }
    }
  }

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
        <CodeWorkspaceRoute
          initialSandbox={initialSandbox}
          sandboxLinkError={sandboxLinkError}
        />
      </div>
    </>
  );
}
