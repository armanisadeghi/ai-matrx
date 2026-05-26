import { createSystemAgentFromSeed } from "@/lib/agents/actions";
import { TEMPLATE_DATA } from "@/features/agents/constants/local-agent-templates";
import { AutoSubmitForm } from "@/app/(core)/agents/new/manual/AutoSubmitForm";
import { DesktopBuilderSkeleton } from "@/features/agents/components/builder/AgentBuilderSkeletons";

export const metadata = { title: "Creating System Agent... | Admin" };

export default function NewManualSystemAgentPage() {
  async function create() {
    "use server";
    await createSystemAgentFromSeed(TEMPLATE_DATA);
  }

  return (
    <>
      <AutoSubmitForm action={create} />
      <DesktopBuilderSkeleton />
    </>
  );
}
