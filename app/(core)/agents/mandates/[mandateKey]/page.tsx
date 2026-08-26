import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MandatesHeader } from "@/features/agents/mandates/components/MandatesHeader";
import { MandateWorkspace } from "@/features/agents/mandates/workspace/MandateWorkspace";

/**
 * /agents/mandates/[mandateKey] — ONE mandate's workspace on its dedicated
 * route. The segment accepts the mandate KEY (podcast.multihost_script — dots
 * are legal path characters) or the row UUID (generic EntityRef doors pass
 * ids). The window-panel twin wraps the SAME MandateWorkspace — identical
 * functionality by construction (vision rule 3).
 */
export default async function MandateWorkspaceRoute({
  params,
}: {
  params: Promise<{ mandateKey: string }>;
}) {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");
  const { mandateKey } = await params;

  return (
    <>
      <PageHeader>
        <MandatesHeader />
      </PageHeader>
      <MandateWorkspace
        mandateKeyOrId={decodeURIComponent(mandateKey)}
        host="route"
      />
    </>
  );
}
