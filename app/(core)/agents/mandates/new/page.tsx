import { redirect } from "next/navigation";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MandatesHeader } from "@/features/agents/mandates/components/MandatesHeader";
import { NewMandatePage } from "@/features/agents/mandates/authoring/NewMandatePage";

/**
 * /agents/mandates/new — create a mandate before its intelligence exists
 * (origin='user'): descriptive inputs, the goal, the output shape. The triad
 * is the page (features/agents/mandates/authoring/NewMandatePage.tsx).
 */
export default async function NewMandateRoute() {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) redirect("/agents");

  return (
    <>
      <PageHeader>
        <MandatesHeader />
      </PageHeader>
      <NewMandatePage />
    </>
  );
}
